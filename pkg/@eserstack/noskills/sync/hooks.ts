// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Hook sync — generates `.claude/settings.json` with noskills hook commands.
 *
 * Instead of generating Node.js scripts (which break with ESM `"type": "module"`),
 * hooks invoke the noskills CLI directly:
 *
 *   {commandPrefix} invoke-hook pre-tool-use
 *   {commandPrefix} invoke-hook stop
 *   {commandPrefix} invoke-hook post-file-write
 *   {commandPrefix} invoke-hook post-bash
 *   {commandPrefix} invoke-hook post-ask-user-question
 *
 * The hook logic lives in `commands/invoke-hook.ts` — native Deno TypeScript,
 * testable, lintable, no `require()` issues. Each hook's timeout comes from
 * `hook-commands.ts`; PreToolUse gets 30 seconds, as long as the git
 * wrapper's check, because Claude Code lets the tool call go ahead when the
 * hook does not answer in time.
 *
 * @module
 */

import { runtime } from "@eserstack/standards/cross-runtime";
import * as hookCommands from "./hook-commands.ts";

// =============================================================================
// Settings.json generation
// =============================================================================

/** One Claude Code command hook, with its timeout in seconds. */
const hookEntry = (
  commandPrefix: string,
  event: hookCommands.HookEvent,
): { type: "command"; command: string; timeout: number } => ({
  type: "command",
  command: hookCommands.hookCommand(commandPrefix, event),
  timeout: hookCommands.HOOK_TIMEOUT_SECONDS[event],
});

const buildHooks = (
  commandPrefix: string,
): Readonly<Record<string, readonly unknown[]>> => ({
  PreToolUse: [
    {
      matcher: "Write|Edit|MultiEdit|Bash",
      hooks: [
        hookEntry(commandPrefix, "pre-tool-use"),
      ],
    },
  ],
  PostToolUse: [
    {
      matcher: "Write|Edit|MultiEdit",
      hooks: [
        hookEntry(commandPrefix, "post-file-write"),
      ],
    },
    {
      matcher: "Bash",
      hooks: [
        hookEntry(commandPrefix, "post-bash"),
      ],
    },
    {
      matcher: "AskUserQuestion",
      hooks: [
        hookEntry(commandPrefix, "post-ask-user-question"),
      ],
    },
  ],
  Stop: [
    {
      hooks: [
        hookEntry(commandPrefix, "stop"),
      ],
    },
  ],
  SessionStart: [
    {
      hooks: [
        hookEntry(commandPrefix, "session-start"),
      ],
    },
  ],
});

// =============================================================================
// Sync entry point
// =============================================================================

export const syncHooks = async (
  root: string,
  commandPrefix = "npx eser@latest noskills",
): Promise<void> => {
  const settingsPath = `${root}/.claude/settings.json`;

  // Read existing settings (preserve non-hook keys)
  let existingSettings: Record<string, unknown> = {};
  try {
    const content = await runtime.fs.readTextFile(settingsPath);
    existingSettings = JSON.parse(content) as Record<string, unknown>;
  } catch {
    // File doesn't exist yet
  }

  // Keep the other keys and the user's own hooks; replace noskills' hooks.
  const merged = {
    ...existingSettings,
    hooks: hookCommands.mergeHookGroups(
      hookCommands.userHookGroups(existingSettings["hooks"]),
      buildHooks(commandPrefix),
    ),
  };

  await runtime.fs.mkdir(`${root}/.claude`, { recursive: true });
  await runtime.fs.writeTextFile(
    settingsPath,
    JSON.stringify(merged, null, 2) + "\n",
  );
};

// Re-export for backward compatibility
export const syncHook = syncHooks;
