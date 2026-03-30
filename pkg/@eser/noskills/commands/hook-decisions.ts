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
// noskills command detection (control plane whitelist)
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
// Git Allowlist — read-only commands only
// =============================================================================

/** Allowed git subcommands (unconditionally read-only operations). */
const GIT_ALLOWED_SUBCOMMANDS: ReadonlySet<string> = new Set([
  "log",
  "diff",
  "status",
  "show",
  "blame",
  "rev-parse",
  "ls-files",
  "ls-tree",
  "cat-file",
  "describe",
  "shortlog",
  "name-rev",
  "for-each-ref",
  "rev-list",
  "help",
  "version",
]);

/**
 * Conditionally allowed subcommands: read-only ONLY with specific next tokens.
 *
 * Map key = subcommand, value = set of read-only first-arg patterns.
 * If the next token after the subcommand is in the set, the command is allowed.
 * If there is no next token (bare subcommand), it is blocked unless "" is in set.
 */
const GIT_CONDITIONAL_READS: ReadonlyMap<string, ReadonlySet<string>> = new Map(
  [
    // "git branch" alone (list) is read — but write flags block it
    [
      "branch",
      new Set([
        "",
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
      ]),
    ],
    // "git tag" alone (list) is read — creating/deleting tags is write
    ["tag", new Set(["", "-l", "--list", "-v", "--verify", "-n"])],
    // "git stash" alone is WRITE (push). Only list/show are reads.
    ["stash", new Set(["list", "show"])],
    // "git remote" alone (list) is read — add/remove/rename are write
    [
      "remote",
      new Set(["", "-v", "--verbose", "show", "get-url"]),
    ],
    // "git config" alone is ambiguous; with --get/--list/--get-all it reads
    [
      "config",
      new Set([
        "--get",
        "--get-all",
        "--get-regexp",
        "--list",
        "-l",
        "--global",
        "--local",
        "--system",
      ]),
    ],
    // "git reflog" alone is read — expire/delete are write
    ["reflog", new Set(["", "show"])],
  ],
);

/**
 * Check if a git command string is allowed (read-only).
 * Returns true if allowed, false if it should be blocked.
 *
 * IMPORTANT: This checks a single command segment, not chained commands.
 * The caller must split on `&&` / `;` and check each segment independently.
 */
export const isGitAllowed = (command: string): boolean => {
  const trimmed = command.trim();

  // Must start with "git"
  if (!trimmed.startsWith("git")) return true; // not a git command at all

  const afterGit = trimmed.slice(3).trim();
  if (afterGit.length === 0) return true; // just "git" alone — shows help

  // Extract subcommand (first token after "git")
  const tokens = afterGit.split(/\s+/);
  const subcommand = tokens[0] ?? "";

  // Check unconditional allowlist
  if (GIT_ALLOWED_SUBCOMMANDS.has(subcommand)) {
    return true;
  }

  // Check conditional reads
  const readTokens = GIT_CONDITIONAL_READS.get(subcommand);
  if (readTokens !== undefined) {
    const nextToken = tokens[1] ?? "";
    if (readTokens.has(nextToken)) return true;
  }

  // Not in allowlist -> blocked
  return false;
};

// Keep backward-compat alias
export const isGitReadOnly = isGitAllowed;

// =============================================================================
// Git bypass detection
// =============================================================================

/**
 * Check if a bash command contains a git write operation via subshell
 * bypasses (bash -c, sh -c, eval, pipes, command substitution).
 *
 * Complements isGitAllowed which only checks direct segments.
 */
export const containsGitWriteBypass = (command: string): boolean => {
  // Extract inner commands from subshell patterns
  const subshellPatterns = [
    /(?:bash|sh|\/bin\/bash|\/bin\/sh)\s+-c\s+["'](.+?)["']/g,
    /(?:bash|sh|\/bin\/bash|\/bin\/sh)\s+-c\s+(\S+)/g,
    /eval\s+["'](.+?)["']/g,
  ];

  for (const pattern of subshellPatterns) {
    let match;
    while ((match = pattern.exec(command)) !== null) {
      const inner = match[1] ?? "";
      if (inner.includes("git") && !isGitAllowed(inner)) {
        return true;
      }
    }
  }

  // Check for git in pipe chains: "something | git write-op"
  const segments = command.split(/\s*\|\s*/);
  for (const seg of segments) {
    const trimSeg = seg.trim();
    if (trimSeg.startsWith("git") && !isGitAllowed(trimSeg)) {
      return true;
    }
  }

  // Aggressive: catch $(git commit), `git commit`, echo | git commit
  const gitMentions = command.matchAll(/\bgit\s+([\w-]+)/g);
  for (const m of gitMentions) {
    const sub = m[1] ?? "";
    if (
      !GIT_ALLOWED_SUBCOMMANDS.has(sub) &&
      !GIT_CONDITIONAL_READS.has(sub)
    ) {
      return true;
    }
    // For conditional subcommands, check the context more carefully
    if (GIT_CONDITIONAL_READS.has(sub)) {
      // Extract the full git command from context
      const idx = m.index ?? 0;
      const rest = command.slice(idx);
      if (!isGitAllowed(rest.split(/[;&|$)`]/)[0] ?? "")) {
        return true;
      }
    }
  }

  return false;
};
