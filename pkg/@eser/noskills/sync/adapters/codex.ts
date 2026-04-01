// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Codex CLI adapter — implements ToolAdapter for OpenAI Codex CLI,
 * generating AGENTS.md, hooks, agent profiles, and MCP configuration.
 *
 * Codex hooks use PascalCase event names and a JSON array format in
 * `.codex/hooks.json`. Agents are TOML files in `.codex/agents/`.
 * MCP servers are registered under `[mcp_servers.<name>]` in
 * `.codex/config.toml`.
 *
 * @module
 */

import type * as adapter from "../adapter.ts";
import * as agentsMd from "./shared/agents-md.ts";
import * as crossRuntime from "@eser/standards/cross-runtime";

// =============================================================================
// File Paths
// =============================================================================

const HOOKS_DIR = ".codex";
const HOOKS_FILE = "hooks.json";
const AGENTS_DIR = ".codex/agents";
const CONFIG_FILE = ".codex/config.toml";

// =============================================================================
// Hook Config Types
// =============================================================================

type CodexHook = {
  readonly _noskills?: boolean;
  readonly event: string;
  readonly command: string;
  readonly timeout: number;
};

type CodexHooksConfig = {
  hooks: CodexHook[];
};

// =============================================================================
// Hooks Content Generator
// =============================================================================

const buildHooksConfig = (commandPrefix: string): CodexHooksConfig => ({
  hooks: [
    {
      _noskills: true,
      event: "SessionStart",
      command: `${commandPrefix} invoke-hook session-start`,
      timeout: 5000,
    },
    {
      _noskills: true,
      event: "PreToolUse",
      command: `${commandPrefix} invoke-hook pre-tool-use`,
      timeout: 5000,
    },
    {
      _noskills: true,
      event: "PostToolUse",
      command: `${commandPrefix} invoke-hook post-file-write`,
      timeout: 3000,
    },
    {
      _noskills: true,
      event: "Stop",
      command: `${commandPrefix} invoke-hook stop`,
      timeout: 10000,
    },
  ],
});

// =============================================================================
// Agent Content Generators (TOML format)
// =============================================================================

const buildExecutorAgentToml = (commandPrefix: string): string => {
  const instructions = [
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
    '{"completed": ["<item IDs done>"], "remaining": ["<item IDs not done>"],',
    ' "blocked": ["<item IDs needing decisions>"], "filesModified": ["<paths>"],',
    ' "verification": {"typeCheck": "pass|fail", "tests": "pass|fail"}}',
    "",
    "Do NOT return raw test output — summarize it in the verification field.",
    `The orchestrator will submit this to \`${commandPrefix} next --answer\` on your behalf.`,
  ].join("\n");

  const lines = [
    'name = "noskills-executor"',
    'description = "Executes a single noskills task. Follows spec behavioral rules and reports structured results."',
    `developer_instructions = """`,
    instructions,
    `"""`,
    "",
  ];

  return lines.join("\n");
};

const buildVerifierAgentToml = (): string => {
  const instructions = [
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
    '{"results": [{"id": "ac-1", "status": "PASS", "evidence": "..."},',
    ' {"id": "ac-2", "status": "FAIL", "reason": "..."}]}',
    "",
    "The orchestrator will use this report for the noskills status report.",
  ].join("\n");

  const lines = [
    'name = "noskills-verifier"',
    'description = "Independently verifies completed task work. Read-only. Never sees the executor\'s context."',
    `developer_instructions = """`,
    instructions,
    `"""`,
    "",
  ];

  return lines.join("\n");
};

// =============================================================================
// MCP Config Generator
// =============================================================================

const buildMcpToml = (commandPrefix: string): string => {
  const parts = commandPrefix.split(/\s+/);
  const command = parts[0] ?? "npx";
  const args = [...parts.slice(1), "mcp-serve"].map((a) => `"${a}"`).join(
    ", ",
  );

  return `[mcp_servers.noskills]\ncommand = "${command}"\nargs = [${args}]\n`;
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

export const codexAdapter: adapter.ToolAdapter = {
  id: "codex",

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
      subAgentMethod: "spawn",
    },
  },

  async syncRules(
    ctx: adapter.SyncContext,
    options?: adapter.SyncOptions,
  ): Promise<void> {
    await agentsMd.syncAgentsMd(ctx, options);
  },

  async syncHooks(
    ctx: adapter.SyncContext,
    _options?: adapter.SyncOptions,
  ): Promise<void> {
    const hooksDir = `${ctx.root}/${HOOKS_DIR}`;
    const hooksPath = `${hooksDir}/${HOOKS_FILE}`;

    await crossRuntime.runtime.fs.mkdir(hooksDir, { recursive: true });

    // Read existing hooks config (preserve non-noskills hooks)
    let existingHooks: CodexHook[] = [];
    try {
      const content = await crossRuntime.runtime.fs.readTextFile(hooksPath);
      const parsed = JSON.parse(content) as CodexHooksConfig;
      if (Array.isArray(parsed.hooks)) {
        existingHooks = parsed.hooks;
      }
    } catch {
      // File doesn't exist yet
    }

    // Filter out previous noskills-managed hooks, keep user hooks
    const userHooks = existingHooks.filter(
      (h) => !(h as { _noskills?: boolean })._noskills,
    );

    // Build fresh noskills hooks and merge
    const noskillsConfig = buildHooksConfig(ctx.commandPrefix);
    const merged: CodexHooksConfig = {
      hooks: [...userHooks, ...noskillsConfig.hooks],
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

    // 1. Executor agent (TOML)
    await crossRuntime.runtime.fs.writeTextFile(
      `${agentsDir}/noskills-executor.toml`,
      buildExecutorAgentToml(ctx.commandPrefix),
    );

    // 2. Verifier agent (TOML, read-only)
    await crossRuntime.runtime.fs.writeTextFile(
      `${agentsDir}/noskills-verifier.toml`,
      buildVerifierAgentToml(),
    );
  },

  async syncMcp(
    ctx: adapter.SyncContext,
  ): Promise<void> {
    const configPath = `${ctx.root}/${CONFIG_FILE}`;
    await crossRuntime.runtime.fs.mkdir(`${ctx.root}/.codex`, {
      recursive: true,
    });

    let existing = "";
    if (await fileExists(configPath)) {
      try {
        existing = await crossRuntime.runtime.fs.readTextFile(configPath);
      } catch {
        // Malformed file — start fresh
      }
    }

    // Remove existing [mcp_servers.noskills] section if present, then append
    const cleaned = existing.replace(
      /\[mcp_servers\.noskills\][\s\S]*?(?=\[|$)/,
      "",
    ).trimEnd();
    const mcpSection = buildMcpToml(ctx.commandPrefix);
    const merged = cleaned + (cleaned.length > 0 ? "\n\n" : "") + mcpSection;

    await crossRuntime.runtime.fs.writeTextFile(configPath, merged);
  },
};
