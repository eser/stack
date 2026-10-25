// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// Dry-run, verbose and conflict lines are kit's CLI output for the person running the command.
// deno-lint-ignore-file no-console

/**
 * Recipe applier — downloads recipe files and copies them into the
 * user's project with conflict detection and path traversal protection.
 *
 * Supports:
 * - Single file application (kind: "file" or default)
 * - Folder application (kind: "folder") with fetch-all-then-write atomicity
 * - Variable substitution (Go template syntax {{.variable_name}})
 * - Recipe-to-recipe dependencies (requires) with topological ordering
 * - Post-install command execution
 *
 * @module
 */

import { runtime } from "@eserstack/standards/cross-runtime";
import type * as registrySchema from "./registry-schema.ts";
import * as registryFetcher from "./registry-fetcher.ts";
import * as variableProcessor from "./variable-processor.ts";
import * as requiresResolver from "./requires-resolver.ts";
import * as processor from "./processor.ts";
import * as providers from "./providers/mod.ts";

// =============================================================================
// Types
// =============================================================================

/** How {@link applyRecipe} and its variants write a recipe into a project. */
export interface ApplyOptions {
  /** The project directory. Targets resolve against it, and nothing is written outside it. */
  readonly cwd: string;
  /** Base URL that each file's `source` resolves against. */
  readonly registryUrl: string;
  /** Overwrite files that already exist. */
  readonly force?: boolean;
  /** Leave files that already exist as they are, without a warning. */
  readonly skipExisting?: boolean;
  /** Print what would be written and run, and write or run nothing. */
  readonly dryRun?: boolean;
  /** Print a line for each file on stdout. */
  readonly verbose?: boolean;
  /** Values for the recipe's variables by name; they win over the defaults. */
  readonly variables?: Readonly<Record<string, string>>;
  /** For whole-repo mode: the original specifier used to resolve the provider. */
  readonly specifier?: string;
  /** Whether to prompt for missing variables (only when stdin is a TTY). */
  readonly interactive?: boolean;
  /** Skip post-install commands. */
  readonly skipPostInstall?: boolean;
  /**
   * The longest each post-install command may run, in milliseconds, before it
   * is stopped and fails with a {@link PostInstallError}. Defaults to
   * {@link DEFAULT_POST_INSTALL_TIMEOUT_MS}. A value that is not positive
   * makes `applyRecipe` throw a RangeError before it writes anything.
   */
  readonly postInstallTimeoutMs?: number;
  /**
   * Whole-repo mode: the most decompressed bytes read from the repository
   * tarball, passed to `extractTarball`. Defaults to its `DEFAULT_MAX_BYTES`.
   */
  readonly maxBytes?: number;
  /**
   * Whole-repo mode: the most entries read from the repository tarball,
   * passed to `extractTarball`. Defaults to its `DEFAULT_MAX_ENTRIES`.
   */
  readonly maxEntries?: number;
}

/** What applying one recipe did. */
export interface ApplyResult {
  /** Target paths written, or that a dry run would write. */
  readonly written: readonly string[];
  /** Target paths left as they were because they already existed. */
  readonly skipped: readonly string[];
  /**
   * Files mode: the number of file entries in the recipe. Whole-repo mode:
   * the number of files written and skipped.
   */
  readonly total: number;
  /** Post-install commands that ran, or that a dry run would run. */
  readonly postInstallRan: readonly string[];
}

/** What {@link applyRecipeChain} did, one entry per recipe. */
export interface ApplyChainResult {
  /** Each applied recipe and its result, the required recipes first. */
  readonly recipes: readonly {
    readonly name: string;
    readonly result: ApplyResult;
  }[];
}

// =============================================================================
// Errors
// =============================================================================

/**
 * Thrown when a recipe stops partway: a file could not be fetched or
 * written, or a repository could not be downloaded or extracted. Files
 * written before the failure stay in place and are listed in `written`; the
 * error of the failing step is the `cause`.
 */
export class RecipeApplyError extends Error {
  /** The recipe being applied: its name, or the clone specifier. */
  readonly recipeName: string;
  /** What was being done when it failed, such as "copy src/a.ts to lib/a.ts". */
  readonly step: string;
  /** Target paths written before the failure. */
  readonly written: readonly string[];

  /**
   * Creates the error for a recipe that stopped partway.
   *
   * @param recipeName - The recipe's name, or the clone specifier
   * @param step - What was being done, such as "copy src/a.ts to lib/a.ts"
   * @param written - Target paths written before the failure
   * @param options - `cause`: the error of the failing step
   */
  constructor(
    recipeName: string,
    step: string,
    written: readonly string[],
    options?: ErrorOptions,
  ) {
    const leftover =
      written.length === 0
        ? "no files were written"
        : `${written.length} file(s) written before it stay in place; once the cause below is fixed, rerun with --force to overwrite them`;
    super(`apply recipe ${recipeName}: ${step}; ${leftover}`, options);
    this.name = "RecipeApplyError";
    this.recipeName = recipeName;
    this.step = step;
    this.written = written;
  }
}

/**
 * Thrown when a recipe target resolves outside the project directory. The
 * check runs before the files it covers are written.
 */
export class RecipePathTraversalError extends Error {
  /** The recipe that declared the target. */
  readonly recipeName: string;
  /** The target path as the recipe declared it. */
  readonly target: string;

  /**
   * Creates the error for a target outside the project directory.
   *
   * @param recipeName - The recipe that declared the target
   * @param target - The target path as the recipe declared it
   */
  constructor(recipeName: string, target: string) {
    super(
      `apply recipe ${recipeName}: target "${target}" is a path traversal outside the project directory; the recipe needs a fix from its author`,
    );
    this.name = "RecipePathTraversalError";
    this.recipeName = recipeName;
    this.target = target;
  }
}

/** Options for a {@link PostInstallError}. */
export interface PostInstallErrorOptions extends ErrorOptions {
  /**
   * Set when the command was stopped because it ran past this many
   * milliseconds, the post-install timeout.
   */
  readonly timeoutMs?: number;
}

/**
 * Thrown when a post-install command exits with a non-zero code, runs past the
 * post-install timeout, or cannot be started (the spawn error is then the
 * `cause`). The recipe's files are already written at that point.
 */
export class PostInstallError extends Error {
  /** The command line as the recipe declared it. */
  readonly command: string;
  /**
   * The exit code, or null when the command did not start or was stopped at
   * the timeout.
   */
  readonly exitCode: number | null;
  /** The timeout in milliseconds when the command ran past it, or null. */
  readonly timeoutMs: number | null;

  /**
   * Creates the error for a post-install command that failed.
   *
   * @param command - The command line as the recipe declared it
   * @param exitCode - The exit code, or null when the command did not start
   *   or was stopped at the timeout
   * @param options - `cause`: the spawn error, when the command did not start;
   *   `timeoutMs`: the timeout, when the command ran past it
   */
  constructor(
    command: string,
    exitCode: number | null,
    options?: PostInstallErrorOptions,
  ) {
    const timeoutMs = options?.timeoutMs ?? null;
    let detail: string;
    if (timeoutMs !== null) {
      detail = `no exit within ${
        timeoutMs / 1000
      }s; raise postInstallTimeoutMs if it needs longer`;
    } else if (exitCode === null) {
      detail =
        "it did not start; check that the program is installed and on PATH";
    } else {
      detail = `exit code ${exitCode}; fix the problem in its output above, then run it by hand`;
    }
    super(`run post-install command "${command}": ${detail}`, options);
    this.name = "PostInstallError";
    this.command = command;
    this.exitCode = exitCode;
    this.timeoutMs = timeoutMs;
  }
}

/** How errors name a recipe that has no `name` field. */
const UNNAMED_RECIPE = "<unnamed>";

// =============================================================================
// Security: Path traversal check
// =============================================================================

/**
 * Validate that a target path does not escape the project directory.
 * Prevents malicious registries from writing to arbitrary locations.
 *
 * Separator-agnostic: resolves the target against the base directory using the
 * runtime's platform-aware path API, then ensures the resulting path stays
 * within the base. Works for both POSIX ("/") and Windows ("\\") separators
 * and rejects "../" traversal, absolute targets, and resolved traversal.
 */
export const isPathSafe = (cwd: string, target: string): boolean => {
  const base = runtime.path.resolve(cwd);
  const resolved = runtime.path.resolve(base, target);

  // The path is the base itself.
  if (resolved === base) return true;

  // Relative path from base to target must stay inside base: it must not be
  // absolute (different drive/root) and must not climb out via "..".
  const rel = runtime.path.relative(base, resolved);

  if (rel === "" || rel === ".") return true;
  if (runtime.path.isAbsolute(rel)) return false;

  // Reject "..", "../foo", "..\\foo" — anything that escapes the base.
  return (
    rel !== ".." &&
    !rel.startsWith(`..${runtime.path.sep}`) &&
    !rel.startsWith("../")
  );
};

// =============================================================================
// File operations
// =============================================================================

const ensureParentDir = async (filePath: string): Promise<void> => {
  const parts = filePath.split("/");
  parts.pop();
  const dir = parts.join("/");

  if (dir !== "" && dir !== ".") {
    await runtime.fs.mkdir(dir, { recursive: true });
  }
};

/**
 * Resolves true when something exists at `path`, whatever its type, and false
 * when nothing does or the path cannot be checked.
 */
export const fileExists = async (path: string): Promise<boolean> => {
  try {
    await runtime.fs.stat(path);
    return true;
  } catch {
    return false;
  }
};

// =============================================================================
// Content processing
// =============================================================================

/**
 * Apply variable substitution to content if variables are provided.
 */
export const processContent = (
  content: string,
  variables?: Readonly<Record<string, string>>,
): string => {
  if (variables === undefined || Object.keys(variables).length === 0) {
    return content;
  }

  return variableProcessor.substituteVariables(content, variables);
};

// =============================================================================
// Single file application
// =============================================================================

const applyFile = async (
  file: registrySchema.RecipeFile,
  options: ApplyOptions,
  written: string[],
  skipped: string[],
): Promise<void> => {
  const targetPath = `${options.cwd}/${file.target}`;

  if (skipped.includes(file.target)) return;

  if (options.skipExisting === true) {
    const exists = await fileExists(targetPath);
    if (exists) {
      if (options.verbose === true) {
        console.log(`  [skip] ${file.target} (already exists)`);
      }
      skipped.push(file.target);
      return;
    }
  }

  if (options.dryRun === true) {
    console.log(`  [dry-run] would write ${file.target}`);
    written.push(file.target);
    return;
  }

  if (options.verbose === true) {
    console.log(`  [write] ${file.target}`);
  }

  const content = await registryFetcher.fetchRecipeFile(
    registryFetcher.sourceBaseFor(file, options.registryUrl),
    file.source,
  );

  const processed = processContent(content, options.variables);

  await ensureParentDir(targetPath);
  await runtime.fs.writeTextFile(targetPath, processed);
  written.push(file.target);
};

// =============================================================================
// Folder application (fetch-all-then-write)
// =============================================================================

const applyFolder = async (
  recipeName: string,
  file: registrySchema.RecipeFile,
  options: ApplyOptions,
  written: string[],
  skipped: string[],
): Promise<void> => {
  // Fetch all files in the folder into memory first
  const fetchedFiles = await registryFetcher.fetchRecipeFolder(
    registryFetcher.sourceBaseFor(file, options.registryUrl),
    file.source,
  );

  // Validate all target paths before writing anything
  for (const fetched of fetchedFiles) {
    const targetPath = `${file.target}/${fetched.path}`;
    if (!isPathSafe(options.cwd, targetPath)) {
      throw new RecipePathTraversalError(recipeName, targetPath);
    }
  }

  // Write all files (atomic — we already have all content in memory)
  for (const fetched of fetchedFiles) {
    const relativePath = `${file.target}/${fetched.path}`;
    const targetPath = `${options.cwd}/${relativePath}`;

    if (options.skipExisting === true) {
      // Files are checked and written one at a time so the written list and
      // the log lines follow the folder order and open handles stay bounded.
      // deno-lint-ignore no-await-in-loop
      const exists = await fileExists(targetPath);
      if (exists) {
        skipped.push(relativePath);
        continue;
      }
    }

    if (options.dryRun === true) {
      console.log(`  [dry-run] would write ${relativePath}`);
      written.push(relativePath);
      continue;
    }

    if (options.verbose === true) {
      console.log(`  [write] ${relativePath}`);
    }

    const processed = processContent(fetched.content, options.variables);

    // Sequential for the same reason as the existence check above.
    // deno-lint-ignore no-await-in-loop
    await ensureParentDir(targetPath);
    // deno-lint-ignore no-await-in-loop
    await runtime.fs.writeTextFile(targetPath, processed);
    written.push(relativePath);
  }
};

// =============================================================================
// Post-install commands
// =============================================================================

/**
 * How long one post-install command may run before it is stopped: 10 minutes,
 * the `DefaultCommandTimeout` of the Go applier in ajan kitfx. It leaves room
 * for a cold package install on a slow network and still ends a command that
 * hangs.
 */
export const DEFAULT_POST_INSTALL_TIMEOUT_MS = 10 * 60 * 1000;

/** Throws a RangeError unless `timeoutMs` is a positive, finite number. */
const assertPostInstallTimeout = (timeoutMs: number): void => {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError(
      `post-install timeout must be a positive number of milliseconds, got ${timeoutMs}`,
    );
  }
};

/**
 * Run post-install commands in `cwd`, in order, stopping at the first one
 * that fails. In dry-run mode the commands are only printed.
 *
 * @param commands - The command lines, split on whitespace and run without a
 *   shell
 * @param cwd - The directory the commands run in
 * @param dryRun - Print the commands instead of running them
 * @param verbose - Print each command before it runs
 * @param timeoutMs - The longest each command may run, in milliseconds;
 *   defaults to {@link DEFAULT_POST_INSTALL_TIMEOUT_MS}
 * @returns The commands that ran, or that a dry run would run
 * @throws {PostInstallError} When a command exits with a non-zero code, runs
 *   past `timeoutMs` or does not start.
 * @throws {RangeError} When `timeoutMs` is not a positive number.
 */
export const runPostInstall = async (
  commands: readonly string[],
  cwd: string,
  dryRun?: boolean,
  verbose?: boolean,
  timeoutMs: number = DEFAULT_POST_INSTALL_TIMEOUT_MS,
): Promise<readonly string[]> => {
  assertPostInstallTimeout(timeoutMs);

  const ran: string[] = [];

  for (const cmd of commands) {
    if (dryRun === true) {
      console.log(`  [dry-run] would run: ${cmd}`);
      ran.push(cmd);
      continue;
    }

    if (verbose === true) {
      console.log(`  [post-install] ${cmd}`);
    }

    const parts = cmd.split(/\s+/);
    // Aborting the spawn stops the command once it runs past the timeout. The
    // timer is cleared when the command ends, so it never outlives the run.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let result: Awaited<ReturnType<typeof runtime.exec.spawn>>;
    try {
      // Post-install commands run in the declared order, each one may depend
      // on the previous, and the first failure stops the rest.
      // deno-lint-ignore no-await-in-loop
      result = await runtime.exec.spawn(parts[0]!, parts.slice(1), {
        cwd,
        stdout: "inherit",
        stderr: "inherit",
        signal: controller.signal,
      });
    } catch (error) {
      // Node rejects an aborted spawn; Deno and Bun resolve it as a failure.
      const timedOut = controller.signal.aborted ? { timeoutMs } : {};
      throw new PostInstallError(cmd, null, { cause: error, ...timedOut });
    } finally {
      clearTimeout(timer);
    }

    if (controller.signal.aborted) {
      throw new PostInstallError(cmd, null, { timeoutMs });
    }

    if (!result.success) {
      throw new PostInstallError(cmd, result.code);
    }

    ran.push(cmd);
  }

  return ran;
};

// =============================================================================
// Variables pretty-print
// =============================================================================

/**
 * Prints the resolved variables on stderr, one `name = value` line each,
 * sorted by name. Prints nothing when there are none.
 */
export const printVariablesApplied = (
  variables: Readonly<Record<string, string>>,
): void => {
  const entries = Object.entries(variables).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  if (entries.length === 0) return;

  console.error("Variables applied:");
  for (const [name, value] of entries) {
    console.error(`  ${name} = ${value}`);
  }
};

// =============================================================================
// Recipe application — files mode (original per-file fetch path)
// =============================================================================

/**
 * Apply a recipe that lists its files: check every target, fetch and write
 * each file in order, then run the post-install commands.
 *
 * @throws {RecipePathTraversalError} When a file target leads outside
 *   `options.cwd`; nothing is written.
 * @throws {RecipeApplyError} When a file or folder cannot be fetched or
 *   written; the step's error is the `cause`.
 * @throws {PostInstallError} When a post-install command fails.
 */
export const applyFromFiles = async (
  recipe: registrySchema.Recipe,
  options: ApplyOptions,
  resolvedVariables: Readonly<Record<string, string>>,
): Promise<ApplyResult> => {
  const files = recipe.files!;
  const recipeName = recipe.name ?? UNNAMED_RECIPE;
  const written: string[] = [];
  const skipped: string[] = [];
  const total = files.length;

  const effectiveOptions = { ...options, variables: resolvedVariables };

  // Phase 1: Validate all file-level target paths
  for (const file of files) {
    const kind = file.kind ?? "file";
    if (kind === "file" && !isPathSafe(options.cwd, file.target)) {
      throw new RecipePathTraversalError(recipeName, file.target);
    }
  }

  // Phase 2: Check for conflicts (file-level only, unless force/skip)
  if (options.force !== true && options.skipExisting !== true) {
    const fileTargets = files.filter(
      (file) => (file.kind ?? "file") === "file",
    );
    // The checks are independent reads, one per declared file, so they run
    // together; the results are reported below in the declared order.
    const existing = await Promise.all(
      fileTargets.map((file) => fileExists(`${options.cwd}/${file.target}`)),
    );

    for (const [index, file] of fileTargets.entries()) {
      if (existing[index] !== true) continue;

      if (options.dryRun === true) {
        console.log(`  [conflict] ${file.target} (already exists)`);
      } else {
        console.warn(
          `  Warning: ${file.target} already exists. Use --force to overwrite or --skip-existing to skip.`,
        );
        skipped.push(file.target);
      }
    }
  }

  // Phase 3: Download and write files
  for (const file of files) {
    const kind = file.kind ?? "file";

    try {
      // Files apply one at a time: a failure reports how many files were
      // written before it, and each file is a separate registry request.
      if (kind === "folder") {
        // deno-lint-ignore no-await-in-loop
        await applyFolder(recipeName, file, effectiveOptions, written, skipped);
      } else {
        // deno-lint-ignore no-await-in-loop
        await applyFile(file, effectiveOptions, written, skipped);
      }
    } catch (error) {
      const what = kind === "folder" ? "folder " : "";
      throw new RecipeApplyError(
        recipeName,
        `copy ${what}${file.source} to ${file.target}`,
        [...written],
        { cause: error },
      );
    }
  }

  // Phase 4: Run post-install commands
  let postInstallRan: readonly string[] = [];
  if (
    options.skipPostInstall !== true &&
    recipe.postInstall !== undefined &&
    recipe.postInstall.length > 0
  ) {
    postInstallRan = await runPostInstall(
      recipe.postInstall,
      options.cwd,
      options.dryRun,
      options.verbose,
      options.postInstallTimeoutMs,
    );
  }

  return { written, skipped, total, postInstallRan };
};

// =============================================================================
// Recipe application — whole-repo mode (tarball fetch + walk)
// =============================================================================

/**
 * Copies one extracted repository file to its target: binary files byte for
 * byte, text files with variables substituted.
 */
const copyRepoFile = async (
  sourcePath: string,
  relPath: string,
  targetAbs: string,
  variables: Readonly<Record<string, string>>,
): Promise<void> => {
  await runtime.fs.ensureDir(runtime.path.dirname(targetAbs));

  if (processor.isBinaryFile(relPath)) {
    await runtime.fs.copyFile(sourcePath, targetAbs);
    return;
  }

  const content = await runtime.fs.readTextFile(sourcePath);
  await runtime.fs.writeTextFile(
    targetAbs,
    variableProcessor.substituteVariables(content, variables),
  );
};

/**
 * Apply a recipe without a file list: download the repository tarball named
 * by `options.specifier`, extract it within `options.maxBytes` and
 * `options.maxEntries`, and copy every file that `recipe.ignore` keeps.
 *
 * @throws {RecipeApplyError} When the download, the extraction or a file
 *   copy fails; the step's error (a TarballLimitError for an archive over
 *   the limits) is the `cause`.
 */
export const applyWholeRepo = async (
  recipe: registrySchema.Recipe,
  options: ApplyOptions,
  resolvedVariables: Readonly<Record<string, string>>,
): Promise<ApplyResult> => {
  if (options.specifier === undefined) {
    throw new TypeError(
      "apply recipe in whole-repo mode: options.specifier is missing; pass the clone specifier, such as gh:owner/repo",
    );
  }

  const specifier = options.specifier;
  const recipeName = recipe.name ?? specifier;
  const written: string[] = [];
  const skipped: string[] = [];

  const provider = providers.resolveProvider(specifier);
  const parsed = provider.parse(specifier);
  const { extractTarball } = await import("./tar.ts");

  const tempDir = await runtime.fs.makeTempDir({ prefix: "kit-clone-" });
  try {
    let stream: ReadableStream<Uint8Array>;
    try {
      stream = await provider.fetch(parsed);
    } catch (error) {
      throw new RecipeApplyError(recipeName, `download ${specifier}`, [], {
        cause: error,
      });
    }

    try {
      await extractTarball(stream, tempDir, {
        stripComponents: parsed.stripComponents,
        subpath: parsed.subpath,
        maxBytes: options.maxBytes,
        maxEntries: options.maxEntries,
      });
    } catch (error) {
      throw new RecipeApplyError(recipeName, `extract ${specifier}`, [], {
        cause: error,
      });
    }

    const alwaysIgnore = [".git", "recipe.json", "eser-registry.json"];
    const ignore = [...alwaysIgnore, ...(recipe.ignore ?? [])];

    for await (const entry of runtime.fs.walk(tempDir, {
      includeDirs: false,
    })) {
      const relPath = runtime.path.relative(tempDir, entry.path);

      if (processor.shouldIgnore(relPath, ignore)) continue;

      // Substitute vars in path (file and directory names)
      const targetRel = processor.substituteInPath(relPath, resolvedVariables);
      const targetAbs = runtime.path.join(options.cwd, targetRel);

      // Path-traversal guard (file layer, independent of tarball-layer guard)
      if (!isPathSafe(options.cwd, targetAbs)) continue;

      // Conflict check
      if ((await fileExists(targetAbs)) && options.force !== true) {
        if (options.skipExisting === true) {
          skipped.push(targetRel);
          if (options.verbose === true) {
            console.log(`  [skip] ${targetRel} (already exists)`);
          }
          continue;
        }
        console.warn(
          `  Warning: ${targetRel} already exists. Use --force to overwrite or --skip-existing to skip.`,
        );
        skipped.push(targetRel);
        continue;
      }

      if (options.dryRun === true) {
        console.log(`  [dry-run] would write ${targetRel}`);
        written.push(targetRel);
        continue;
      }

      if (options.verbose === true) {
        console.log(`  [write] ${targetRel}`);
      }

      try {
        await copyRepoFile(entry.path, relPath, targetAbs, resolvedVariables);
      } catch (error) {
        throw new RecipeApplyError(
          recipeName,
          `copy ${relPath} to ${targetRel}`,
          [...written],
          { cause: error },
        );
      }

      written.push(targetRel);
    }

    // Post-install (shared with files mode)
    let postInstallRan: readonly string[] = [];
    if (
      options.skipPostInstall !== true &&
      recipe.postInstall !== undefined &&
      recipe.postInstall.length > 0
    ) {
      postInstallRan = await runPostInstall(
        recipe.postInstall,
        options.cwd,
        options.dryRun,
        options.verbose,
        options.postInstallTimeoutMs,
      );
    }

    return {
      written,
      skipped,
      total: written.length + skipped.length,
      postInstallRan,
    };
  } finally {
    await runtime.fs.remove(tempDir, { recursive: true }).catch(() => {
      // Best-effort cleanup of the temp dir; a failure here must not hide the
      // result or the error that is already on its way out.
    });
  }
};

// =============================================================================
// Recipe application — dispatcher (single recipe)
// =============================================================================

/**
 * Apply a single recipe to the current project.
 *
 * Routes to `applyFromFiles` (per-file fetch, recipe.files present) or
 * `applyWholeRepo` (tarball fetch, recipe.files absent) based on the recipe.
 *
 * Security: validates all target paths are within cwd before any writes.
 * Supports variable substitution, post-install, force/skip-existing, dry-run.
 *
 * @throws {RecipeApplyError} When either mode stops partway; the failing
 *   step's error is the `cause`.
 * @throws {RecipePathTraversalError} When a target leads outside the project.
 * @throws {PostInstallError} When a post-install command fails.
 * @throws {RangeError} When `options.postInstallTimeoutMs` is set and is not
 *   a positive number; nothing is written.
 */
export const applyRecipe = async (
  recipe: registrySchema.Recipe,
  options: ApplyOptions,
): Promise<ApplyResult> => {
  // Checked before any file is written, so a bad option fails the apply at
  // the start instead of after the files are in place.
  if (options.postInstallTimeoutMs !== undefined) {
    assertPostInstallTimeout(options.postInstallTimeoutMs);
  }

  // Resolve variables (interactive prompt if enabled and stdin is a TTY)
  const resolvedVariables = await variableProcessor.resolveVariables(
    recipe.variables,
    options.variables ?? {},
    { interactive: options.interactive },
  );

  printVariablesApplied(resolvedVariables);

  if (recipe.files === undefined) {
    return await applyWholeRepo(recipe, options, resolvedVariables);
  }
  return await applyFromFiles(recipe, options, resolvedVariables);
};

// =============================================================================
// Recipe chain application (with requires resolution)
// =============================================================================

/**
 * Apply a recipe and all its dependencies in correct order.
 * Resolves the requires graph, then applies each recipe sequentially.
 */
export const applyRecipeChain = async (
  recipeName: string,
  allRecipes: readonly registrySchema.Recipe[],
  options: ApplyOptions,
): Promise<ApplyChainResult> => {
  const orderedRecipes = requiresResolver.resolveRequires(
    recipeName,
    allRecipes,
  );

  const results: { name: string; result: ApplyResult }[] = [];

  for (const recipe of orderedRecipes) {
    if (options.verbose === true) {
      console.log(`\nApplying recipe: ${recipe.name}`);
    }

    // Recipes apply in dependency order: each one may build on the files of
    // the recipes it requires.
    // deno-lint-ignore no-await-in-loop
    const result = await applyRecipe(recipe, options);
    results.push({ name: recipe.name ?? "", result });
  }

  return { recipes: results };
};
