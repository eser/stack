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
import { ensureLib, getLib } from "../../ffi-client.ts";

// =============================================================================
// Types
// =============================================================================

type ParsedSpecifier = registryFetcher.ResolvedSpecifier & {
  readonly kind: "repo";
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
  readonly interactive?: boolean;
  readonly skipPostInstall?: boolean;
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
// FFI eligibility — features the Go bridge does NOT implement
// =============================================================================

const canUseFfiPath = (
  recipe: registrySchema.Recipe,
  input: CloneRecipeInput,
): boolean => {
  if (recipe.files === undefined) return false;          // whole-repo mode
  if (recipe.ignore !== undefined) return false;         // FFI has no ignore-glob support
  if (input.interactive === true) return false;          // FFI has no prompt loop
  if (input.skipPostInstall === true) return false;      // FFI runs post-install unconditionally

  const hasNameSubstitution = recipe.files.some(
    (f) => f.source.includes("{{.") || f.target.includes("{{."),
  );
  if (hasNameSubstitution) return false;                 // FFI substitutes content only

  const hasPatternedVar = recipe.variables?.some(
    (v) => v.pattern !== undefined,
  ) ?? false;
  if (hasPatternedVar) return false;                     // FFI doesn't validate regex patterns

  return true;
};

// =============================================================================
// Specifier parsing (delegates to shared resolver)
// =============================================================================

const parseSpecifier = (specifier: string): ParsedSpecifier | undefined => {
  const resolved = registryFetcher.resolveSpecifier(specifier);

  if (resolved.kind !== "repo") {
    return undefined;
  }

  return resolved;
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
        } catch (e) {
          if (e instanceof registryFetcher.RecipeFileNotFoundError) {
            // recipe.json absent → whole-repo mode with empty recipe
            recipe = { schema: "registry/v1" } as registrySchema.Recipe;
          } else {
            throw e;
          }
        }

        // ── Step 2: Try Go FFI fast path when eligible ──
        if (canUseFfiPath(recipe, input)) {
          await ensureLib();
          const lib = getLib();

          if (lib !== null) {
            const specifierStr = specifier.subpath !== undefined
              ? `gh:${specifier.owner}/${specifier.repo}/${specifier.subpath}#${specifier.ref}`
              : `gh:${specifier.owner}/${specifier.repo}#${specifier.ref}`;

            const raw = lib.symbols.EserAjanKitCloneRecipe(
              JSON.stringify({
                specifier: specifierStr,
                cwd: input.cwd,
                projectName: input.projectName,
                dryRun: input.dryRun,
                force: input.force,
                skipExisting: input.skipExisting,
                verbose: input.verbose,
                variables: input.variables,
              }),
            );
            const goResult = JSON.parse(raw) as {
              recipes?: Array<{
                name: string;
                written: string[];
                skipped: string[];
                total: number;
                postInstallRan: string[];
              }>;
              error?: string;
            };

            if (!goResult.error && goResult.recipes !== undefined) {
              let totalWritten = 0;
              for (const entry of goResult.recipes) {
                totalWritten += entry.written.length;
              }

              const targetDir = input.projectName !== undefined
                ? `${input.cwd}/${input.projectName}`
                : input.cwd;

              const verb = input.dryRun ? "Would write" : "Cloned";
              ctx.out.writeln(
                span.green(`✓ ${verb} ${totalWritten} file(s)`),
              );

              const mainRecipe = goResult.recipes.find(
                (r) => r.name === specifier.repo,
              ) ?? goResult.recipes[0];

              if (mainRecipe !== undefined) {
                for (const file of mainRecipe.written) {
                  ctx.out.writeln(`  → ${file}`);
                }
              }

              const fakeRecipe = {
                name: specifier.repo,
              } as unknown as registrySchema.Recipe;
              const fakeResult = {
                written: goResult.recipes.flatMap((r) => r.written),
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
          await runtime.fs.mkdir(targetDir, { recursive: true });
        }

        const variables: Record<string, string> = { ...input.variables };
        if (
          input.projectName !== undefined &&
          variables["project_name"] === undefined
        ) {
          variables["project_name"] = input.projectName;
        }

        const registryUrl =
          `https://raw.githubusercontent.com/${specifier.owner}/${specifier.repo}/${specifier.ref}`;

        const specifierStr = specifier.subpath !== undefined
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
        });

        const project = await dependencyResolver.detectProjectType(targetDir);
        const depInfo = dependencyResolver.getDependencyInstructions(
          recipe,
          project,
        );

        const verb = input.dryRun ? "Would write" : "Cloned";
        ctx.out.writeln(
          span.green(
            `✓ ${verb} ${result.written.length} file(s) from ${recipe.name ?? specifier.repo}`,
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
