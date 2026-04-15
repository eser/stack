// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Add recipe handler — pure business logic for applying a recipe
 * from the registry to an existing project.
 *
 * No CLI dependency. Output goes through ctx.out (Span-based).
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

// =============================================================================
// Types
// =============================================================================

type AddRecipeInput = {
  readonly recipeName: string;
  readonly cwd: string;
  readonly registrySource?: string;
  readonly local?: boolean;
  readonly dryRun?: boolean;
  readonly force?: boolean;
  readonly skipExisting?: boolean;
  readonly verbose?: boolean;
  readonly noInstall?: boolean;
  readonly variables?: Readonly<Record<string, string>>;
};

type AddRecipeOutput = {
  readonly recipe: registrySchema.Recipe;
  readonly chainResult: recipeApplier.ApplyChainResult;
  readonly depInfo: dependencyResolver.DependencyInstructions;
  readonly installResults?: readonly dependencyResolver.InstallResult[];
};

type AddRecipeError =
  | { readonly _tag: "RegistryError"; readonly message: string }
  | { readonly _tag: "RecipeNotFound"; readonly message: string }
  | { readonly _tag: "ApplyError"; readonly message: string };

// =============================================================================
// Handler
// =============================================================================

const addRecipe = (
  input: AddRecipeInput,
): task.Task<AddRecipeOutput, AddRecipeError, HandlerContext> =>
  task.task<AddRecipeOutput, AddRecipeError, HandlerContext>(
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

        // Detect project type
        const project = await dependencyResolver.detectProjectType(input.cwd);
        const depInfo = dependencyResolver.getDependencyInstructions(
          recipe,
          project,
        );

        // Show language mismatch warnings
        for (const warning of depInfo.warnings) {
          ctx.out.writeln(span.yellow(`Warning: ${warning}`));
        }

        // Apply recipe chain
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

        // Format output
        let totalWritten = 0;
        let totalSkipped = 0;
        for (const entry of chainResult.recipes) {
          totalWritten += entry.result.written.length;
          totalSkipped += entry.result.skipped.length;
        }

        ctx.out.writeln(
          span.green(`✓ Added ${totalWritten} file(s)`),
        );

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

        // Install dependencies
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
              ctx.out.writeln(
                span.red(`  ✗ ${ir.command}: ${ir.error}`),
              );
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
        const msg = error instanceof Error ? error.message : String(error);
        return results.fail({ _tag: "ApplyError" as const, message: msg });
      }
    },
  );

export { addRecipe };

export type { AddRecipeError, AddRecipeInput, AddRecipeOutput };
