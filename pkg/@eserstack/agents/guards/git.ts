// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Pure git-guard predicates: decide whether a shell command only READS git
 * state, and detect write operations smuggled through subshells/pipes.
 *
 * This is the intended canonical home. noskills still has the original copy;
 * Part 3 migrates it to re-export from here so the two security allowlists don't
 * drift. The driving-loop safety policy uses these to refuse injecting/auto-
 * confirming anything that would mutate a repo.
 *
 * Each predicate is side-effect free and checks a single command segment unless
 * noted; callers split on `&&`/`;`/`|` or use {@link extractGitInvocations}.
 *
 * @module
 */

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

const GIT_CONDITIONAL_READS: ReadonlyMap<string, ReadonlySet<string>> = new Map(
  [
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
    ["tag", new Set(["", "-l", "--list", "-v", "--verify", "-n"])],
    ["stash", new Set(["list", "show"])],
    ["remote", new Set(["", "-v", "--verbose", "show", "get-url"])],
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
    ["reflog", new Set(["", "show"])],
  ],
);

const GIT_GLOBAL_FLAGS_WITH_ARG: ReadonlySet<string> = new Set([
  "-C",
  "-c",
  "--git-dir",
  "--work-tree",
  "--namespace",
  "--super-prefix",
  "--config-env",
]);

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

const extractGitSubcommand = (tokens: readonly string[]): string | null => {
  let i = 0;
  while (i < tokens.length) {
    const arg = tokens[i]!;

    if (GIT_GLOBAL_FLAGS_WITH_ARG.has(arg)) {
      i += 2;
      continue;
    }
    if (GIT_GLOBAL_FLAGS_NO_ARG.has(arg)) {
      i += 1;
      continue;
    }
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
    if (arg.startsWith("-C") && arg.length > 2) {
      i += 1;
      continue;
    }
    if (arg.startsWith("-c") && arg.length > 2 && arg.includes("=")) {
      i += 1;
      continue;
    }

    return arg;
  }

  return null;
};

/** True if the program token resolves to the git binary (path/extension aware). */
const isGitProgram = (token: string): boolean => {
  const base = (token.split(/[/\\]/).pop() ?? token).toLowerCase();

  return base === "git" || base === "git.exe";
};

/**
 * True if a single git command segment is read-only (allowed). Non-git commands
 * return true (the guard only governs git). Handles path-prefixed invocations
 * (`/usr/bin/git`, `./git`, `git.exe`) and a word boundary so look-alikes like
 * `github-cli` / `git-lfs` are not misparsed as git subcommands.
 */
export const isGitAllowed = (command: string): boolean => {
  const trimmed = command.trim();
  if (trimmed.length === 0) return true;

  const tokens = trimmed.split(/\s+/);
  if (!isGitProgram(tokens[0]!)) return true; // not a git invocation

  const argTokens = tokens.slice(1);
  if (argTokens.length === 0) return true; // bare "git" shows help

  const subcommand = extractGitSubcommand(argTokens) ?? "";

  if (GIT_ALLOWED_SUBCOMMANDS.has(subcommand)) return true;

  const readTokens = GIT_CONDITIONAL_READS.get(subcommand);
  if (readTokens !== undefined) {
    const idx = tokens.indexOf(subcommand);
    const nextToken = idx >= 0 && idx + 1 < tokens.length
      ? tokens[idx + 1]!
      : "";
    if (readTokens.has(nextToken)) return true;
  }

  return false;
};

/** Backward-compatible alias. */
export const isGitReadOnly = isGitAllowed;

/**
 * Extract every `git <subcommand> …` fragment from a command string, handling
 * multi-line scripts, `&&`/`||`/`;` chains, `$(git …)`, and backticks.
 */
export const extractGitInvocations = (command: string): readonly string[] => {
  const invocations: string[] = [];
  // Split on the bare separators and let the per-phrase trim() below absorb the
  // surrounding whitespace. Padding the separators (/\s*(?:…|\n)\s*/) made `\s*`
  // and the `\n` alternative overlap, so a command padded with a long whitespace
  // run backtracked quadratically — a hostile tool argument could stall the
  // guard, and with it the driving loop, for minutes.
  const phrases = command.split(/&&|\|\||;|\n/);

  for (const phrase of phrases) {
    const trimmed = phrase.trim();
    if (trimmed.length === 0 || !trimmed.includes("git")) continue;

    // Preceding class includes / and \ so path-prefixed git (/usr/bin/git) is caught.
    const gitFragments = trimmed.matchAll(/(?:^|[\s($`/\\])git\b/g);
    for (const m of gitFragments) {
      const matchStr = m[0]!;
      const gitOffset = matchStr.indexOf("git");
      const idx = (m.index ?? 0) + gitOffset;
      const rest = trimmed.slice(idx);
      const fragment = (rest.split(/[;&|$)`'"]/)[0] ?? rest).trim();
      if (fragment.startsWith("git")) invocations.push(fragment);
    }
  }

  return invocations;
};

/**
 * True if a command smuggles a git WRITE through a subshell (`bash -c …`),
 * `eval`, pipe chain, or command substitution. Complements {@link isGitAllowed}.
 */
export const containsGitWriteBypass = (command: string): boolean => {
  // Any *sh shell (bash/zsh/ksh/dash/sh, optionally path-prefixed) with a -c
  // variant (-c/-lc/-ic), and an inner string that may be plain- or $'…'-quoted.
  const subshellPatterns = [
    /(?:^|\s)(?:\S*\/)?[a-z]*sh\s+-\w*c\s+\$?["'](.+?)["']/g,
    /(?:^|\s)(?:\S*\/)?[a-z]*sh\s+-\w*c\s+(\S+)/g,
    /eval\s+["'](.+?)["']/g,
  ];

  for (const pattern of subshellPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(command)) !== null) {
      const inner = match[1] ?? "";
      if (inner.includes("git") && !isGitAllowed(inner)) return true;
    }
  }

  // Pipe chains: any segment that is a git write (path-aware via isGitAllowed).
  // Plain string split, not /\s*\|\s*/: that pattern re-scanned a whitespace run
  // from every offset before failing on the missing `|`, which is quadratic on a
  // padded command. The trim() below yields the same segments.
  const segments = command.split("|");
  for (const seg of segments) {
    const trimSeg = seg.trim();
    if (trimSeg.length > 0 && !isGitAllowed(trimSeg)) return true;
  }

  // Catch $(git …), `git …`, and path-prefixed git anywhere.
  const gitFragments = command.matchAll(/(?:^|[\s($`/\\])git\b/g);
  for (const m of gitFragments) {
    const matchStr = m[0]!;
    const gitOffset = matchStr.indexOf("git");
    const idx = (m.index ?? 0) + gitOffset;
    const rest = command.slice(idx);
    const fragment = (rest.split(/[;&|$)`'"]/)[0] ?? "").trim();
    if (fragment.startsWith("git") && !isGitAllowed(fragment)) return true;
  }

  return false;
};

/**
 * Strip quoted flag values so user-provided text (e.g. `--answer="use git"`)
 * isn't scanned as a command.
 */
export const stripFlagValues = (command: string): string =>
  command
    .replace(/--\w+='[^']*'/g, "")
    .replace(/--\w+="[^"]*"/g, "")
    .replace(/--\w+=\S*/g, "");

/**
 * Convenience: true if `command` performs (or smuggles) any git write.
 */
export const hasGitWrite = (command: string): boolean => {
  const cleaned = stripFlagValues(command);
  for (const inv of extractGitInvocations(cleaned)) {
    if (!isGitAllowed(inv)) return true;
  }

  return containsGitWriteBypass(cleaned);
};
