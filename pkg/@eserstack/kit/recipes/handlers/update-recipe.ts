// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Update recipe handler — pure business logic for re-fetching and
 * re-applying a previously applied recipe.
 *
 * @module
 */

import * as task from "@eserstack/functions/task";
import * as results from "@eserstack/primitives/results";
import * as span from "@eserstack/streams/span";
import * as registryFetcher from "../registry-fetcher.ts";
import * as recipeApplier from "../recipe-applier.ts";
import type * as registrySchema from "../registry-schema.ts";
import type { HandlerContext } from "../handler-context.ts";
import * as errorChain from "../error-chain.ts";
import * as ffiClient from "../../ffi-client.ts";

// =============================================================================
// Types
// =============================================================================

/** Which recipe to update, and where. */
export type UpdateRecipeInput = {
  /** The name of the recipe in the registry. */
  readonly recipeName: string;
  /** The project directory the recipe was applied to. */
  readonly cwd: string;
  /** Path or URL of the registry manifest; the default registry when absent. */
  readonly registrySource?: string;
  /** Without a source, look for a `.eser/recipes.json` in the working directory or a parent first. */
  readonly local?: boolean;
  /** Print what would be written, and write nothing. */
  readonly dryRun?: boolean;
  /** Print a line for each file. */
  readonly verbose?: boolean;
};

/**
 * What the update did. When the native ajan library applied the recipe,
 * `recipe` carries only its name.
 */
export type UpdateRecipeOutput = {
  /** The recipe from the registry. */
  readonly recipe: registrySchema.Recipe;
  /** The files written and the post-install commands that ran. */
  readonly result: recipeApplier.ApplyResult;
};

/**
 * Why the command stopped. `message` renders the whole cause chain for the
 * person running the command; `cause` is the original error, for matching
 * on its type (a RegistryLoadError for RegistryError, a RecipeApplyError
 * or PostInstallError for ApplyError).
 */
export type UpdateRecipeError =
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
 * Fetches a registry recipe again and writes its files into `input.cwd`,
 * overwriting the copies there, then writes the progress to `ctx.out`. The
 * recipes it requires are not applied again, and its variables take their
 * defaults. Uses the native ajan library when it loads, and the TypeScript
 * applier otherwise.
 *
 * @param input - The recipe and the project directory
 * @returns A task that resolves to what was written, or fails with a
 *   RegistryError, RecipeNotFound or ApplyError
 */
export const updateRecipe = (
  input: UpdateRecipeInput,
): task.Task<UpdateRecipeOutput, UpdateRecipeError, HandlerContext> =>
  task.task<UpdateRecipeOutput, UpdateRecipeError, HandlerContext>(
    async (ctx: HandlerContext) => {
      try {
        await ffiClient.ensureLib();
        const lib = ffiClient.getLib();

        if (lib !== null) {
          const raw = lib.symbols.EserAjanKitUpdateRecipe(
            JSON.stringify({
              recipeName: input.recipeName,
              cwd: input.cwd,
              registrySource: input.registrySource,
              dryRun: input.dryRun,
              verbose: input.verbose,
            }),
          );
          const goResult = JSON.parse(raw) as {
            recipes?: Array<{
              name: string;
              written?: string[];
              skipped: string[];
              total: number;
              postInstallRan: string[];
            }>;
            error?: string;
          };

          if (goResult.error === undefined && goResult.recipes !== undefined) {
            let totalWritten = 0;
            for (const entry of goResult.recipes) {
              totalWritten += (entry.written ?? []).length;
            }

            const verb = input.dryRun ? "Would update" : "Updated";
            ctx.out.writeln(
              span.green(
                `✓ ${verb} ${totalWritten} file(s) from ${input.recipeName}`,
              ),
            );

            const mainRecipe = goResult.recipes.find(
              (r) => r.name === input.recipeName,
            ) ?? goResult.recipes[0];

            if (mainRecipe !== undefined) {
              for (const file of mainRecipe.written ?? []) {
                ctx.out.writeln(`  → ${file}`);
              }
            }

            const fakeRecipe = {
              name: input.recipeName,
            } as unknown as registrySchema.Recipe;
            const fakeResult = {
              written: goResult.recipes.flatMap((r) => r.written ?? []),
              skipped: goResult.recipes.flatMap((r) => r.skipped ?? []),
              total: goResult.recipes.reduce((s, r) => s + r.total, 0),
              postInstallRan: goResult.recipes.flatMap(
                (r) => r.postInstallRan ?? [],
              ),
            } as unknown as recipeApplier.ApplyResult;

            return results.ok({ recipe: fakeRecipe, result: fakeResult });
          }

          // Only the bridge's error for this recipe means it is absent. Any
          // other error, such as a registry that cannot be read, falls
          // through to the TypeScript path, which reports it with its cause.
          if (
            goResult.error?.startsWith(
              `recipe '${input.recipeName}' not found`,
            ) === true
          ) {
            return results.fail({
              _tag: "RecipeNotFound" as const,
              message: goResult.error,
            });
          }
        }

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

        const result = await recipeApplier.applyRecipe(recipe, {
          cwd: input.cwd,
          registryUrl: manifest.registryUrl,
          force: true,
          dryRun: input.dryRun,
          verbose: input.verbose,
        });

        // Format output
        const verb = input.dryRun ? "Would update" : "Updated";
        ctx.out.writeln(
          span.green(
            `✓ ${verb} ${result.written.length} file(s) from ${recipe.name}`,
          ),
        );

        for (const file of result.written) {
          ctx.out.writeln(`  → ${file}`);
        }

        return results.ok({ recipe, result });
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
