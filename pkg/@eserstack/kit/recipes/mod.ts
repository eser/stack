// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Recipe registry for eser stack.
 *
 * Provides a forkable distribution protocol inspired by shadcn's registry
 * model. Recipes are code templates at three scales (project, structure,
 * utility) that can be fetched from any registry and applied to existing
 * projects.
 *
 * This is a recipe registry, not to be confused with
 * `@eserstack/standards/collections`, which is a generic immutable data
 * structure.
 *
 * @example
 * ```typescript
 * import * as recipes from "@eserstack/kit/recipes";
 *
 * const manifest = await recipes.fetcher.fetchRegistry();
 * for (const recipe of manifest.recipes) {
 *   console.log(recipe.name, recipe.scale);
 * }
 * ```
 *
 * @module
 */

/** Registry manifest types and the type guards that validate them. */
export * as schema from "./registry-schema.ts";
/** Loading registry manifests, recipe files and recipe folders. */
export * as fetcher from "./registry-fetcher.ts";
/** Writing a recipe's files into a project and running its post-install commands. */
export * as applier from "./recipe-applier.ts";
/** Detecting the project type and installing a recipe's dependencies. */
export * as resolver from "./dependency-resolver.ts";
/** Ordering a recipe after the recipes it requires. */
export * as requires from "./requires-resolver.ts";
/** Resolving template variables and substituting `{{.name}}` placeholders. */
export * as variables from "./variable-processor.ts";
