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
 *
 * The hook logic lives in `commands/invoke-hook.ts` — native Deno TypeScript,
 * testable, lintable, no `require()` issues.
 *
 * @module
 */

import { runtime } from "@eser/standards/cross-runtime";

// =============================================================================
// Settings.json generation
// =============================================================================

const buildSettings = (commandPrefix: string): Record<string, unknown> => ({
  hooks: {
    PreToolUse: [
      {
        matcher: "Write|Edit|MultiEdit|Bash",
        hooks: [
          {
            type: "command",
            command: `${commandPrefix} invoke-hook pre-tool-use`,
            timeout: 5,
          },
        ],
      },
    ],
    PostToolUse: [
      {
        matcher: "Write|Edit|MultiEdit",
        hooks: [
          {
            type: "command",
            command: `${commandPrefix} invoke-hook post-file-write`,
            timeout: 3,
          },
        ],
      },
      {
        matcher: "Bash",
        hooks: [
          {
            type: "command",
            command: `${commandPrefix} invoke-hook post-bash`,
            timeout: 3,
          },
        ],
      },
    ],
    Stop: [
      {
        hooks: [
          {
            type: "command",
            command: `${commandPrefix} invoke-hook stop`,
            timeout: 10,
          },
        ],
      },
    ],
  },
});

// =============================================================================
// Sync entry point
// =============================================================================

export const syncHooks = async (
  root: string,
  commandPrefix = "npx eser noskills",
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

  // Merge: keep existing keys, overwrite hooks
  const newHooks = buildSettings(commandPrefix);
  const merged = { ...existingSettings, ...newHooks };

  await runtime.fs.mkdir(`${root}/.claude`, { recursive: true });
  await runtime.fs.writeTextFile(
    settingsPath,
    JSON.stringify(merged, null, 2) + "\n",
  );
};

// Re-export for backward compatibility
export const syncHook = syncHooks;
