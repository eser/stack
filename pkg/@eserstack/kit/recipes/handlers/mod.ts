// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Registry handlers: pure business logic for all registry operations.
 *
 * These handlers have no CLI dependency. They can be invoked from
 * CLI, HTTP, MCP tool calls, or tests. Each one returns a task whose context
 * carries the `out` stream it writes its progress lines to.
 *
 * @example
 * ```typescript
 * import * as functions from "@eserstack/functions";
 * import * as primitives from "@eserstack/primitives";
 * import * as streams from "@eserstack/streams";
 * import * as handlers from "@eserstack/kit/recipes/handlers";
 *
 * const out = streams.output({
 *   renderer: streams.renderers.ansi(),
 *   sink: streams.sinks.stdout(),
 * });
 *
 * const result = await functions.task.runTask(
 *   handlers.listRecipes.listRecipes({ scale: "project" }),
 *   { out },
 * );
 * await out.close();
 *
 * if (primitives.results.isFail(result)) {
 *   console.error(result.error.message);
 * }
 * ```
 *
 * @module
 */

/** Lists the recipes of a registry, with optional filters. */
export * as listRecipes from "./list-recipes.ts";
/** Applies a registry recipe to an existing project. */
export * as addRecipe from "./add-recipe.ts";
/** Creates a new project from a project-scale registry recipe. */
export * as newProject from "./new-project.ts";
/** Clones a recipe, or a whole repository, from GitHub. */
export * as cloneRecipe from "./clone-recipe.ts";
/** Fetches an applied recipe again and overwrites its files. */
export * as updateRecipe from "./update-recipe.ts";
