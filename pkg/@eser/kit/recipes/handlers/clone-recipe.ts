// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Clone recipe handler — pure business logic for cloning a recipe
 * from any GitHub repo.
 *
 * @module
 */

import { runtime } from "@eser/standards/cross-runtime";
import * as task from "@eser/functions/task";
import * as results from "@eser/primitives/results";
import * as span from "@eser/streams/span";
import * as registryFetcher from "../registry-fetcher.ts";
import * as recipeApplier from "../recipe-applier.ts";
import * as dependencyResolver from "../dependency-resolver.ts";
import type * as registrySchema from "../registry-schema.ts";
import type { HandlerContext } from "../handler-context.ts";

// =============================================================================
// Types
// =============================================================================

type ParsedSpecifier = {
  readonly owner: string;
  readonly repo: string;
  readonly ref: string;
};

type CloneRecipeInput = {
  readonly specifier: ParsedSpecifier;
  readonly recipePath?: string;
  readonly cwd: string;
  readonly projectName?: string;
  readonly dryRun?: boolean;
  readonly force?: boolean;
  readonly skipExisting?: boolean;
  readonly verbose?: boolean;
  readonly variables?: Readonly<Record<string, string>>;
};

type CloneRecipeOutput = {
  readonly recipe: registrySchema.Recipe;
  readonly result: recipeApplier.ApplyResult;
  readonly depInfo: dependencyResolver.DependencyInstructions;
  readonly targetDir: string;
};

type CloneRecipeError =
  | { readonly _tag: "FetchError"; readonly message: string }
  | { readonly _tag: "ApplyError"; readonly message: string };

// =============================================================================
// Specifier parsing
// =============================================================================

const parseSpecifier = (specifier: string): ParsedSpecifier | undefined => {
  const cleaned = specifier.replace(/^gh:/, "");
  const [repoPath, ref] = cleaned.split("#");

  if (repoPath === undefined) return undefined;

  const parts = repoPath.split("/");
  if (parts.length !== 2 || parts[0] === "" || parts[1] === "") {
    return undefined;
  }

  return { owner: parts[0]!, repo: parts[1]!, ref: ref ?? "main" };
};

// =============================================================================
// Handler
// =============================================================================

const cloneRecipe = (
  input: CloneRecipeInput,
): task.Task<CloneRecipeOutput, CloneRecipeError, HandlerContext> =>
  task.task<CloneRecipeOutput, CloneRecipeError, HandlerContext>(
    async (ctx: HandlerContext) => {
      try {
        const { specifier } = input;
        const recipePath = input.recipePath ?? "recipe.json";

        const recipe = await registryFetcher.fetchRecipeFromRepo(
          specifier.owner,
          specifier.repo,
          specifier.ref,
          recipePath,
        );

        let targetDir = input.cwd;
        if (input.projectName !== undefined) {
          targetDir = `${input.cwd}/${input.projectName}`;
          await runtime.fs.mkdir(targetDir, {
            recursive: true,
          });
        }

        const variables = { ...input.variables };
        if (
          input.projectName !== undefined &&
          variables["project_name"] === undefined
        ) {
          variables["project_name"] = input.projectName;
        }

        const registryUrl =
          `https://raw.githubusercontent.com/${specifier.owner}/${specifier.repo}/${specifier.ref}`;

        const result = await recipeApplier.applyRecipe(recipe, {
          cwd: targetDir,
          registryUrl,
          force: input.force,
          skipExisting: input.skipExisting,
          dryRun: input.dryRun,
          verbose: input.verbose,
          variables,
        });

        const project = await dependencyResolver.detectProjectType(targetDir);
        const depInfo = dependencyResolver.getDependencyInstructions(
          recipe,
          project,
        );

        // Format output
        const verb = input.dryRun ? "Would write" : "Cloned";
        ctx.out.writeln(
          span.green(
            `✓ ${verb} ${result.written.length} file(s) from ${recipe.name}`,
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
        const msg = error instanceof Error ? error.message : String(error);
        return results.fail({ _tag: "ApplyError" as const, message: msg });
      }
    },
  );

export { cloneRecipe, parseSpecifier };

export type {
  CloneRecipeError,
  CloneRecipeInput,
  CloneRecipeOutput,
  ParsedSpecifier,
};
