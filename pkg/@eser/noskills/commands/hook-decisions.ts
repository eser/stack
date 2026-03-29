// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Hook decision logic — pure functions for PreToolUse guards.
 *
 * Extracted from invoke-hook.ts so the decision logic can be
 * unit-tested without stdin/stdout plumbing.
 *
 * @module
 */

// =============================================================================
// noskills command detection (for pendingClear whitelist)
// =============================================================================

/** Check if a Bash command is a noskills/nos CLI command (control plane). */
export const isNoskillsCommand = (command: string): boolean => {
  const trimmed = command.trim();

  return trimmed.includes("noskills") ||
    trimmed.includes(" nos ") ||
    trimmed.endsWith(" nos") ||
    trimmed.startsWith("nos ");
};

// =============================================================================
// Git read-only subcommand detection
// =============================================================================

/**
 * Known read-only subcommands for git ops that share a write-op prefix.
 *
 * The git write guard blocks commands starting with "git stash", "git tag", etc.
 * But "git stash list" and "git tag -l" are read-only. This map lists the
 * first token after each prefix that indicates a read-only subcommand.
 */
const GIT_READ_SUBCOMMANDS: ReadonlyMap<string, readonly string[]> = new Map([
  ["git stash", ["list", "show"]],
  ["git tag", ["-l", "--list", "-v", "--verify"]],
  [
    "git branch",
    [
      "--list",
      "-l",
      "-a",
      "--all",
      "-r",
      "--remotes",
      "-v",
      "--verbose",
      "--contains",
      "--no-contains",
      "--merged",
      "--no-merged",
    ],
  ],
]);

/**
 * Check if a git command is actually read-only despite matching a write prefix.
 *
 * IMPORTANT: This checks a single command segment, not chained commands.
 * For chained commands ("git stash list && git stash drop"), the caller must
 * split on && / ; and check each segment independently.
 */
export const isGitReadOnly = (command: string): boolean => {
  const trimmed = command.trim();

  for (const [prefix, readSubs] of GIT_READ_SUBCOMMANDS) {
    if (trimmed.startsWith(prefix)) {
      const rest = trimmed.slice(prefix.length).trim();
      const nextToken = rest.split(/\s+/)[0] ?? "";

      if (readSubs.includes(nextToken)) return true;
    }
  }

  return false;
};
