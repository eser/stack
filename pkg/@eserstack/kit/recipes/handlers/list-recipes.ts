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
import { runtime } from "@eserstack/standards/cross-runtime";
import * as results from "@eserstack/primitives/results";
import * as span from "@eserstack/streams/span";
import * as registryFetcher from "../registry-fetcher.ts";
import type * as registrySchema from "../registry-schema.ts";
import type { HandlerContext } from "../handler-context.ts";
import * as errorChain from "../error-chain.ts";
import * as ffiClient from "../../ffi-client.ts";

// =============================================================================
// Types
// =============================================================================

/** Which registry to read and which of its recipes to keep. */
export type ListRecipesInput = {
  /** Path or URL of the registry manifest; the default registry when absent. */
  readonly registrySource?: string;
  /** Keep only the recipes whose `language` is this value. */
  readonly language?: string;
  /** Keep only the recipes whose `scale` is this value. */
  readonly scale?: string;
  /** Keep only the recipes that have this tag. */
  readonly tag?: string;
  /** Without a source, look for a `.eser/recipes.json` in the working directory or a parent first. */
  readonly local?: boolean;
};

/** The registry that was read and the recipes that passed the filters. */
export type ListRecipesOutput = {
  /** The registry manifest. */
  readonly manifest: registrySchema.RegistryManifest;
  /** The recipes that match every given filter, in registry order. */
  readonly recipes: readonly registrySchema.Recipe[];
};

/**
 * Why listing stopped. `message` renders the whole cause chain for the
 * person running the command; `cause` is the original error, usually a
 * RegistryLoadError.
 */
export type ListRecipesError = {
  readonly _tag: "RegistryError";
  readonly message: string;
  readonly cause: unknown;
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
      // Registry strings are third-party content: strip terminal controls.
      span.bold(span.untrusted(`${manifest.name} — ${manifest.description}`)),
    );
    ctx.out.writeln();
  }

  for (const scale of SCALE_ORDER) {
    const group = recipes.filter((r) => r.scale === scale);
    if (group.length === 0) continue;

    ctx.out.writeln(span.cyan(SCALE_LABELS[scale]));
    for (const recipe of group) {
      ctx.out.writeln(
        span.untrusted(
          `  ${(recipe.name ?? "").padEnd(20)} ${recipe.description} `,
        ),
        span.dim(span.untrusted(`[${recipe.language}]`)),
      );
    }
    ctx.out.writeln();
  }
};

// =============================================================================
// Handler
// =============================================================================

/**
 * Reads a registry, keeps the recipes that match the filters, and writes them
 * to `ctx.out` grouped by scale. Uses the native ajan library when it loads,
 * and the TypeScript fetcher otherwise.
 *
 * @param input - The registry to read and the filters
 * @returns A task that resolves to the manifest and the matching recipes, or
 *   fails with a RegistryError when the registry cannot be loaded
 */
export const listRecipes = (
  input: ListRecipesInput,
): task.Task<ListRecipesOutput, ListRecipesError, HandlerContext> =>
  task.task(async (ctx: HandlerContext) => {
    try {
      await ffiClient.ensureLib();
      const lib = ffiClient.getLib();

      if (lib !== null) {
        // The same source the TypeScript path below loads: Go would search
        // for a local registry whether or not --local was given.
        const registryUrl =
          input.registrySource ??
          (input.local === true
            ? await registryFetcher.detectLocalRegistry()
            : undefined) ??
          registryFetcher.DEFAULT_REGISTRY_URL;
        const raw = lib.symbols.EserAjanKitListRecipes(
          JSON.stringify({ registryUrl, cwd: runtime.process.cwd() }),
        );
        const goResult = JSON.parse(raw) as {
          manifest?: {
            name: string;
            description: string;
            author: string;
            registryUrl: string;
          };
          recipes?: registrySchema.Recipe[];
          error?: string;
        };

        if (goResult.error === undefined && goResult.recipes !== undefined) {
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
        recipes = recipes.filter(
          (r) => r.tags !== undefined && r.tags.includes(input.tag!),
        );
      }

      writeRecipeOutput(ctx, recipes, manifest);
      return results.ok({ manifest, recipes });
    } catch (error) {
      return results.fail({
        _tag: "RegistryError" as const,
        message: errorChain.formatErrorChain(error),
        cause: error,
      });
    }
  });
