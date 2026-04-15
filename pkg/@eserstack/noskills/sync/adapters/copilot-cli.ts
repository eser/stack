// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Copilot CLI adapter — implements ToolAdapter for GitHub Copilot CLI,
 * generating AGENTS.md, copilot-instructions.md, hooks, agent profiles,
 * and MCP configuration.
 *
 * Copilot hooks use `{"version": 1, "hooks": {...}}` format in
 * `.github/hooks/noskills.json`. Agents are `.agent.md` files with YAML
 * frontmatter in `.github/agents/`. MCP servers are configured under
 * `mcpServers` in `.copilot/mcp.json`.
 *
 * @module
 */

import type * as adapter from "../adapter.ts";
import * as agentsMd from "./shared/agents-md.ts";
import * as copilot from "../copilot.ts";
import * as crossRuntime from "@eserstack/standards/cross-runtime";

// =============================================================================
// File Paths
// =============================================================================

const HOOKS_DIR = ".github/hooks";
const HOOKS_FILE = "noskills.json";
const AGENTS_DIR = ".github/agents";
const MCP_DIR = ".copilot";
const MCP_FILE = "mcp.json";

// =============================================================================
// Hook Config Types
// =============================================================================

type CopilotCliHookEntry = {
  readonly _noskills?: boolean;
  readonly command: readonly string[];
  readonly timeoutSec: number;
};

type CopilotCliHooksConfig = {
  readonly version: 1;
  hooks: Record<string, CopilotCliHookEntry>;
};

// =============================================================================
// Hooks Content Generator
// =============================================================================

const buildHooksConfig = (
  commandPrefix: string,
): CopilotCliHooksConfig => ({
  version: 1,
  hooks: {
    "noskills:sessionStart": {
      _noskills: true,
      command: ["bash", "-c", `${commandPrefix} invoke-hook session-start`],
      timeoutSec: 5,
    },
    "noskills:preToolUse": {
      _noskills: true,
      command: ["bash", "-c", `${commandPrefix} invoke-hook pre-tool-use`],
      timeoutSec: 5,
    },
    "noskills:postToolUse": {
      _noskills: true,
      command: [
        "bash",
        "-c",
        `${commandPrefix} invoke-hook post-file-write`,
      ],
      timeoutSec: 3,
    },
    "noskills:agentStop": {
      _noskills: true,
      command: ["bash", "-c", `${commandPrefix} invoke-hook stop`],
      timeoutSec: 10,
    },
  },
});

// =============================================================================
// Agent Content Generators (.agent.md with YAML frontmatter)
// =============================================================================

const buildExecutorAgentMd = (commandPrefix: string): string => {
  const lines = [
    "---",
    "name: noskills-executor",
    'description: "Executes a single noskills task. Follows spec behavioral rules and reports structured results."',
    "tools:",
    "  - read",
    "  - write",
    "  - glob",
    "  - grep",
    "  - shell",
    "---",
    "",
    "You are executing a single task from a noskills spec.",
    "Your ONLY job is to complete the task described in the prompt.",
    "Follow all behavioral rules provided in the prompt.",
    "Do NOT start new tasks, explore unrelated code, or make architectural decisions.",
    "If the task is too vague to execute, say so immediately.",
    "",
    "## Self-Verification",
    "After completing the task, you MUST verify your own work before reporting:",
    "1. Run type check: `deno check` on all modified files",
    "2. Run test suite: `deno test` on the relevant test files",
    "3. If type check or tests fail, fix the issues before reporting",
    "",
    "## Reporting",
    "When finished, provide a structured JSON summary:",
    "```json",
    '{"completed": ["<item IDs done>"], "remaining": ["<item IDs not done>"], "blocked": ["<item IDs needing decisions>"], "filesModified": ["<paths>"], "verification": {"typeCheck": "pass|fail", "tests": "pass|fail (N passed, M failed)"}}',
    "```",
    "",
    "Do NOT return raw test output — summarize it in the verification field.",
    `The orchestrator will submit this to \`${commandPrefix} next --answer\` on your behalf.`,
    "",
  ];

  return lines.join("\n");
};

const buildVerifierAgentMd = (): string => {
  const lines = [
    "---",
    "name: noskills-verifier",
    'description: "Independently verifies completed task work. Read-only. Never sees the executor\'s context."',
    "tools:",
    "  - read",
    "  - glob",
    "  - grep",
    "  - shell",
    "---",
    "",
    "You are verifying another agent's work. You have NO context about how it was done.",
    "Read the changed files. Run the test suite. Check each acceptance criterion independently.",
    "",
    "For each acceptance criterion:",
    "- PASS: with evidence — show the grep result, the test output, or the file content that proves it",
    "- FAIL: with specific reason — what's missing, what's wrong, what doesn't match",
    "",
    "Be skeptical. Don't assume anything works — verify it yourself.",
    "You CANNOT edit files. Read-only access only.",
    "",
    "## Verification Steps",
    "1. Read each modified file and verify the changes are correct",
    "2. Run type check: `deno check` on modified files",
    "3. Run tests: `deno test` on relevant test files",
    "4. Check each acceptance criterion against actual file contents",
    "",
    "## Report Format",
    "When finished, provide a structured JSON summary:",
    "```json",
    '{"results": [{"id": "ac-1", "status": "PASS", "evidence": "..."}, {"id": "ac-2", "status": "FAIL", "reason": "..."}]}',
    "```",
    "",
    "The orchestrator will use this report for the noskills status report.",
    "",
  ];

  return lines.join("\n");
};

// =============================================================================
// MCP Config Types
// =============================================================================

type CopilotCliMcpEntry = {
  readonly type: "local";
  readonly command: string;
  readonly args: readonly string[];
  readonly tools?: readonly string[];
};

type CopilotCliMcpConfig = {
  mcpServers: Record<string, CopilotCliMcpEntry>;
};

// =============================================================================
// MCP Config Generator
// =============================================================================

const buildMcpConfig = (commandPrefix: string): CopilotCliMcpConfig => {
  const parts = commandPrefix.split(/\s+/);
  const command = parts[0] ?? "npx";
  const args = [...parts.slice(1), "mcp-serve"];

  return {
    mcpServers: {
      noskills: {
        type: "local",
        command,
        args,
        tools: ["*"],
      },
    },
  };
};

// =============================================================================
// File Helpers
// =============================================================================

const fileExists = async (path: string): Promise<boolean> => {
  try {
    await crossRuntime.runtime.fs.stat(path);
    return true;
  } catch {
    return false;
  }
};

// =============================================================================
// Adapter
// =============================================================================

export const copilotCliAdapter: adapter.ToolAdapter = {
  id: "copilot-cli",

  capabilities: {
    rules: true,
    hooks: true,
    agents: true,
    specs: false,
    mcp: true,
    interaction: {
      hasAskUserTool: false,
      optionPresentation: "prose",
      hasSubAgentDelegation: true,
      subAgentMethod: "fleet",
    },
  },

  async syncRules(
    ctx: adapter.SyncContext,
    options?: adapter.SyncOptions,
  ): Promise<void> {
    // 1. Generate AGENTS.md via shared helper
    await agentsMd.syncAgentsMd(ctx, options);

    // 2. Also generate .github/copilot-instructions.md via existing copilot module
    await copilot.sync(ctx.root, ctx.rules, ctx.commandPrefix);
  },

  async syncHooks(
    ctx: adapter.SyncContext,
    _options?: adapter.SyncOptions,
  ): Promise<void> {
    const hooksDir = `${ctx.root}/${HOOKS_DIR}`;
    const hooksPath = `${hooksDir}/${HOOKS_FILE}`;

    await crossRuntime.runtime.fs.mkdir(hooksDir, { recursive: true });

    // Read existing hooks config (preserve non-noskills hooks)
    let existingHooks: Record<string, CopilotCliHookEntry> = {};
    try {
      const content = await crossRuntime.runtime.fs.readTextFile(hooksPath);
      const parsed = JSON.parse(content) as CopilotCliHooksConfig;
      if (parsed.hooks !== undefined && parsed.hooks !== null) {
        existingHooks = parsed.hooks;
      }
    } catch {
      // File doesn't exist yet
    }

    // Filter out previous noskills-managed hooks, keep user hooks
    const userHooks: Record<string, CopilotCliHookEntry> = {};
    for (const [key, hook] of Object.entries(existingHooks)) {
      if (!(hook as { _noskills?: boolean })._noskills) {
        userHooks[key] = hook;
      }
    }

    // Build fresh noskills hooks and merge
    const noskillsConfig = buildHooksConfig(ctx.commandPrefix);
    const merged: CopilotCliHooksConfig = {
      version: 1,
      hooks: {
        ...userHooks,
        ...noskillsConfig.hooks,
      },
    };

    await crossRuntime.runtime.fs.writeTextFile(
      hooksPath,
      JSON.stringify(merged, null, 2) + "\n",
    );
  },

  async syncAgents(
    ctx: adapter.SyncContext,
    _options?: adapter.SyncOptions,
  ): Promise<void> {
    const agentsDir = `${ctx.root}/${AGENTS_DIR}`;
    await crossRuntime.runtime.fs.mkdir(agentsDir, { recursive: true });

    // 1. Executor agent
    await crossRuntime.runtime.fs.writeTextFile(
      `${agentsDir}/noskills-executor.agent.md`,
      buildExecutorAgentMd(ctx.commandPrefix),
    );

    // 2. Verifier agent (read-only)
    await crossRuntime.runtime.fs.writeTextFile(
      `${agentsDir}/noskills-verifier.agent.md`,
      buildVerifierAgentMd(),
    );
  },

  async syncMcp(
    ctx: adapter.SyncContext,
  ): Promise<void> {
    const mcpDir = `${ctx.root}/${MCP_DIR}`;
    const mcpPath = `${mcpDir}/${MCP_FILE}`;

    await crossRuntime.runtime.fs.mkdir(mcpDir, { recursive: true });

    // Read existing MCP config (preserve non-noskills servers)
    let existing: CopilotCliMcpConfig = { mcpServers: {} };
    if (await fileExists(mcpPath)) {
      try {
        const content = await crossRuntime.runtime.fs.readTextFile(mcpPath);
        const parsed = JSON.parse(content) as CopilotCliMcpConfig;
        if (parsed.mcpServers !== undefined && parsed.mcpServers !== null) {
          existing = parsed;
        }
      } catch {
        // Malformed JSON — start fresh
      }
    }

    // Build fresh noskills MCP entry and merge
    const noskillsConfig = buildMcpConfig(ctx.commandPrefix);
    const merged: CopilotCliMcpConfig = {
      ...existing,
      mcpServers: {
        ...existing.mcpServers,
        ...noskillsConfig.mcpServers,
      },
    };

    await crossRuntime.runtime.fs.writeTextFile(
      mcpPath,
      JSON.stringify(merged, null, 2) + "\n",
    );
  },
};
