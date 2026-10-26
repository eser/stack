// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Clone recipe handler — pure business logic for cloning a recipe
 * from any GitHub repo.
 *
 * @module
 */

import { runtime } from "@eserstack/standards/cross-runtime";
import * as task from "@eserstack/functions/task";
import * as results from "@eserstack/primitives/results";
import * as span from "@eserstack/streams/span";
import * as registryFetcher from "../registry-fetcher.ts";
import * as recipeApplier from "../recipe-applier.ts";
import * as dependencyResolver from "../dependency-resolver.ts";
import type * as registrySchema from "../registry-schema.ts";
import type { HandlerContext } from "../handler-context.ts";
import * as errorChain from "../error-chain.ts";
import * as ffiClient from "../../ffi-client.ts";

// =============================================================================
// Types
// =============================================================================

/** A specifier that names a GitHub repository, as {@link parseSpecifier} returns it. */
export type ParsedSpecifier = registryFetcher.ResolvedSpecifier & {
  readonly kind: "repo";
};

/** What to clone, where, and how. */
export type CloneRecipeInput = {
  /** The repository, and the subpath and ref in it, to clone. */
  readonly specifier: ParsedSpecifier;
  /**
   * Path of the recipe file in the repository or subpath; `recipe.json` when
   * absent. Without that file, the whole repository or subpath is copied.
   */
  readonly recipePath?: string;
  /** The directory to clone into. */
  readonly cwd: string;
  /**
   * Clone into the `cwd/projectName` directory instead, created when missing.
   * It also fills the `project_name` variable unless `variables` sets one.
   */
  readonly projectName?: string;
  /** Print what would be written, and write nothing, not even `projectName`'s directory. */
  readonly dryRun?: boolean;
  /** Overwrite files that already exist. */
  readonly force?: boolean;
  /** Leave files that already exist as they are, without a warning. */
  readonly skipExisting?: boolean;
  /** Print a line for each file. */
  readonly verbose?: boolean;
  /** Values for the recipe's variables by name; they win over the defaults. */
  readonly variables?: Readonly<Record<string, string>>;
  /** Prompt on the terminal for variables that have no value and no default. */
  readonly interactive?: boolean;
  /** Do not run the recipe's post-install commands. */
  readonly skipPostInstall?: boolean;
  /**
   * Whole-repo mode: the most decompressed bytes read from the repository
   * tarball. Defaults to the extractor's DEFAULT_MAX_BYTES (256 MiB).
   */
  readonly maxBytes?: number;
  /**
   * Whole-repo mode: the most entries read from the repository tarball.
   * Defaults to the extractor's DEFAULT_MAX_ENTRIES (20,000).
   */
  readonly maxEntries?: number;
};

/**
 * What the clone did. When the native ajan library applied the recipe,
 * `recipe` carries only the repository name and `depInfo` is empty.
 */
export type CloneRecipeOutput = {
  /** The repository's recipe, or an empty one when it has no recipe file. */
  readonly recipe: registrySchema.Recipe;
  /** The files written and the post-install commands that ran. */
  readonly result: recipeApplier.ApplyResult;
  /** The install commands for the recipe's dependencies, and any warnings. */
  readonly depInfo: dependencyResolver.DependencyInstructions;
  /** The directory the files were written to. */
  readonly targetDir: string;
};

/**
 * Why a clone stopped. `message` renders the whole cause chain for the
 * person running the command; `cause` is the original error, for matching
 * on its type (a RecipeLoadError for FetchError, a RecipeApplyError or
 * PostInstallError for ApplyError).
 */
export type CloneRecipeError =
  | {
      readonly _tag: "FetchError";
      readonly message: string;
      readonly cause: unknown;
    }
  | {
      readonly _tag: "ApplyError";
      readonly message: string;
      readonly cause: unknown;
    };

// =============================================================================
// FFI eligibility — features the Go bridge does NOT implement
// =============================================================================

const canUseFfiPath = (
  recipe: registrySchema.Recipe,
  input: CloneRecipeInput,
): boolean => {
  if (recipe.files === undefined) return false; // whole-repo mode
  if (recipe.ignore !== undefined) return false; // FFI has no ignore-glob support
  if (input.interactive === true) return false; // FFI has no prompt loop
  if (input.skipPostInstall === true) return false; // FFI runs post-install unconditionally

  const hasNameSubstitution = recipe.files.some(
    (f) => f.source.includes("{{.") || f.target.includes("{{."),
  );
  // Files mode writes {{.var}} in source and target paths literally on both
  // engines (only whole-repo mode substitutes paths); such recipes stay on
  // the TypeScript engine.
  if (hasNameSubstitution) return false;

  const hasPatternedVar =
    recipe.variables?.some((v) => v.pattern !== undefined) ?? false;
  if (hasPatternedVar) return false; // FFI doesn't validate regex patterns

  return true;
};

// =============================================================================
// Specifier parsing (delegates to shared resolver)
// =============================================================================

/**
 * Parses a clone specifier such as `gh:owner/repo/sub#ref` (see
 * `resolveSpecifier` in the fetcher for every form). Returns undefined when
 * the specifier names a registry recipe rather than a repository.
 */
export const parseSpecifier = (
  specifier: string,
): ParsedSpecifier | undefined => {
  const resolved = registryFetcher.resolveSpecifier(specifier);

  if (resolved.kind !== "repo") {
    return undefined;
  }

  return resolved;
};

// =============================================================================
// Handler
// =============================================================================

/**
 * Clones a recipe from a GitHub repository into `input.cwd`, or into its
 * `projectName` subdirectory, and writes the progress to `ctx.out`. It reads
 * the recipe file from the repository or subpath. When the file is not there
 * (HTTP 404), it copies the whole repository or subpath from its tarball,
 * within `maxBytes` and `maxEntries`. The native ajan library applies the
 * file-list recipes it supports; the TypeScript applier does the rest.
 *
 * @param input - The repository, the target directory and the options
 * @returns A task that resolves to what was cloned, or fails with a
 *   FetchError when the recipe file cannot be loaded, or an ApplyError
 */
export const cloneRecipe = (
  input: CloneRecipeInput,
): task.Task<CloneRecipeOutput, CloneRecipeError, HandlerContext> =>
  task.task<CloneRecipeOutput, CloneRecipeError, HandlerContext>(
    async (ctx: HandlerContext) => {
      try {
        const { specifier } = input;
        const recipePath = input.recipePath ?? "recipe.json";

        // ── Step 1: Fetch recipe.json (synthesize empty recipe on path-specific 404) ──
        let recipe: registrySchema.Recipe;
        try {
          recipe = await registryFetcher.fetchRecipeFromRepo(
            specifier.owner,
            specifier.repo,
            specifier.ref,
            recipePath,
            specifier.subpath,
          );
        } catch (error) {
          if (!(error instanceof registryFetcher.RecipeFileNotFoundError)) {
            return results.fail({
              _tag: "FetchError" as const,
              message: errorChain.formatErrorChain(error),
              cause: error,
            });
          }

          // recipe.json absent → whole-repo mode with empty recipe
          recipe = { schema: "registry/v1" } as registrySchema.Recipe;
        }

        // ── Step 2: Try Go FFI fast path when eligible ──
        if (canUseFfiPath(recipe, input)) {
          await ffiClient.ensureLib();
          const lib = ffiClient.getLib();

          if (lib !== null) {
            const specifierStr =
              specifier.subpath !== undefined
                ? `gh:${specifier.owner}/${specifier.repo}/${specifier.subpath}#${specifier.ref}`
                : `gh:${specifier.owner}/${specifier.repo}#${specifier.ref}`;

            const goResult = lib.call("kitCloneRecipe", {
              specifier: specifierStr,
              cwd: input.cwd,
              projectName: input.projectName,
              dryRun: input.dryRun,
              force: input.force,
              skipExisting: input.skipExisting,
              verbose: input.verbose,
              variables: input.variables,
            }) as {
              recipes?: Array<{
                name: string;
                written?: string[];
                skipped: string[];
                total: number;
                postInstallRan: string[];
              }>;
              error?: string;
            };

            if (
              goResult.error === undefined &&
              goResult.recipes !== undefined
            ) {
              let totalWritten = 0;
              for (const entry of goResult.recipes) {
                totalWritten += (entry.written ?? []).length;
              }

              const targetDir =
                input.projectName !== undefined
                  ? `${input.cwd}/${input.projectName}`
                  : input.cwd;

              const verb = input.dryRun ? "Would write" : "Cloned";
              ctx.out.writeln(span.green(`✓ ${verb} ${totalWritten} file(s)`));

              const mainRecipe =
                goResult.recipes.find((r) => r.name === specifier.repo) ??
                goResult.recipes[0];

              if (mainRecipe !== undefined) {
                for (const file of mainRecipe.written ?? []) {
                  ctx.out.writeln(`  → ${file}`);
                }
              }

              const fakeRecipe = {
                name: specifier.repo,
              } as unknown as registrySchema.Recipe;
              const fakeResult = {
                written: goResult.recipes.flatMap((r) => r.written ?? []),
                skipped: goResult.recipes.flatMap((r) => r.skipped ?? []),
                total: goResult.recipes.reduce((s, r) => s + r.total, 0),
                postInstallRan: goResult.recipes.flatMap(
                  (r) => r.postInstallRan ?? [],
                ),
              } as unknown as recipeApplier.ApplyResult;
              const fakeDepInfo = {
                instructions: [],
                warnings: [],
              } as unknown as dependencyResolver.DependencyInstructions;

              return results.ok({
                recipe: fakeRecipe,
                result: fakeResult,
                depInfo: fakeDepInfo,
                targetDir,
              });
            }
          }
        }

        // ── Step 3: TypeScript path (files mode or whole-repo mode) ──
        let targetDir = input.cwd;
        if (input.projectName !== undefined) {
          targetDir = `${input.cwd}/${input.projectName}`;
          if (input.dryRun !== true) {
            await runtime.fs.mkdir(targetDir, { recursive: true });
          }
        }

        const variables: Record<string, string> = { ...input.variables };
        if (
          input.projectName !== undefined &&
          variables["project_name"] === undefined
        ) {
          variables["project_name"] = input.projectName;
        }

        const registryUrl = `https://raw.githubusercontent.com/${specifier.owner}/${specifier.repo}/${specifier.ref}`;

        const specifierStr =
          specifier.subpath !== undefined
            ? `gh:${specifier.owner}/${specifier.repo}/${specifier.subpath}#${specifier.ref}`
            : `gh:${specifier.owner}/${specifier.repo}#${specifier.ref}`;

        const result = await recipeApplier.applyRecipe(recipe, {
          cwd: targetDir,
          registryUrl,
          specifier: specifierStr,
          force: input.force,
          skipExisting: input.skipExisting,
          dryRun: input.dryRun,
          verbose: input.verbose,
          variables,
          interactive: input.interactive,
          skipPostInstall: input.skipPostInstall,
          maxBytes: input.maxBytes,
          maxEntries: input.maxEntries,
        });

        const project = await dependencyResolver.detectProjectType(targetDir);
        const depInfo = dependencyResolver.getDependencyInstructions(
          recipe,
          project,
        );

        const verb = input.dryRun ? "Would write" : "Cloned";
        ctx.out.writeln(
          span.green(
            `✓ ${verb} ${result.written.length} file(s) from ${
              recipe.name ?? specifier.repo
            }`,
          ),
        );

        for (const file of result.written) {
          ctx.out.writeln(`  → ${file}`);
        }

        if (result.postInstallRan.length > 0) {
          ctx.out.writeln(span.dim("\nPost-install:"));
          for (const cmd of result.postInstallRan) {
            ctx.out.writeln(span.dim(`  ✓ ${cmd}`));
          }
        }

        if (depInfo.instructions.length > 0) {
          ctx.out.writeln(span.dim("\nDependencies:"));
          for (const instruction of depInfo.instructions) {
            ctx.out.writeln(span.dim(`  Run: ${instruction}`));
          }
        }

        return results.ok({ recipe, result, depInfo, targetDir });
      } catch (error) {
        return results.fail({
          _tag: "ApplyError" as const,
          message: errorChain.formatErrorChain(error),
          cause: error,
        });
      }
    },
  );
