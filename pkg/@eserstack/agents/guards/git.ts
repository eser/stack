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

// `git config` is decided on all of its arguments, not the first one: a scope
// flag such as --global says where to look, not what to do, so
// `git config --global user.name x` is a write.
const GIT_CONFIG_READ_ACTIONS: ReadonlySet<string> = new Set([
  "--get",
  "--get-all",
  "--get-regexp",
  "--get-urlmatch",
  "--get-color",
  "--get-colorbool",
  "--list",
  "-l",
]);

const GIT_CONFIG_READ_SUBCOMMANDS: ReadonlySet<string> = new Set([
  "get",
  "list",
]);

// Flags that only narrow where config is read from or how it is printed.
const GIT_CONFIG_NEUTRAL_FLAGS: ReadonlySet<string> = new Set([
  "--global",
  "--local",
  "--system",
  "--worktree",
  "--show-origin",
  "--show-scope",
  "--name-only",
  "--null",
  "-z",
  "--includes",
  "--no-includes",
  "--bool",
  "--int",
  "--bool-or-int",
  "--path",
  "--expiry-date",
  "--no-type",
  "--fixed-value",
  "--all",
]);

const GIT_CONFIG_FLAGS_WITH_ARG: ReadonlySet<string> = new Set([
  "--file",
  "-f",
  "--blob",
  "--type",
  "--default",
  "--url",
]);

/** True if the arguments after `git config` only read configuration. */
const isGitConfigRead = (args: readonly string[]): boolean => {
  let readAction = false;
  const positionals: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;

    if (GIT_CONFIG_READ_ACTIONS.has(arg)) {
      readAction = true;
      continue;
    }
    if (GIT_CONFIG_NEUTRAL_FLAGS.has(arg)) continue;
    if (GIT_CONFIG_FLAGS_WITH_ARG.has(arg)) {
      i += 1;
      continue;
    }
    if (arg.startsWith("--") && arg.includes("=")) {
      const name = arg.slice(0, arg.indexOf("="));
      if (GIT_CONFIG_FLAGS_WITH_ARG.has(name)) continue;
      return false;
    }
    // Any other flag (--add, --unset, --replace-all, --edit, -e,
    // --rename-section, --remove-section, --comment, ...) may write.
    if (arg.startsWith("-")) return false;

    positionals.push(arg);
  }

  if (readAction) return true;

  const [first] = positionals;
  if (first !== undefined && GIT_CONFIG_READ_SUBCOMMANDS.has(first)) {
    return true;
  }

  // `git config <name>` reads one key; a second positional is its new value.
  return positionals.length === 1;
};

const extractGitSubcommandIndex = (tokens: readonly string[]): number => {
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

    return i;
  }

  return -1;
};

/**
 * Removes shell quoting and backslash escapes from one word, so `g''it`,
 * `"git"`, `'git'` and `\\git` all read as the program the shell will run.
 */
const unquoteWord = (word: string): string => word.replace(/["'\\]/g, "");

/** True if the program token resolves to the git binary (path/extension aware). */
const isGitProgram = (token: string): boolean => {
  const word = unquoteWord(token);
  const base = (word.split(/[/\\]/).pop() ?? word).toLowerCase();

  return base === "git" || base === "git.exe";
};

// Words that run the rest of the line as a command: `env git push`,
// `command git push`, `sudo git push`.
const COMMAND_PREFIX_WORDS: ReadonlySet<string> = new Set([
  "env",
  "command",
  "exec",
  "sudo",
  "nohup",
  "time",
  "nice",
  "builtin",
]);

const ENV_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

/**
 * Index of the program token in a segment: skips `NAME=value` assignments and
 * wrapper words such as `env` or `sudo` (and the flags `env`/`sudo` take).
 */
const programIndex = (tokens: readonly string[]): number => {
  let i = 0;
  while (i < tokens.length) {
    const word = unquoteWord(tokens[i]!);
    if (ENV_ASSIGNMENT.test(word)) {
      i += 1;
      continue;
    }
    if (COMMAND_PREFIX_WORDS.has(word.toLowerCase())) {
      i += 1;
      while (i < tokens.length && tokens[i]!.startsWith("-")) i += 1;
      continue;
    }
    return i;
  }
  return -1;
};

/**
 * True if the program is chosen at run time from a variable (`$GIT push`,
 * `${G} push`), so the text cannot tell whether it is git.
 */
const isDynamicProgram = (token: string): boolean =>
  /^\$(?:[A-Za-z_][A-Za-z0-9_]*|\{[^}]+\})$/.test(unquoteWord(token));

/**
 * True if a single git command segment is read-only (allowed). Non-git commands
 * return true (the guard only governs git). Handles path-prefixed invocations
 * (`/usr/bin/git`, `./git`, `git.exe`) and a word boundary so look-alikes like
 * `github-cli` / `git-lfs` are not misparsed as git subcommands.
 */
export const isGitAllowed = (command: string): boolean => {
  const trimmed = command.trim();
  if (trimmed.length === 0) return true;

  const allTokens = trimmed.split(/\s+/);
  const progIdx = programIndex(allTokens);
  if (progIdx === -1) return true; // only assignments / wrappers
  const tokens = allTokens.slice(progIdx);

  // A program picked from a variable may be git; the guard cannot see which.
  if (isDynamicProgram(tokens[0]!) && tokens.length > 1) return false;

  if (!isGitProgram(tokens[0]!)) return true; // not a git invocation

  const argTokens = tokens.slice(1).map(unquoteWord);
  if (argTokens.length === 0) return true; // bare "git" shows help

  const subIndex = extractGitSubcommandIndex(argTokens);
  const subcommand = subIndex >= 0 ? argTokens[subIndex]! : "";
  const subArgs = subIndex >= 0 ? argTokens.slice(subIndex + 1) : [];

  if (GIT_ALLOWED_SUBCOMMANDS.has(subcommand)) return true;

  if (subcommand === "config") return isGitConfigRead(subArgs);

  const readTokens = GIT_CONDITIONAL_READS.get(subcommand);
  if (readTokens !== undefined) {
    const nextToken = subArgs[0] ?? "";
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
    if (trimmed.length === 0) continue;

    // A program token the fragment scan below cannot see because it is
    // quoted or escaped (`"git" push`, `g''it push`, `\\git push`) or picked
    // from a variable (`$GIT push`). Plain `git`, in any case, is found below.
    const words = trimmed.split(/\s+/);
    const progIdx = programIndex(words);
    if (progIdx !== -1) {
      const prog = words[progIdx]!;
      const hidden = unquoteWord(prog) !== prog && isGitProgram(prog);
      if (hidden || isDynamicProgram(prog)) {
        const tail = words.slice(progIdx).join(" ");
        invocations.push((tail.split(/[|&;)`]/)[0] ?? tail).trim());
      }
    }

    if (!/git/i.test(trimmed)) continue;

    // Preceding class includes / and \ so path-prefixed git (/usr/bin/git) is caught.
    const gitFragments = trimmed.matchAll(/(?:^|[\s($`/\\])git\b/gi);
    for (const m of gitFragments) {
      const matchStr = m[0]!;
      const gitOffset = matchStr.toLowerCase().indexOf("git");
      const idx = (m.index ?? 0) + gitOffset;
      const rest = trimmed.slice(idx);
      const fragment = (rest.split(/[;&|$)`'"]/)[0] ?? rest).trim();
      if (fragment.toLowerCase().startsWith("git")) invocations.push(fragment);
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
  const gitFragments = command.matchAll(/(?:^|[\s($`/\\])git\b/gi);
  for (const m of gitFragments) {
    const matchStr = m[0]!;
    const gitOffset = matchStr.toLowerCase().indexOf("git");
    const idx = (m.index ?? 0) + gitOffset;
    const rest = command.slice(idx);
    const fragment = (rest.split(/[;&|$)`'"]/)[0] ?? "").trim();
    if (fragment.toLowerCase().startsWith("git") && !isGitAllowed(fragment)) {
      return true;
    }
  }

  // A shell that reads its script from stdin (`… | sh`, `sh <<< '…'`,
  // `sh << EOF`) runs text the checks above only saw inside quotes. Scan the
  // whole command with quoting removed.
  if (feedsShellFromStdin(command)) {
    const unquoted = command.replace(/["'\\]/g, "");
    for (const inv of extractGitInvocations(unquoted)) {
      if (!isGitAllowed(inv)) return true;
    }
  }

  return false;
};

const SHELL_PROGRAM = String.raw`(?:\S*\/)?(?:ba|z|k|da|a)?sh`;

/** True if a shell in the command takes its script from stdin or a heredoc. */
export const feedsShellFromStdin = (command: string): boolean =>
  new RegExp(String.raw`\|\s*${SHELL_PROGRAM}(?:\s+-\w+)*\s*(?:$|[;&|)])`, "m")
    .test(command) ||
  new RegExp(String.raw`(?:^|[\s;&|(])${SHELL_PROGRAM}(?:\s+-\w+)*\s*<<`, "m")
    .test(command);

/**
 * Script files a command runs through a shell (`sh run.sh`, `bash -e x.sh`,
 * `source x.sh`, `. x.sh`). The caller can read them; their content is not in
 * the command text.
 */
export const shellScriptTargets = (command: string): readonly string[] => {
  const targets: string[] = [];
  const phrases = command.split(/&&|\|\||;|\n|\|/);
  for (const phrase of phrases) {
    const words = phrase.trim().split(/\s+/).map(unquoteWord);
    const progIdx = programIndex(words);
    if (progIdx === -1) continue;
    const prog = (words[progIdx]!.split("/").pop() ?? "").toLowerCase();
    let i = progIdx + 1;
    if (/^(?:ba|z|k|da|a)?sh$/.test(prog)) {
      while (i < words.length && words[i]!.startsWith("-")) {
        if (/c/.test(words[i]!)) {
          i = -1; // `sh -c '…'` runs a string, handled elsewhere
          break;
        }
        i += 1;
      }
    } else if (prog !== "source" && prog !== ".") {
      continue;
    }
    if (i >= 0 && i < words.length && !words[i]!.startsWith("<")) {
      targets.push(words[i]!);
    }
  }
  return targets;
};

/** True if the command itself writes `path` (`> path`, `>> path`, `tee path`). */
export const writesFile = (command: string, path: string): boolean => {
  const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    String.raw`(?:>>?|\btee(?:\s+-a)?)\s*["']?${escaped}["']?(?:\s|$|[;&|])`,
  )
    .test(command);
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
