// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Registry handlers — pure business logic for all registry operations.
 *
 * These handlers have no CLI dependency. They can be invoked from
 * CLI, HTTP, MCP tool calls, or tests.
 *
 * @module
 */

export * as listRecipes from "./list-recipes.ts";
export * as addRecipe from "./add-recipe.ts";
export * as newProject from "./new-project.ts";
export * as cloneRecipe from "./clone-recipe.ts";
export * as updateRecipe from "./update-recipe.ts";
