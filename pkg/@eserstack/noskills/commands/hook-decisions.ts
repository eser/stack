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
        "--show-current",
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

/** Git global flags that consume the next argument. */
const GIT_GLOBAL_FLAGS_WITH_ARG: ReadonlySet<string> = new Set([
  "-C",
  "-c",
  "--git-dir",
  "--work-tree",
  "--namespace",
  "--super-prefix",
  "--config-env",
]);

/** Git global flags that are standalone (no argument). */
const GIT_GLOBAL_FLAGS_NO_ARG: ReadonlySet<string> = new Set([
  "--no-replace-objects",
  "--bare",
  "--no-optional-locks",
  "--literal-pathspecs",
  "--glob-pathspecs",
  "--noglob-pathspecs",
  "--icase-pathspecs",
  "--no-pager",
  "--paginate",
]);

/**
 * Extract the real git subcommand, skipping global flags.
 * e.g. "git -C /path log --oneline" → "log"
 *      "git --git-dir=/foo status" → "status"
 *      "git commit -m test" → "commit"
 */
const extractGitSubcommand = (tokens: readonly string[]): string | null => {
  let i = 0;
  while (i < tokens.length) {
    const arg = tokens[i]!;

    // Flags with separate argument: -C /path, -c key=val, --git-dir /path
    if (GIT_GLOBAL_FLAGS_WITH_ARG.has(arg)) {
      i += 2; // skip flag + its value
      continue;
    }

    // Flags without argument
    if (GIT_GLOBAL_FLAGS_NO_ARG.has(arg)) {
      i += 1;
      continue;
    }

    // Flags with =value form: --git-dir=/path, --work-tree=/path, -c key=val
    if (
      arg.startsWith("--git-dir=") ||
      arg.startsWith("--work-tree=") ||
      arg.startsWith("--namespace=") ||
      arg.startsWith("--super-prefix=") ||
      arg.startsWith("--config-env=")
    ) {
      i += 1;
      continue;
    }

    // -C/path (no space) — -C with value appended
    if (arg.startsWith("-C") && arg.length > 2) {
      i += 1;
      continue;
    }

    // -c with value appended: -ckey=val
    if (arg.startsWith("-c") && arg.length > 2 && arg.includes("=")) {
      i += 1;
      continue;
    }

    // First non-flag token is the subcommand
    return arg;
  }
  return null;
};

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

  // Extract subcommand, skipping global flags like -C, --git-dir, etc.
  const tokens = afterGit.split(/\s+/);
  const subcommand = extractGitSubcommand(tokens) ?? "";

  // Check unconditional allowlist
  if (GIT_ALLOWED_SUBCOMMANDS.has(subcommand)) {
    return true;
  }

  // Check conditional reads
  const readTokens = GIT_CONDITIONAL_READS.get(subcommand);
  if (readTokens !== undefined) {
    const subcommandIdx = tokens.indexOf(subcommand);
    const nextToken = (subcommandIdx >= 0 && subcommandIdx + 1 < tokens.length)
      ? tokens[subcommandIdx + 1]!
      : "";
    if (readTokens.has(nextToken)) return true;
  }

  // Not in allowlist -> blocked
  return false;
};

// Keep backward-compat alias
export const isGitReadOnly = isGitAllowed;

// =============================================================================
// Git invocation extraction — multi-line / subshell aware
// =============================================================================

/**
 * Extract every `git <subcommand> …` fragment from a bash command string,
 * handling multi-line scripts, `&&`/`||`/`;` chains, `$(git …)`, and
 * backtick substitutions.
 *
 * Each returned string is suitable for passing to `isGitAllowed()`.
 *
 * Examples:
 *   `_B=$(git branch --show-current)` → ["git branch --show-current"]
 *   `git log\ngit status`             → ["git log", "git status"]
 *   `git log | grep feat`             → ["git log"]
 *   `echo "git is great"`             → []  (quoted — not a command)
 */
export const extractGitInvocations = (command: string): readonly string[] => {
  const invocations: string[] = [];

  // Phase 1: split on shell-level separators to isolate logical phrases.
  // Handles: newlines (multi-line scripts), &&, ||, ;
  const phrases = command.split(/\s*(?:&&|\|\||;|\n)\s*/);

  for (const phrase of phrases) {
    const trimmed = phrase.trim();
    if (trimmed.length === 0 || !trimmed.includes("git")) continue;

    // Phase 2: find every git occurrence within the phrase, including those
    // inside $() or `` subshells, or after variable assignments.
    // Only match when "git" is preceded by start-of-string, whitespace, (, $, or `.
    // This prevents matching ".git", "--git-dir", or "git" inside quoted strings.
    const gitFragments = trimmed.matchAll(/(?:^|[\s($`])git\b/g);
    for (const m of gitFragments) {
      const matchStr = m[0]!;
      const gitOffset = matchStr.indexOf("git");
      const idx = (m.index ?? 0) + gitOffset;
      const rest = trimmed.slice(idx);
      // Stop at shell meta-characters that end the git command
      const fragment = (rest.split(/[;&|$)`'"]/)[0] ?? rest).trim();
      if (fragment.startsWith("git")) {
        invocations.push(fragment);
      }
    }
  }

  return invocations;
};

// =============================================================================
// Git bypass detection
// =============================================================================

/**
 * Check if a bash command contains a git write operation via subshell
 * bypasses (bash -c, sh -c, eval, pipes, command substitution).
 *
 * Complements isGitAllowed which only checks direct segments.
 * Used as a fallback by checkGitGuard for patterns extractGitInvocations
 * cannot reach (e.g. `bash -c "git push"` where git is inside a quoted string).
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
  // Use isGitAllowed on each git fragment so global flags are handled.
  // Match "git" only when preceded by whitespace, start, or shell metachar —
  // avoids false positives on "--git-dir", ".git", etc.
  const gitFragments = command.matchAll(/(?:^|[\s($`(])git\b/g);
  for (const m of gitFragments) {
    // Find the start of "git" within the match
    const matchStr = m[0]!;
    const gitOffset = matchStr.indexOf("git");
    const idx = (m.index ?? 0) + gitOffset;
    const rest = command.slice(idx);
    const fragment = (rest.split(/[;&|$)`'"]/)[0] ?? "").trim();
    if (fragment.startsWith("git") && !isGitAllowed(fragment)) {
      return true;
    }
  }

  return false;
};

// =============================================================================
// Flag Value Stripping — prevent user text from triggering git guard
// =============================================================================

/**
 * Strip quoted flag values from a command string so user-provided text
 * (e.g. --answer="use git branching") is not scanned as a command.
 */
export const stripFlagValues = (command: string): string =>
  command
    .replace(/--\w+='[^']*'/g, "")
    .replace(/--\w+="[^"]*"/g, "")
    .replace(/--\w+=\S*/g, "");
