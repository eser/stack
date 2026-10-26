// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Copilot CLI adapter — implements ToolAdapter for GitHub Copilot CLI,
 * generating AGENTS.md, copilot-instructions.md, hooks, agent profiles,
 * and MCP configuration.
 *
 * Copilot hooks use the `{"version": 1, "hooks": {"<event>": [...]}}` format
 * in `.github/hooks/noskills.json`. Agents are `.agent.md` files with YAML
 * frontmatter in `.github/agents/`. MCP servers are configured under
 * `mcpServers` in `.copilot/mcp.json`.
 *
 * @module
 */

import type * as adapter from "../adapter.ts";
import * as agentsMd from "./shared/agents-md.ts";
import * as copilot from "../copilot.ts";
import * as crossRuntime from "@eserstack/standards/cross-runtime";
import * as agentPrompts from "./shared/agent-prompts.ts";
import * as hookCommands from "../hook-commands.ts";

// =============================================================================
// File Paths
// =============================================================================

const HOOKS_DIR = ".github/hooks";
const HOOKS_FILE = "noskills.json";
const AGENTS_DIR = ".github/agents";
const MCP_DIR = ".copilot";
const MCP_FILE = "mcp.json";

// =============================================================================
// Hook Config
// =============================================================================
//
// `.github/hooks/noskills.json` follows Copilot CLI's hook file format: version
// 1 and, per camelCase event, a list of command hooks; `matcher` is a regular
// expression the whole tool name must match, and `timeoutSec` is in seconds
// (docs.github.com/en/copilot/reference/hooks-configuration). camelCase events
// send `toolName` and `toolArgs`, which `invoke-hook` reads.

type CopilotCliHookEntry = {
  readonly type: "command";
  readonly matcher?: string;
  readonly command: string;
  readonly timeoutSec: number;
};

// Copilot CLI's shell tools and the tools that write files.
const SHELL_TOOLS = "bash|powershell";
const FILE_TOOLS = "create|edit|str_replace_editor|apply_patch";

const entry = (
  commandPrefix: string,
  event: hookCommands.HookEvent,
  matcher?: string,
  args: readonly string[] = [],
): CopilotCliHookEntry => ({
  type: "command",
  ...(matcher === undefined ? {} : { matcher }),
  command: hookCommands.hookCommand(commandPrefix, event, args),
  timeoutSec: hookCommands.HOOK_TIMEOUT_SECONDS[event],
});

const buildHooks = (
  commandPrefix: string,
): Readonly<Record<string, readonly CopilotCliHookEntry[]>> => ({
  sessionStart: [
    entry(commandPrefix, "session-start", undefined, ["--tool=copilot-cli"]),
  ],
  preToolUse: [
    entry(commandPrefix, "pre-tool-use", `${SHELL_TOOLS}|${FILE_TOOLS}`),
  ],
  postToolUse: [
    entry(commandPrefix, "post-file-write", FILE_TOOLS),
    entry(commandPrefix, "post-bash", SHELL_TOOLS),
  ],
  agentStop: [entry(commandPrefix, "stop")],
});

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  value instanceof Object && !Array.isArray(value);

/**
 * The hook file after a sync. The user's entries in each event list stay,
 * without noskills' own. Keys whose value is not a list are dropped: earlier
 * noskills versions wrote their hooks there as named objects, which made
 * Copilot CLI reject the whole file.
 */
const mergeHooksFile = (
  existing: unknown,
  commandPrefix: string,
): Record<string, unknown> => {
  const file = isRecord(existing) ? existing : {};
  const existingHooks = isRecord(file["hooks"]) ? file["hooks"] : {};
  const userHooks: Record<string, unknown[]> = {};

  for (const [event, entries] of Object.entries(existingHooks)) {
    if (!Array.isArray(entries)) continue;

    const userEntries = entries.filter(
      (e: unknown) =>
        !(
          isRecord(e) &&
          ["command", "bash", "powershell"].some((key) =>
            hookCommands.isNoskillsHookCommand(e[key]),
          )
        ),
    );
    if (userEntries.length > 0) userHooks[event] = userEntries;
  }

  return {
    ...file,
    version: 1,
    hooks: hookCommands.mergeHookGroups(userHooks, buildHooks(commandPrefix)),
  };
};

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
    ...agentPrompts.EXECUTOR_SELF_CHECK,
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
    ...agentPrompts.VERIFIER_STEPS,
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

  syncRules: async (
    ctx: adapter.SyncContext,
    options?: adapter.SyncOptions,
  ): Promise<void> => {
    // 1. Generate AGENTS.md via shared helper
    await agentsMd.syncAgentsMd(ctx, options);

    // 2. Also generate .github/copilot-instructions.md via existing copilot module
    await copilot.sync(ctx.root, ctx.rules, ctx.commandPrefix);
  },

  syncHooks: async (
    ctx: adapter.SyncContext,
    _options?: adapter.SyncOptions,
  ): Promise<void> => {
    const hooksDir = `${ctx.root}/${HOOKS_DIR}`;
    const hooksPath = `${hooksDir}/${HOOKS_FILE}`;

    await crossRuntime.runtime.fs.mkdir(hooksDir, { recursive: true });

    let existing: unknown = {};
    try {
      existing = JSON.parse(
        await crossRuntime.runtime.fs.readTextFile(hooksPath),
      );
    } catch {
      // No file yet, or one that is not JSON: start from an empty one.
    }

    await crossRuntime.runtime.fs.writeTextFile(
      hooksPath,
      JSON.stringify(mergeHooksFile(existing, ctx.commandPrefix), null, 2) +
        "\n",
    );
  },

  syncAgents: async (
    ctx: adapter.SyncContext,
    _options?: adapter.SyncOptions,
  ): Promise<void> => {
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

  syncMcp: async (ctx: adapter.SyncContext): Promise<void> => {
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
