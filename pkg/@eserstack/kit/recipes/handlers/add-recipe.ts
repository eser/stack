// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Add recipe handler — pure business logic for applying a recipe
 * from the registry to an existing project.
 *
 * No CLI dependency. Output goes through ctx.out (Span-based).
 * Delegates to native Go library when available; falls back to TS apply chain.
 *
 * @module
 */

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

/** Which recipe to add, where, and how. */
export type AddRecipeInput = {
  /** The name of the recipe in the registry. */
  readonly recipeName: string;
  /** The project directory to write into. */
  readonly cwd: string;
  /** Path or URL of the registry manifest; the default registry when absent. */
  readonly registrySource?: string;
  /** Without a source, look for a `.eser/recipes.json` in the working directory or a parent first. */
  readonly local?: boolean;
  /** Print what would be written, and write and install nothing. */
  readonly dryRun?: boolean;
  /** Overwrite files that already exist. */
  readonly force?: boolean;
  /** Leave files that already exist as they are, without a warning. */
  readonly skipExisting?: boolean;
  /** Print a line for each file. */
  readonly verbose?: boolean;
  /** Print the dependency install commands instead of running them. */
  readonly noInstall?: boolean;
  /** Values for the recipe's variables by name; they win over the defaults. */
  readonly variables?: Readonly<Record<string, string>>;
};

/**
 * What the add did. When the native ajan library applied the recipe,
 * `recipe` carries only its name and `depInfo` is empty.
 */
export type AddRecipeOutput = {
  /** The recipe from the registry. */
  readonly recipe: registrySchema.Recipe;
  /** What each applied recipe wrote, the required recipes first. */
  readonly chainResult: recipeApplier.ApplyChainResult;
  /** The install commands for the recipe's dependencies, and any warnings. */
  readonly depInfo: dependencyResolver.DependencyInstructions;
  /** The outcome of each install command that ran; absent when none ran. */
  readonly installResults?: readonly dependencyResolver.InstallResult[];
};

/**
 * Why the command stopped. `message` renders the whole cause chain for the
 * person running the command; `cause` is the original error, for matching
 * on its type (a RegistryLoadError for RegistryError, a RecipeApplyError
 * or PostInstallError for ApplyError).
 */
export type AddRecipeError =
  | {
    readonly _tag: "RegistryError";
    readonly message: string;
    readonly cause: unknown;
  }
  | { readonly _tag: "RecipeNotFound"; readonly message: string }
  | {
    readonly _tag: "ApplyError";
    readonly message: string;
    readonly cause: unknown;
  };

// =============================================================================
// Handler
// =============================================================================

/**
 * Applies a registry recipe, after the recipes it requires, to the project in
 * `input.cwd`, and writes the progress to `ctx.out`. Uses the native ajan
 * library when it loads. Otherwise the TypeScript applier runs and then
 * installs the recipe's dependencies, unless `noInstall` or `dryRun` is set.
 *
 * @param input - The recipe, the project directory and the options
 * @returns A task that resolves to what was applied, or fails with a
 *   RegistryError, RecipeNotFound or ApplyError
 */
export const addRecipe = (
  input: AddRecipeInput,
): task.Task<AddRecipeOutput, AddRecipeError, HandlerContext> =>
  task.task<AddRecipeOutput, AddRecipeError, HandlerContext>(
    async (ctx: HandlerContext) => {
      try {
        await ffiClient.ensureLib();
        const lib = ffiClient.getLib();

        if (lib !== null) {
          const raw = lib.symbols.EserAjanKitApplyRecipe(
            JSON.stringify({
              recipeName: input.recipeName,
              registryUrl: input.registrySource,
              cwd: input.cwd,
              force: input.force,
              skipExisting: input.skipExisting,
              dryRun: input.dryRun,
              verbose: input.verbose,
              variables: input.variables,
            }),
          );
          // The bridge sends each recipe flat (bridge_kit.go
          // kitApplyRecipeResult) and leaves empty lists out.
          const goResult = JSON.parse(raw) as {
            recipes?: Array<{
              name: string;
              written?: string[];
              skipped?: string[];
              total?: number;
              postInstallRan?: string[];
            }>;
            error?: string;
          };

          if (goResult.error === undefined && goResult.recipes !== undefined) {
            const applied = goResult.recipes.map((entry) => ({
              name: entry.name,
              result: {
                written: entry.written ?? [],
                skipped: entry.skipped ?? [],
                total: entry.total ?? 0,
                postInstallRan: entry.postInstallRan ?? [],
              },
            }));
            let totalWritten = 0;
            let totalSkipped = 0;
            for (const entry of applied) {
              totalWritten += entry.result.written.length;
              totalSkipped += entry.result.skipped.length;
            }

            ctx.out.writeln(span.green(`✓ Added ${totalWritten} file(s)`));

            if (applied.length > 1) {
              ctx.out.writeln(
                span.dim(
                  `  Applied ${applied.length} recipes (including dependencies)`,
                ),
              );
            }

            if (totalSkipped > 0) {
              ctx.out.writeln(
                span.dim(`  Skipped ${totalSkipped} existing file(s)`),
              );
            }

            const targetResult = applied.find(
              (r) => r.name === input.recipeName,
            );
            if (targetResult !== undefined) {
              for (const file of targetResult.result.written) {
                ctx.out.writeln(`  → ${file}`);
              }
            }

            const chainResult = {
              recipes: applied,
            } as unknown as recipeApplier.ApplyChainResult;
            const depInfo = {
              instructions: [],
              warnings: [],
            } as unknown as dependencyResolver.DependencyInstructions;
            const fakeRecipe = {
              name: input.recipeName,
            } as unknown as registrySchema.Recipe;

            return results.ok({
              recipe: fakeRecipe,
              chainResult,
              depInfo,
              installResults: undefined,
            });
          }

          // Only the bridge's error for this recipe means it is absent. Any
          // other error, such as a registry that cannot be read, falls
          // through to the TypeScript path, which reports it with its cause.
          if (
            goResult.error?.includes(
              `recipe "${input.recipeName}" not found`,
            ) === true
          ) {
            return results.fail({
              _tag: "RecipeNotFound" as const,
              message:
                `Recipe '${input.recipeName}' not found. Run \`eser kit list\` to see available recipes.`,
            });
          }
        }

        // Fallback: TS apply chain
        const manifest = await registryFetcher.fetchRegistry(
          input.registrySource,
          { verbose: input.verbose, local: input.local, cwd: input.cwd },
        );

        const recipe = manifest.recipes.find(
          (r) => r.name === input.recipeName,
        );

        if (recipe === undefined) {
          return results.fail({
            _tag: "RecipeNotFound" as const,
            message:
              `Recipe '${input.recipeName}' not found. Run \`eser kit list\` to see available recipes.`,
          });
        }

        const project = await dependencyResolver.detectProjectType(input.cwd);
        const depInfo = dependencyResolver.getDependencyInstructions(
          recipe,
          project,
        );

        for (const warning of depInfo.warnings) {
          ctx.out.writeln(span.yellow(`Warning: ${warning}`));
        }

        const chainResult = await recipeApplier.applyRecipeChain(
          input.recipeName,
          manifest.recipes,
          {
            cwd: input.cwd,
            registryUrl: manifest.registryUrl,
            force: input.force,
            skipExisting: input.skipExisting,
            dryRun: input.dryRun,
            verbose: input.verbose,
            variables: input.variables,
          },
        );

        let totalWritten = 0;
        let totalSkipped = 0;
        for (const entry of chainResult.recipes) {
          totalWritten += entry.result.written.length;
          totalSkipped += entry.result.skipped.length;
        }

        ctx.out.writeln(span.green(`✓ Added ${totalWritten} file(s)`));

        if (chainResult.recipes.length > 1) {
          ctx.out.writeln(
            span.dim(
              `  Applied ${chainResult.recipes.length} recipes (including dependencies)`,
            ),
          );
        }

        if (totalSkipped > 0) {
          ctx.out.writeln(
            span.dim(`  Skipped ${totalSkipped} existing file(s)`),
          );
        }

        const targetResult = chainResult.recipes.find(
          (r) => r.name === input.recipeName,
        );
        if (targetResult !== undefined) {
          for (const file of targetResult.result.written) {
            ctx.out.writeln(`  → ${file}`);
          }
        }

        let installResults:
          | readonly dependencyResolver.InstallResult[]
          | undefined;

        if (
          !input.noInstall && !input.dryRun && depInfo.instructions.length > 0
        ) {
          ctx.out.writeln(span.dim("\nInstalling dependencies..."));
          installResults = await dependencyResolver.installDependencies(
            depInfo.instructions,
            input.cwd,
            { verbose: input.verbose },
          );

          for (const ir of installResults) {
            if (ir.success) {
              ctx.out.writeln(span.green(`  ✓ ${ir.command}`));
            } else {
              ctx.out.writeln(span.red(`  ✗ ${ir.command}: ${ir.error}`));
            }
          }
        } else if (depInfo.instructions.length > 0) {
          ctx.out.writeln(span.dim("\nDependencies (run manually):"));
          for (const instruction of depInfo.instructions) {
            ctx.out.writeln(span.dim(`  ${instruction}`));
          }
        }

        return results.ok({ recipe, chainResult, depInfo, installResults });
      } catch (error) {
        const message = errorChain.formatErrorChain(error);
        if (error instanceof registryFetcher.RegistryLoadError) {
          return results.fail({
            _tag: "RegistryError" as const,
            message,
            cause: error,
          });
        }

        return results.fail({
          _tag: "ApplyError" as const,
          message,
          cause: error,
        });
      }
    },
  );
