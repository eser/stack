// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * List recipes handler — pure business logic for browsing the registry.
 *
 * No CLI dependency. Output goes through ctx.out (Span-based).
 * Delegates to native Go library when available; falls back to TS fetch.
 *
 * @module
 */

import * as task from "@eserstack/functions/task";
import * as results from "@eserstack/primitives/results";
import * as span from "@eserstack/streams/span";
import * as registryFetcher from "../registry-fetcher.ts";
import type * as registrySchema from "../registry-schema.ts";
import type { HandlerContext } from "../handler-context.ts";
import { ensureLib, getLib } from "../../ffi-client.ts";

// =============================================================================
// Types
// =============================================================================

type ListRecipesInput = {
  readonly registrySource?: string;
  readonly language?: string;
  readonly scale?: string;
  readonly tag?: string;
  readonly local?: boolean;
};

type ListRecipesOutput = {
  readonly manifest: registrySchema.RegistryManifest;
  readonly recipes: readonly registrySchema.Recipe[];
};

type ListRecipesError = {
  readonly _tag: "RegistryError";
  readonly message: string;
};

// =============================================================================
// Constants
// =============================================================================

const SCALE_ORDER: readonly registrySchema.RecipeScale[] = [
  "project",
  "structure",
  "utility",
];

const SCALE_LABELS: Record<registrySchema.RecipeScale, string> = {
  project: "PROJECTS",
  structure: "STRUCTURES",
  utility: "UTILITIES",
};

// =============================================================================
// Shared output formatter (used by both Go and TS paths)
// =============================================================================

const writeRecipeOutput = (
  ctx: HandlerContext,
  recipes: registrySchema.Recipe[],
  manifest: registrySchema.RegistryManifest,
): void => {
  if (recipes.length === 0) {
    ctx.out.writeln("No recipes found matching your filters.");
    ctx.out.writeln(
      "Run ",
      span.dim("`eser kit list`"),
      " without filters to see all recipes.",
    );
    return;
  }

  if (manifest.name) {
    ctx.out.writeln(
      span.bold(`${manifest.name} — ${manifest.description}`),
    );
    ctx.out.writeln();
  }

  for (const scale of SCALE_ORDER) {
    const group = recipes.filter((r) => r.scale === scale);
    if (group.length === 0) continue;

    ctx.out.writeln(span.cyan(SCALE_LABELS[scale]));
    for (const recipe of group) {
      ctx.out.writeln(
        `  ${(recipe.name ?? "").padEnd(20)} ${recipe.description} `,
        span.dim(`[${recipe.language}]`),
      );
    }
    ctx.out.writeln();
  }
};

// =============================================================================
// Handler
// =============================================================================

const listRecipes = (
  input: ListRecipesInput,
): task.Task<ListRecipesOutput, ListRecipesError, HandlerContext> =>
  task.task(async (ctx: HandlerContext) => {
    try {
      await ensureLib();
      const lib = getLib();

      if (lib !== null) {
        const raw = lib.symbols.EserAjanKitListRecipes(
          JSON.stringify({ registryUrl: input.registrySource, cwd: "." }),
        );
        const goResult = JSON.parse(raw) as {
          manifest?: { name: string; description: string; author: string; registryUrl: string };
          recipes?: registrySchema.Recipe[];
          error?: string;
        };

        if (!goResult.error && goResult.recipes !== undefined) {
          let recipes = [...goResult.recipes];

          if (input.language !== undefined) {
            recipes = recipes.filter((r) => r.language === input.language);
          }
          if (input.scale !== undefined) {
            recipes = recipes.filter((r) => r.scale === input.scale);
          }
          if (input.tag !== undefined) {
            recipes = recipes.filter(
              (r) => r.tags !== undefined && r.tags.includes(input.tag!),
            );
          }

          const manifest = {
            name: goResult.manifest?.name ?? "",
            description: goResult.manifest?.description ?? "",
            author: goResult.manifest?.author ?? "",
            registryUrl: goResult.manifest?.registryUrl ?? "",
            recipes: goResult.recipes,
          } as unknown as registrySchema.RegistryManifest;

          writeRecipeOutput(ctx, recipes, manifest);
          return results.ok({ manifest, recipes });
        }
      }

      // Fallback: TS fetch
      const manifest = await registryFetcher.fetchRegistry(
        input.registrySource,
        { local: input.local },
      );

      let recipes = [...manifest.recipes];

      if (input.language !== undefined) {
        recipes = recipes.filter((r) => r.language === input.language);
      }
      if (input.scale !== undefined) {
        recipes = recipes.filter((r) => r.scale === input.scale);
      }
      if (input.tag !== undefined) {
        recipes = recipes.filter((r) =>
          r.tags !== undefined && r.tags.includes(input.tag!)
        );
      }

      writeRecipeOutput(ctx, recipes, manifest);
      return results.ok({ manifest, recipes });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return results.fail({ _tag: "RegistryError" as const, message: msg });
    }
  });

export { listRecipes };

export type { ListRecipesError, ListRecipesInput, ListRecipesOutput };
