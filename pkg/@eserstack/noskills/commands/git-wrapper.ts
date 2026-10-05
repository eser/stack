// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The git wrapper for agent sessions: a POSIX shell script named `git` that
 * goes first on the agent's PATH, so every git process the session starts runs
 * through it. That includes a program an interpreter assembles at run time,
 * such as `python -c "subprocess.run(['g'+'it','push'])"`, which the
 * PreToolUse hook cannot decide from the command text.
 *
 * The script runs reads, clones and commands on other repositories directly,
 * and asks `noskills invoke-hook git-exec` about the rest. While allowGit is
 * false, that check refuses a push from any repository and every other write
 * to the project's repository. Other repositories stay writable, so a test
 * suite that commits to temporary repositories still passes inside an agent
 * session. A check that does not answer in time is stopped and the command is
 * refused, so a stalled `npx` never hangs the agent's git call.
 *
 * This module holds the pure parts: the decision and the script text. Finding
 * git, writing the script and running the check are in
 * `git-wrapper-install.ts`.
 *
 * @module
 */

import * as gitGuard from "@eserstack/agents/guards";

/** Where the wrapper lives, relative to the project root (gitignored state). */
export const WRAPPER_DIR = ".eser/.state/bin";

/** Exit code of `invoke-hook git-exec` when it refuses the command. */
export const GIT_EXEC_DENIED_EXIT_CODE = 3;

/**
 * How long the wrapper waits for the noskills check before it refuses the
 * command. The default command, `npx eser@latest noskills`, may ask the npm
 * registry for the latest version and download it before the check runs.
 * 30 seconds leaves room for that and still returns the agent's git call when
 * the registry does not answer.
 */
export const GIT_CHECK_TIMEOUT_SECONDS = 30;

/**
 * How long a check has to exit after the wrapper sends it SIGTERM before it
 * gets SIGKILL. A check that handles SIGTERM to stop its own child processes
 * (npx does) needs a moment for that.
 */
export const GIT_CHECK_KILL_GRACE_SECONDS = 2;

// The watcher's exit code when it stopped the check, as GNU timeout uses it.
const CHECK_TIMED_OUT_EXIT_CODE = 124;

// =============================================================================
// Decision
// =============================================================================

/**
 * How the wrapper treats one git command:
 * - `read`: only reads repository state; always runs.
 * - `clone`: creates a new repository and changes no existing one; always runs.
 * - `push`: sends commits to another repository; refused from any repository,
 *   because a clone anywhere can push to the project's remote.
 * - `write`: changes the repository it runs in; refused in the project's.
 */
export type GitExecKind = "read" | "clone" | "push" | "write";

/** Classifies the arguments git receives (without the program name). */
export const classifyGitExec = (args: readonly string[]): GitExecKind => {
  if (gitGuard.isGitArgsAllowed(args)) return "read";
  if (gitGuard.isGitRemoteWrite(args)) return "push";
  if (gitGuard.splitGitArgs(args).subcommand === "clone") return "clone";

  return "write";
};

/** The message an agent sees when the wrapper refuses a git command. */
export const gitExecDenial = (args: readonly string[]): string => {
  const { subcommand } = gitGuard.splitGitArgs(args);

  return `noskills: refused "git ${subcommand}". This agent session may only read git while allowGit is false in .eser/manifest.yml. The user controls git, the agent controls files.`;
};

// =============================================================================
// PATH helpers
// =============================================================================

/** Splits a POSIX PATH value into its non-empty entries. */
const pathEntries = (pathValue: string): readonly string[] =>
  pathValue.split(":").filter((entry) => entry.length > 0);

/** PATH with `dir` first and no other occurrence of it. */
export const prependToPath = (pathValue: string, dir: string): string =>
  [dir, ...pathEntries(pathValue).filter((entry) => entry !== dir)].join(":");

/** PATH without `dir`. */
export const removeFromPath = (pathValue: string, dir: string): string =>
  pathEntries(pathValue).filter((entry) => entry !== dir).join(":");

// =============================================================================
// Script text
// =============================================================================

/** Quotes a value as one POSIX shell word. */
export const shellQuote = (value: string): string =>
  `'${value.replaceAll("'", `'\\''`)}'`;

/**
 * The line a Claude Code SessionStart hook appends to `CLAUDE_ENV_FILE`, which
 * Claude Code runs before every Bash command of the session.
 */
export const envFileExport = (binDir: string): string =>
  `export PATH=${shellQuote(binDir)}:"$PATH"\n`;

/** What {@link buildWrapperScript} bakes into the script. */
export type WrapperScriptOptions = {
  /** Absolute path of the git binary the wrapper runs. */
  readonly realGit: string;
  /** The project's git directory as `rev-parse --path-format=absolute --git-common-dir` prints it. */
  readonly projectGitDir: string;
  /** The noskills project root, passed to the check. */
  readonly projectRoot: string;
  /**
   * The command that runs noskills, as the hooks in `.claude/settings.json` run
   * it (the manifest's `command`). It is shell syntax, so it goes into the
   * script unquoted.
   */
  readonly commandPrefix: string;
  /**
   * Seconds the wrapper waits for the check before refusing the command; a
   * positive integer. Defaults to {@link GIT_CHECK_TIMEOUT_SECONDS}.
   */
  readonly checkTimeoutSeconds?: number;
};

const casePattern = (values: Iterable<string>): string =>
  [...values].map((value) => value === "" ? "''" : value).join("|");

/**
 * The wrapper script. It only allows on its own; every refusal comes from the
 * noskills check, which reads allowGit from the manifest at the time of the
 * call. A check that does not exit within `checkTimeoutSeconds` is stopped,
 * and the command is refused.
 */
export const buildWrapperScript = (options: WrapperScriptOptions): string => {
  const checkTimeout = options.checkTimeoutSeconds ??
    GIT_CHECK_TIMEOUT_SECONDS;
  if (!Number.isInteger(checkTimeout) || checkTimeout <= 0) {
    throw new Error(
      `checkTimeoutSeconds must be a positive whole number of seconds, got ${checkTimeout}`,
    );
  }

  const optionsWithValue = casePattern(gitGuard.GIT_GLOBAL_FLAGS_WITH_ARG);
  const inlineOptions = casePattern(
    [
      ...gitGuard.GIT_GLOBAL_FLAGS_WITH_ARG,
      ...gitGuard.GIT_GLOBAL_FLAGS_INLINE_ARG,
    ]
      .filter((flag) => flag.startsWith("--"))
      .map((flag) => `${flag}=*`),
  );
  const optionsWithoutValue = casePattern(gitGuard.GIT_GLOBAL_FLAGS_NO_ARG);
  const directSubcommands = casePattern([
    "",
    ...gitGuard.GIT_ALLOWED_SUBCOMMANDS,
    ...gitGuard.GIT_INFO_OPTIONS,
    "clone",
  ]);
  const conditionalReads = [...gitGuard.GIT_CONDITIONAL_READS].map((
    [subcommand, firstArgs],
  ) =>
    `  ${subcommand})\n    case $first_arg in\n      ${
      casePattern(firstArgs)
    }) exec "$real_git" "$@" ;;\n    esac\n    ;;`
  ).join("\n");
  const remoteWrites = casePattern(gitGuard.GIT_REMOTE_WRITE_SUBCOMMANDS);
  const projectRoot = shellQuote(options.projectRoot);

  return `#!/bin/sh
# Generated by noskills when an agent session starts; edits are overwritten.
#
# Agent sessions find this file first on PATH, so every git process they start
# runs through it. Reads, clones and commands on other repositories run
# directly. Everything else is checked by noskills, which refuses git writes to
# the project's repository, and pushes from anywhere, while allowGit is false.

real_git=${shellQuote(options.realGit)}
project_git_dir=${shellQuote(options.projectGitDir)}

# Find the subcommand and its first argument after git's own options.
subcommand=''
first_arg=''
found=0
takes_value=0
for arg in "$@"; do
  if [ "$found" = 1 ]; then
    first_arg=$arg
    break
  fi
  if [ "$takes_value" = 1 ]; then
    takes_value=0
    continue
  fi
  case $arg in
    ${optionsWithValue}) takes_value=1 ;;
    -C?*|-c?*|${inlineOptions}) ;;
    ${optionsWithoutValue}) ;;
    *)
      subcommand=$arg
      found=1
      ;;
  esac
done

case $subcommand in
  ${directSubcommands}) exec "$real_git" "$@" ;;
${conditionalReads}
esac

# A write with no option before the subcommand acts on the repository that the
# working directory (or GIT_DIR) selects. Outside the project it runs directly.
# An option this script does not know stands where the subcommand would be;
# the options after it may name any repository, so noskills decides.
case $subcommand in
  ${remoteWrites}|-*) ;;
  *)
    if [ "$1" = "$subcommand" ]; then
      target_git_dir=$("$real_git" rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || target_git_dir=''
      if [ "$target_git_dir" != "$project_git_dir" ]; then
        exec "$real_git" "$@"
      fi
    fi
    ;;
esac

# The command may change directory before noskills starts (deno task does), so
# the working directory git would run in travels as NOSKILLS_GIT_CWD.
git_cwd=$(pwd -P)

# The check may never answer (npx can wait on the registry), so a watcher stops
# it after ${checkTimeout} seconds: SIGTERM, then SIGKILL ${GIT_CHECK_KILL_GRACE_SECONDS} seconds later.
# The check writes to a file rather than to this script's stderr, so a process
# it leaves behind cannot keep the caller's pipe open.
check_log=$(mktemp "\${TMPDIR:-/tmp}/noskills-git-check.XXXXXX") || {
  printf '%s\\n' "noskills: could not create a temporary file to check \\"git $subcommand\\", so it did not run." >&2
  exit 1
}
NOSKILLS_REAL_GIT=$real_git NOSKILLS_GIT_CWD=$git_cwd NOSKILLS_PROJECT_ROOT=${projectRoot} ${options.commandPrefix} invoke-hook git-exec "$@" </dev/null >"$check_log" 2>&1 &
check_pid=$!
(
  watch_status=0
  trap 'kill "$nap_pid" 2>/dev/null; exit "$watch_status"' TERM
  sleep ${checkTimeout} &
  nap_pid=$!
  wait "$nap_pid"
  watch_status=${CHECK_TIMED_OUT_EXIT_CODE}
  kill -TERM "$check_pid" 2>/dev/null
  sleep ${GIT_CHECK_KILL_GRACE_SECONDS} &
  nap_pid=$!
  wait "$nap_pid"
  kill -KILL "$check_pid" 2>/dev/null
  exit ${CHECK_TIMED_OUT_EXIT_CODE}
) </dev/null >/dev/null 2>&1 &
watch_pid=$!
trap 'kill "$check_pid" "$watch_pid" 2>/dev/null; rm -f "$check_log"; exit 1' HUP INT TERM
# The shell's notice for a stopped job would reach the agent; the message below
# says what happened instead.
wait "$check_pid" 2>/dev/null
status=$?
kill "$watch_pid" 2>/dev/null
wait "$watch_pid" 2>/dev/null
watch_status=$?
trap - HUP INT TERM
cat "$check_log" >&2
rm -f "$check_log"

if [ "$status" -ne 0 ]; then
  if [ "$watch_status" -eq ${CHECK_TIMED_OUT_EXIT_CODE} ]; then
    printf '%s\\n' "noskills: the check for \\"git $subcommand\\" did not answer within ${checkTimeout} seconds, so it did not run. When command in .eser/manifest.yml starts noskills through npx, install noskills and set command to the installed one, so the check does not wait on the network." >&2
  elif [ "$status" -ne ${GIT_EXEC_DENIED_EXIT_CODE} ]; then
    printf '%s\\n' "noskills: could not check \\"git $subcommand\\" (exit status $status), so it did not run." >&2
  fi
  exit 1
fi
exec "$real_git" "$@"
`;
};
