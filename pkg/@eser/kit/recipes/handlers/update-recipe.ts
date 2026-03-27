// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Update recipe handler — pure business logic for re-fetching and
 * re-applying a previously applied recipe.
 *
 * @module
 */

import * as task from "@eser/functions/task";
import * as results from "@eser/primitives/results";
import * as span from "@eser/streams/span";
import * as registryFetcher from "../registry-fetcher.ts";
import * as recipeApplier from "../recipe-applier.ts";
import type * as registrySchema from "../registry-schema.ts";
import type { HandlerContext } from "../handler-context.ts";

// =============================================================================
// Types
// =============================================================================

type UpdateRecipeInput = {
  readonly recipeName: string;
  readonly cwd: string;
  readonly registrySource?: string;
  readonly local?: boolean;
  readonly dryRun?: boolean;
  readonly verbose?: boolean;
};

type UpdateRecipeOutput = {
  readonly recipe: registrySchema.Recipe;
  readonly result: recipeApplier.ApplyResult;
};

type UpdateRecipeError =
  | { readonly _tag: "RegistryError"; readonly message: string }
  | { readonly _tag: "RecipeNotFound"; readonly message: string }
  | { readonly _tag: "ApplyError"; readonly message: string };

// =============================================================================
// Handler
// =============================================================================

const updateRecipe = (
  input: UpdateRecipeInput,
): task.Task<UpdateRecipeOutput, UpdateRecipeError, HandlerContext> =>
  task.task<UpdateRecipeOutput, UpdateRecipeError, HandlerContext>(
    async (ctx: HandlerContext) => {
      try {
        const manifest = await registryFetcher.fetchRegistry(
          input.registrySource,
          { verbose: input.verbose, local: input.local },
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
        const msg = error instanceof Error ? error.message : String(error);
        return results.fail({ _tag: "ApplyError" as const, message: msg });
      }
    },
  );

export { updateRecipe };

export type { UpdateRecipeError, UpdateRecipeInput, UpdateRecipeOutput };
