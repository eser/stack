// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Installs the agent-session git wrapper and runs the check it calls. The
 * decision and the script text are pure and live in `git-wrapper.ts`.
 *
 * Two places put the wrapper on an agent's PATH: the Claude Code SessionStart
 * hook, through `CLAUDE_ENV_FILE`, and `noskills run`, through the PATH the
 * agent process inherits. The SessionStart hook of the other tools that have
 * one writes the wrapper as well, for a tool the user starts with the wrapper
 * directory first on PATH. The run loop's own commits call the real git
 * binary, so the wrapper never stands between the loop and its commits.
 *
 * The wrapper is a POSIX shell script, so it is not installed on Windows. A
 * `git.cmd` shim would not take its place: programs that start git without a
 * shell (Python's subprocess, Node's child_process, Deno.Command) look up
 * `git.exe` and never run a `.cmd` file.
 *
 * @module
 */

import * as crossRuntime from "@eserstack/standards/cross-runtime";
import * as gitGuard from "@eserstack/agents/guards";
import * as persistence from "../state/persistence.ts";
import * as gitWrapper from "./git-wrapper.ts";

// rev-parse reads a few files; anything slower is a hung file system.
const REV_PARSE_TIMEOUT_MS = 5_000;

/** An installed wrapper. */
export type InstalledGitWrapper = {
  /** The directory holding the `git` script; it goes first on PATH. */
  readonly binDir: string;
  /** The git binary the wrapper runs, found on PATH outside `binDir`. */
  readonly realGit: string;
};

/** The wrapper directory of a project. */
export const wrapperDir = (root: string): string =>
  `${root}/${gitWrapper.WRAPPER_DIR}`;

const isExecutableFile = async (path: string): Promise<boolean> => {
  try {
    const info = await crossRuntime.runtime.fs.stat(path);
    return info.isFile && info.mode !== null && (info.mode & 0o111) !== 0;
  } catch {
    // Missing or unreadable: not a candidate.
    return false;
  }
};

const realPathOrSelf = async (path: string): Promise<string> => {
  try {
    return await crossRuntime.runtime.fs.realPath(path);
  } catch {
    // A PATH entry that does not exist cannot be the wrapper directory.
    return path;
  }
};

/**
 * The first executable `git` on PATH outside `excludeDir`, or null when there
 * is none. Relative PATH entries are skipped: they resolve against whatever
 * directory the agent happens to be in.
 */
export const resolveRealGit = async (
  pathValue: string,
  excludeDir: string,
): Promise<string | null> => {
  const excluded = await realPathOrSelf(excludeDir);

  for (const dir of pathValue.split(":")) {
    if (!dir.startsWith("/")) continue;

    // PATH order decides which git wins, so the entries are checked one at a
    // time and the first match returns.
    // oxlint-disable-next-line no-await-in-loop
    const resolvedDir = await realPathOrSelf(dir);
    if (dir === excludeDir || resolvedDir === excluded) continue;

    const candidate = `${dir}/git`;
    // oxlint-disable-next-line no-await-in-loop
    if (await isExecutableFile(candidate)) return candidate;
  }

  return null;
};

/**
 * The common git directory (shared by all worktrees) that git selects with
 * these global options in `cwd`, or null when `cwd` is not in a repository.
 */
export const gitCommonDir = async (
  realGit: string,
  globalOptions: readonly string[],
  cwd: string,
): Promise<string | null> => {
  const result = await crossRuntime.runtime.exec.spawn(
    realGit,
    [
      ...globalOptions,
      "rev-parse",
      "--path-format=absolute",
      "--git-common-dir",
    ],
    {
      cwd,
      stdin: "null",
      stdout: "piped",
      stderr: "null",
      signal: AbortSignal.timeout(REV_PARSE_TIMEOUT_MS),
    },
  );

  if (!result.success) return null;

  const dir = new TextDecoder().decode(result.stdout).trim();

  return dir === "" ? null : dir;
};

/** Optional settings of {@link installGitWrapper}. */
export type InstallGitWrapperOptions = {
  /**
   * Seconds the wrapper waits for the noskills check; defaults to
   * `GIT_CHECK_TIMEOUT_SECONDS` in `git-wrapper.ts`.
   */
  readonly checkTimeoutSeconds?: number;
};

/**
 * Writes the wrapper for `root` and returns where it is, or null when it
 * cannot work here (Windows, or no git on PATH). The script is replaced
 * atomically, so a git call running during the rewrite never reads half of it.
 */
export const installGitWrapper = async (
  root: string,
  commandPrefix: string,
  options: InstallGitWrapperOptions = {},
): Promise<InstalledGitWrapper | null> => {
  if (crossRuntime.getPlatform() === "windows") return null;

  const binDir = wrapperDir(root);
  const realGit = await resolveRealGit(
    crossRuntime.runtime.env.get("PATH") ?? "",
    binDir,
  );
  if (realGit === null) return null;

  const projectGitDir =
    (await gitCommonDir(realGit, [], root)) ??
    `${await crossRuntime.runtime.fs.realPath(root)}/.git`;

  const script = gitWrapper.buildWrapperScript({
    realGit,
    projectGitDir,
    projectRoot: root,
    commandPrefix,
    checkTimeoutSeconds: options.checkTimeoutSeconds,
  });

  await crossRuntime.runtime.fs.mkdir(binDir, { recursive: true });
  const target = `${binDir}/git`;
  const temp = `${binDir}/.git.${crypto.randomUUID()}.tmp`;
  try {
    await crossRuntime.runtime.fs.writeTextFile(temp, script, { mode: 0o755 });
    // The umask may have masked the execute bits at creation.
    await crossRuntime.runtime.fs.chmod(temp, 0o755);
    await crossRuntime.runtime.fs.rename(temp, target);
  } catch (error) {
    try {
      await crossRuntime.runtime.fs.remove(temp);
    } catch {
      // Never created, or already renamed into place.
    }
    throw error;
  }

  return { binDir, realGit };
};

/**
 * Appends the PATH export for `binDir` to a Claude Code `CLAUDE_ENV_FILE`,
 * unless an earlier SessionStart of the same session already did.
 */
export const exportFromEnvFile = async (
  envFile: string,
  binDir: string,
): Promise<void> => {
  const line = gitWrapper.envFileExport(binDir);

  let current = "";
  try {
    current = await crossRuntime.runtime.fs.readTextFile(envFile);
  } catch {
    // Claude Code creates the file lazily; nothing is exported yet.
  }

  if (current.includes(line)) return;

  await crossRuntime.runtime.fs.writeTextFile(envFile, line, { append: true });
};

/** Where `invoke-hook git-exec` runs: what the wrapper passes it. */
export type GitExecContext = {
  readonly root: string;
  readonly realGit: string;
  readonly cwd: string;
};

/**
 * The check behind the wrapper: returns the refusal message for a git command
 * an agent session may not run, or null when it may run. allowGit comes from
 * the manifest at the time of the call.
 */
export const checkGitExec = async (
  args: readonly string[],
  context: GitExecContext,
): Promise<string | null> => {
  const config = await persistence.readManifest(context.root);
  if (config?.allowGit === true) return null;

  const kind = gitWrapper.classifyGitExec(args);
  if (kind === "read" || kind === "clone") return null;
  if (kind === "push") return gitWrapper.gitExecDenial(args);

  const { globalOptions, subcommand } = gitGuard.splitGitArgs(args);
  // An option the guard does not know stands where the subcommand would be.
  // The options after it may name any repository (`-C <project>`), so the
  // repository cannot be decided and the command is refused.
  if (subcommand.startsWith("-")) return gitWrapper.gitExecDenial(args);

  const [targetDir, projectDir] = await Promise.all([
    gitCommonDir(context.realGit, globalOptions, context.cwd),
    gitCommonDir(context.realGit, [], context.root),
  ]);

  if (targetDir !== null && targetDir === projectDir) {
    return gitWrapper.gitExecDenial(args);
  }

  return null;
};
