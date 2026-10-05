// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type { Category, LoggerConfig } from "./types.ts";

/**
 * Normalizes a category to a readonly string array.
 * Accepts either a string (dot-separated) or an array.
 *
 * @example
 * ```typescript
 * import * as logging from "@eserstack/logging";
 *
 * logging.category.normalizeCategory("myapp.http.request");
 * // ["myapp", "http", "request"]
 * logging.category.normalizeCategory(["myapp", "http"]); // ["myapp", "http"]
 * ```
 */
export const normalizeCategory = (category: Category | string): Category => {
  if (typeof category === "string") {
    return category.split(".").filter(Boolean);
  }

  return category;
};

/**
 * Converts a category array to a dot-separated string.
 *
 * @example
 * ```typescript
 * import * as logging from "@eserstack/logging";
 *
 * logging.category.categoryToString(["myapp", "http", "request"]);
 * // "myapp.http.request"
 * ```
 */
export const categoryToString = (
  category: Category,
  separator = ".",
): string => {
  return category.join(separator);
};

/**
 * Creates a category key for use in maps (ensures consistent string representation).
 */
export const categoryKey = (category: Category): string => {
  return category.join("\0");
};

/**
 * Checks if a child category is a descendant of a parent category.
 * A descendant has the parent as a prefix and is longer.
 *
 * @example
 * ```typescript
 * import * as logging from "@eserstack/logging";
 *
 * logging.category.isDescendant(["app", "http", "req"], ["app"]); // true
 * // false: the same category is not a descendant
 * logging.category.isDescendant(["app", "http"], ["app", "http"]);
 * logging.category.isDescendant(["app"], ["app", "http"]); // false: shorter
 * ```
 */
export const isDescendant = (child: Category, parent: Category): boolean => {
  if (child.length <= parent.length) {
    return false;
  }

  return parent.every((part, index) => child[index] === part);
};

/**
 * Checks if a child category is the same as or a descendant of a parent category.
 *
 * @example
 * ```typescript
 * import * as logging from "@eserstack/logging";
 *
 * logging.category.isDescendantOrSelf(["app", "http"], ["app"]); // true
 * logging.category.isDescendantOrSelf(["app"], ["app"]); // true
 * logging.category.isDescendantOrSelf(["other"], ["app"]); // false
 * ```
 */
export const isDescendantOrSelf = (
  child: Category,
  parent: Category,
): boolean => {
  if (child.length < parent.length) {
    return false;
  }

  return parent.every((part, index) => child[index] === part);
};

/**
 * Checks if a parent category is an ancestor of a child category.
 *
 * @example
 * ```typescript
 * import * as logging from "@eserstack/logging";
 *
 * logging.category.isAncestor(["app"], ["app", "http", "req"]); // true
 * // false: the same category is not an ancestor
 * logging.category.isAncestor(["app", "http"], ["app", "http"]);
 * ```
 */
export const isAncestor = (parent: Category, child: Category): boolean => {
  return isDescendant(child, parent);
};

/**
 * Checks if two categories are equal.
 */
export const categoriesEqual = (a: Category, b: Category): boolean => {
  if (a.length !== b.length) {
    return false;
  }

  return a.every((part, index) => part === b[index]);
};

/**
 * Finds all logger configs that match a given category.
 * Returns configs sorted by specificity (most specific first).
 *
 * A config matches if its category is the same as or an ancestor of the target category.
 *
 * @example
 * ```typescript
 * import * as logging from "@eserstack/logging";
 *
 * const configs = new Map<string, logging.LoggerConfig>([
 *   ["app", { category: ["app"] }],
 *   ["app.http", { category: ["app", "http"] }],
 * ]);
 *
 * // [{ category: ["app", "http"] }, { category: ["app"] }]
 * logging.category.findMatchingConfigs(["app", "http", "req"], configs);
 * ```
 */
export const findMatchingConfigs = (
  category: Category,
  configs: Map<string, LoggerConfig>,
): LoggerConfig[] => {
  const matches: LoggerConfig[] = [];

  for (const config of configs.values()) {
    const configCategory = normalizeCategory(config.category);

    if (isDescendantOrSelf(category, configCategory)) {
      matches.push(config);
    }
  }

  // Sort by specificity (longer category = more specific = first)
  matches.sort((a, b) => {
    const aLen = normalizeCategory(a.category).length;
    const bLen = normalizeCategory(b.category).length;

    return bLen - aLen;
  });

  return matches;
};

/**
 * Gets the parent category (removes the last element).
 * Returns null for root categories (empty or single element).
 *
 * @example
 * ```typescript
 * import * as logging from "@eserstack/logging";
 *
 * logging.category.getParentCategory(["app", "http", "req"]); // ["app", "http"]
 * logging.category.getParentCategory(["app"]); // null
 * logging.category.getParentCategory([]); // null
 * ```
 */
export const getParentCategory = (category: Category): Category | null => {
  if (category.length <= 1) {
    return null;
  }

  return category.slice(0, -1);
};

/**
 * Extends a category with additional parts.
 *
 * @example
 * ```typescript
 * import * as logging from "@eserstack/logging";
 *
 * logging.category.extendCategory(["app"], "http"); // ["app", "http"]
 * logging.category.extendCategory(["app"], ["http", "req"]);
 * // ["app", "http", "req"]
 * ```
 */
export const extendCategory = (
  parent: Category,
  child: string | Category,
): Category => {
  const childParts = typeof child === "string" ? [child] : child;

  return [...parent, ...childParts];
};

/**
 * Gets the common ancestor of two categories.
 * Returns an empty array if there's no common prefix.
 *
 * @example
 * ```typescript
 * import * as logging from "@eserstack/logging";
 *
 * logging.category.getCommonAncestor(["app", "http"], ["app", "db"]); // ["app"]
 * logging.category.getCommonAncestor(["app", "http"], ["other"]); // []
 * ```
 */
export const getCommonAncestor = (a: Category, b: Category): Category => {
  const result: string[] = [];
  const minLen = Math.min(a.length, b.length);

  for (let i = 0; i < minLen; i++) {
    if (a[i] === b[i]) {
      result.push(a[i] as string);
    } else {
      break;
    }
  }

  return result;
};

/**
 * Checks if a category matches a pattern with wildcards.
 * Supports "*" to match any single segment and "**" to match any number of segments.
 *
 * @example
 * ```typescript
 * import * as logging from "@eserstack/logging";
 *
 * logging.category.matchesPattern(["app", "http", "req"], ["app", "*", "req"]);
 * // true
 * logging.category.matchesPattern(["app", "http", "req"], ["app", "**"]); // true
 * logging.category.matchesPattern(["app", "http"], ["app", "db"]); // false
 * ```
 */
export const matchesPattern = (
  category: Category,
  pattern: Category,
): boolean => {
  let catIndex = 0;
  let patIndex = 0;

  while (patIndex < pattern.length && catIndex < category.length) {
    const pat = pattern[patIndex];

    if (pat === "**") {
      // "**" matches zero or more segments
      if (patIndex === pattern.length - 1) {
        // "**" at end matches everything remaining
        return true;
      }

      // Try matching remaining pattern at each position
      for (let i = catIndex; i <= category.length; i++) {
        if (matchesPattern(category.slice(i), pattern.slice(patIndex + 1))) {
          return true;
        }
      }

      return false;
    }

    if (pat === "*" || pat === category[catIndex]) {
      catIndex++;
      patIndex++;
    } else {
      return false;
    }
  }

  // Handle trailing "**"
  while (patIndex < pattern.length && pattern[patIndex] === "**") {
    patIndex++;
  }

  return catIndex === category.length && patIndex === pattern.length;
};
