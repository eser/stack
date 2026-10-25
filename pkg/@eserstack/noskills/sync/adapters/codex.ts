// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Codex CLI adapter — implements ToolAdapter for OpenAI Codex CLI,
 * generating AGENTS.md, hooks, agent profiles, and MCP configuration.
 *
 * Codex hooks use PascalCase event names and matcher groups in
 * `.codex/hooks.json`. Agents are TOML files in `.codex/agents/`.
 * MCP servers are registered under `[mcp_servers.<name>]` in
 * `.codex/config.toml`.
 *
 * @module
 */

import type * as adapter from "../adapter.ts";
import * as agentsMd from "./shared/agents-md.ts";
import * as crossRuntime from "@eserstack/standards/cross-runtime";
import * as agentPrompts from "./shared/agent-prompts.ts";
import * as hookCommands from "../hook-commands.ts";

// =============================================================================
// File Paths
// =============================================================================

const HOOKS_DIR = ".codex";
const HOOKS_FILE = "hooks.json";
const AGENTS_DIR = ".codex/agents";
const CONFIG_FILE = ".codex/config.toml";

// =============================================================================
// Hook Config
// =============================================================================
//
// `.codex/hooks.json` maps each event to matcher groups, and each group holds
// the command handlers that run when its matcher matches the tool name
// (developers.openai.com/codex/hooks, "Config shape"). Codex reports shell
// commands and exec_command as Bash and file edits as apply_patch, with the
// command or the patch text in `tool_input.command` ("PreToolUse"). Timeouts
// are in seconds.

type CodexHookHandler = {
  readonly type: "command";
  readonly command: string;
  readonly timeout: number;
};

type CodexMatcherGroup = {
  readonly matcher?: string;
  readonly hooks: readonly CodexHookHandler[];
};

const handler = (
  commandPrefix: string,
  event: hookCommands.HookEvent,
): CodexHookHandler => ({
  type: "command",
  command: hookCommands.hookCommand(commandPrefix, event),
  timeout: hookCommands.HOOK_TIMEOUT_SECONDS[event],
});

const buildHooks = (
  commandPrefix: string,
): Readonly<Record<string, readonly CodexMatcherGroup[]>> => ({
  SessionStart: [{ hooks: [handler(commandPrefix, "session-start")] }],
  PreToolUse: [
    {
      matcher: "^(Bash|apply_patch)$",
      hooks: [handler(commandPrefix, "pre-tool-use")],
    },
  ],
  PostToolUse: [
    {
      matcher: "^apply_patch$",
      hooks: [handler(commandPrefix, "post-file-write")],
    },
    { matcher: "^Bash$", hooks: [handler(commandPrefix, "post-bash")] },
  ],
  Stop: [{ hooks: [handler(commandPrefix, "stop")] }],
});

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  value instanceof Object && !Array.isArray(value);

/**
 * The hooks of an existing `.codex/hooks.json` that are not noskills', by
 * event (`hookCommands.userHookGroups`). Earlier noskills versions wrote a
 * list of `{event, command}` entries there, which Codex does not read; the
 * user's entries in such a list become matcher groups.
 */
const userHooksOf = (hooks: unknown): Record<string, unknown[]> => {
  if (!Array.isArray(hooks)) return hookCommands.userHookGroups(hooks);

  const kept: Record<string, unknown[]> = {};
  for (const entry of hooks) {
    if (!isRecord(entry) || entry["_noskills"] === true) continue;

    const event = entry["event"];
    const command = entry["command"];
    if (typeof event === "string" && typeof command === "string") {
      (kept[event] ??= []).push({ hooks: [{ type: "command", command }] });
    }
  }

  return kept;
};

/**
 * The hooks file after a sync: the user's hooks and the file's other
 * top-level keys as they were, and noskills' hooks after the user's in each
 * event.
 */
const mergeHooksFile = (
  existing: unknown,
  commandPrefix: string,
): Record<string, unknown> => {
  const file = isRecord(existing) ? existing : {};

  return {
    ...file,
    hooks: hookCommands.mergeHookGroups(
      userHooksOf(file["hooks"]),
      buildHooks(commandPrefix),
    ),
  };
};

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
    ...agentPrompts.EXECUTOR_SELF_CHECK,
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
    ...agentPrompts.VERIFIER_STEPS,
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

/**
 * A TOML basic string: backslashes, quotes and control characters escaped,
 * so a command prefix with a Windows path or a quote stays valid TOML.
 */
const tomlString = (value: string): string =>
  `"${
    // Control characters are what the class matches, on purpose.
    // deno-lint-ignore no-control-regex
    value.replace(/[\\"\u0000-\u001f\u007f]/g, (c) => {
      switch (c) {
        case "\\":
          return "\\\\";
        case '"':
          return '\\"';
        case "\n":
          return "\\n";
        case "\t":
          return "\\t";
        case "\r":
          return "\\r";
        default:
          return `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`;
      }
    })
  }"`;

const buildMcpToml = (commandPrefix: string): string => {
  const parts = commandPrefix.split(/\s+/);
  const command = parts[0] ?? "npx";
  const args = [...parts.slice(1), "mcp-serve"].map(tomlString).join(", ");

  return `[mcp_servers.noskills]\ncommand = ${tomlString(
    command,
  )}\nargs = [${args}]\n`;
};

// A TOML table header line: `[name]` or `[[name]]` with a bare or dotted key,
// and an optional comment. Array values that start a line, such as `[1, 2]`,
// hold commas or quotes the key pattern refuses.
const TOML_HEADER = /^\s*\[\[?\s*([A-Za-z0-9_.-]+)\s*\]\]?\s*(?:#.*)?$/;
const NOSKILLS_MCP_TABLE = "mcp_servers.noskills";

/**
 * `toml` without the `[mcp_servers.noskills]` table and its sub-tables: the
 * lines from that header up to the next table header. Every other line stays
 * as it was.
 */
export const withoutNoskillsMcpTable = (toml: string): string => {
  let inNoskills = false;

  return toml
    .split("\n")
    .filter((line) => {
      const header = TOML_HEADER.exec(line);

      if (header !== null) {
        const name = header[1] ?? "";
        inNoskills =
          name === NOSKILLS_MCP_TABLE ||
          name.startsWith(`${NOSKILLS_MCP_TABLE}.`);
      }

      return !inNoskills;
    })
    .join("\n");
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

  syncRules: async (
    ctx: adapter.SyncContext,
    options?: adapter.SyncOptions,
  ): Promise<void> => {
    await agentsMd.syncAgentsMd(ctx, options);
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

  syncMcp: async (ctx: adapter.SyncContext): Promise<void> => {
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

    // Replace the [mcp_servers.noskills] table if present, then append it.
    const cleaned = withoutNoskillsMcpTable(existing).trimEnd();
    const mcpSection = buildMcpToml(ctx.commandPrefix);
    const merged = cleaned + (cleaned.length > 0 ? "\n\n" : "") + mcpSection;

    await crossRuntime.runtime.fs.writeTextFile(configPath, merged);
  },
};
