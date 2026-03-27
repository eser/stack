// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

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

import { runtime } from "@eser/standards/cross-runtime";
import * as registrySchema from "./registry-schema.ts";
import * as registryFetcher from "./registry-fetcher.ts";
import * as variableProcessor from "./variable-processor.ts";
import * as requiresResolver from "./requires-resolver.ts";

// =============================================================================
// Types
// =============================================================================

interface ApplyOptions {
  readonly cwd: string;
  readonly registryUrl: string;
  readonly force?: boolean;
  readonly skipExisting?: boolean;
  readonly dryRun?: boolean;
  readonly verbose?: boolean;
  readonly variables?: Readonly<Record<string, string>>;
}

interface ApplyResult {
  readonly written: readonly string[];
  readonly skipped: readonly string[];
  readonly total: number;
  readonly postInstallRan: readonly string[];
}

interface ApplyChainResult {
  readonly recipes: readonly {
    readonly name: string;
    readonly result: ApplyResult;
  }[];
}

// =============================================================================
// Security: Path traversal check
// =============================================================================

/**
 * Validate that a target path does not escape the project directory.
 * Prevents malicious registries from writing to arbitrary locations.
 */
const isPathSafe = (cwd: string, target: string): boolean => {
  const resolvedCwd = cwd.endsWith("/") ? cwd : `${cwd}/`;
  const resolvedTarget = new URL(target, `file://${resolvedCwd}`).pathname;

  return resolvedTarget.startsWith(resolvedCwd) ||
    resolvedTarget === cwd;
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

const fileExists = async (path: string): Promise<boolean> => {
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
const processContent = (
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
        // deno-lint-ignore no-console
        console.log(`  [skip] ${file.target} (already exists)`);
      }
      skipped.push(file.target);
      return;
    }
  }

  if (options.dryRun === true) {
    // deno-lint-ignore no-console
    console.log(`  [dry-run] would write ${file.target}`);
    written.push(file.target);
    return;
  }

  if (options.verbose === true) {
    // deno-lint-ignore no-console
    console.log(`  [write] ${file.target}`);
  }

  const content = await registryFetcher.fetchRecipeFile(
    options.registryUrl,
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
  file: registrySchema.RecipeFile,
  options: ApplyOptions,
  written: string[],
  skipped: string[],
): Promise<void> => {
  // Fetch all files in the folder into memory first
  const fetchedFiles = await registryFetcher.fetchRecipeFolder(
    options.registryUrl,
    file.source,
  );

  // Validate all target paths before writing anything
  for (const fetched of fetchedFiles) {
    const targetPath = `${file.target}/${fetched.path}`;
    if (!isPathSafe(options.cwd, targetPath)) {
      throw new Error(
        `Folder recipe contains path traversal in '${targetPath}'. Aborting.`,
      );
    }
  }

  // Write all files (atomic — we already have all content in memory)
  for (const fetched of fetchedFiles) {
    const relativePath = `${file.target}/${fetched.path}`;
    const targetPath = `${options.cwd}/${relativePath}`;

    if (options.skipExisting === true) {
      const exists = await fileExists(targetPath);
      if (exists) {
        skipped.push(relativePath);
        continue;
      }
    }

    if (options.dryRun === true) {
      // deno-lint-ignore no-console
      console.log(`  [dry-run] would write ${relativePath}`);
      written.push(relativePath);
      continue;
    }

    if (options.verbose === true) {
      // deno-lint-ignore no-console
      console.log(`  [write] ${relativePath}`);
    }

    const processed = processContent(fetched.content, options.variables);

    await ensureParentDir(targetPath);
    await runtime.fs.writeTextFile(targetPath, processed);
    written.push(relativePath);
  }
};

// =============================================================================
// Post-install commands
// =============================================================================

const runPostInstall = async (
  commands: readonly string[],
  cwd: string,
  dryRun?: boolean,
  verbose?: boolean,
): Promise<readonly string[]> => {
  const ran: string[] = [];

  for (const cmd of commands) {
    if (dryRun === true) {
      // deno-lint-ignore no-console
      console.log(`  [dry-run] would run: ${cmd}`);
      ran.push(cmd);
      continue;
    }

    if (verbose === true) {
      // deno-lint-ignore no-console
      console.log(`  [post-install] ${cmd}`);
    }

    const parts = cmd.split(/\s+/);
    const result = await runtime.exec.spawn(
      parts[0]!,
      parts.slice(1),
      {
        cwd,
        stdout: "inherit",
        stderr: "inherit",
      },
    );

    if (!result.success) {
      throw new Error(
        `Post-install command failed: '${cmd}' (exit code ${result.code})`,
      );
    }

    ran.push(cmd);
  }

  return ran;
};

// =============================================================================
// Recipe application (single recipe)
// =============================================================================

/**
 * Apply a single recipe to the current project.
 *
 * Security: validates all target paths are within cwd before any writes.
 * Supports file and folder entries, variable substitution, and post-install.
 */
const applyRecipe = async (
  recipe: registrySchema.Recipe,
  options: ApplyOptions,
): Promise<ApplyResult> => {
  const written: string[] = [];
  const skipped: string[] = [];
  const total = recipe.files.length;

  // Resolve variables if recipe defines them
  let resolvedVariables = options.variables;
  if (
    recipe.variables !== undefined && recipe.variables.length > 0
  ) {
    resolvedVariables = variableProcessor.resolveVariables(
      recipe.variables,
      options.variables ?? {},
    );
  }

  const effectiveOptions = { ...options, variables: resolvedVariables };

  // Phase 1: Validate all file-level target paths
  for (const file of recipe.files) {
    const kind = file.kind ?? "file";
    if (kind === "file" && !isPathSafe(options.cwd, file.target)) {
      throw new Error(
        `Recipe '${recipe.name}' contains path traversal in target '${file.target}'. Aborting.`,
      );
    }
    // Folder targets are validated during applyFolder after listing contents
  }

  // Phase 2: Check for conflicts (file-level only, unless force/skip)
  if (options.force !== true && options.skipExisting !== true) {
    for (const file of recipe.files) {
      const kind = file.kind ?? "file";
      if (kind !== "file") continue;

      const targetPath = `${options.cwd}/${file.target}`;
      const exists = await fileExists(targetPath);

      if (exists) {
        if (options.dryRun === true) {
          // deno-lint-ignore no-console
          console.log(`  [conflict] ${file.target} (already exists)`);
        } else {
          // deno-lint-ignore no-console
          console.warn(
            `  Warning: ${file.target} already exists. Use --force to overwrite or --skip-existing to skip.`,
          );
          skipped.push(file.target);
        }
      }
    }
  }

  // Phase 3: Download and write files
  for (const file of recipe.files) {
    const kind = file.kind ?? "file";

    try {
      if (kind === "folder") {
        await applyFolder(file, effectiveOptions, written, skipped);
      } else {
        await applyFile(file, effectiveOptions, written, skipped);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed applying '${file.target}'. ${written.length} files written so far. ` +
          `Retry with \`eser kit add ${recipe.name} --force\`. Cause: ${msg}`,
      );
    }
  }

  // Phase 4: Run post-install commands
  let postInstallRan: readonly string[] = [];
  if (recipe.postInstall !== undefined && recipe.postInstall.length > 0) {
    postInstallRan = await runPostInstall(
      recipe.postInstall,
      options.cwd,
      options.dryRun,
      options.verbose,
    );
  }

  return { written, skipped, total, postInstallRan };
};

// =============================================================================
// Recipe chain application (with requires resolution)
// =============================================================================

/**
 * Apply a recipe and all its dependencies in correct order.
 * Resolves the requires graph, then applies each recipe sequentially.
 */
const applyRecipeChain = async (
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
      // deno-lint-ignore no-console
      console.log(`\nApplying recipe: ${recipe.name}`);
    }

    const result = await applyRecipe(recipe, options);
    results.push({ name: recipe.name, result });
  }

  return { recipes: results };
};

export {
  applyRecipe,
  applyRecipeChain,
  fileExists,
  isPathSafe,
  processContent,
  runPostInstall,
};

export type { ApplyChainResult, ApplyOptions, ApplyResult };
