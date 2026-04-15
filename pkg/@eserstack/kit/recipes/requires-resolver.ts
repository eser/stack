// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Recipe dependency resolver using topological sort.
 *
 * Given a recipe name and a registry of recipes, resolves the full
 * dependency chain in correct application order (dependencies first).
 *
 * Dependency graph:
 *   A requires [B, C]
 *   B requires [D]
 *   C requires [D]
 *   resolve("A") → [D, B, C, A]  (D only once — diamond deduplication)
 *
 * @module
 */

import type { Recipe } from "./registry-schema.ts";

// =============================================================================
// Errors
// =============================================================================

class CyclicDependencyError extends Error {
  constructor(cycle: readonly string[]) {
    super(
      `Circular dependency detected: ${cycle.join(" → ")}`,
    );
    this.name = "CyclicDependencyError";
  }
}

class MissingDependencyError extends Error {
  constructor(recipeName: string, missingDep: string) {
    super(
      `Recipe '${recipeName}' requires '${missingDep}', which is not in the registry`,
    );
    this.name = "MissingDependencyError";
  }
}

// =============================================================================
// Resolver
// =============================================================================

/**
 * Resolve the full dependency chain for a recipe, returning recipes
 * in correct application order (dependencies before dependents).
 *
 * Uses depth-first traversal with cycle detection and deduplication.
 */
const resolveRequires = (
  recipeName: string,
  recipes: readonly Recipe[],
): readonly Recipe[] => {
  const recipeMap = new Map<string, Recipe>();
  for (const recipe of recipes) {
    recipeMap.set(recipe.name, recipe);
  }

  const root = recipeMap.get(recipeName);
  if (root === undefined) {
    throw new MissingDependencyError("<root>", recipeName);
  }

  const resolved: Recipe[] = [];
  const resolvedNames = new Set<string>();
  const visiting = new Set<string>();

  const visit = (name: string, path: readonly string[]): void => {
    // Already resolved — skip (handles diamond deps)
    if (resolvedNames.has(name)) {
      return;
    }

    // Currently visiting — cycle detected
    if (visiting.has(name)) {
      throw new CyclicDependencyError([...path, name]);
    }

    const recipe = recipeMap.get(name);
    if (recipe === undefined) {
      throw new MissingDependencyError(path[path.length - 1] ?? "<root>", name);
    }

    visiting.add(name);

    // Visit dependencies first
    if (recipe.requires !== undefined) {
      for (const dep of recipe.requires) {
        visit(dep, [...path, name]);
      }
    }

    visiting.delete(name);
    resolvedNames.add(name);
    resolved.push(recipe);
  };

  visit(recipeName, []);

  return resolved;
};

export { CyclicDependencyError, MissingDependencyError, resolveRequires };
