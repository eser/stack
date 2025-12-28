// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type { Category, LoggerConfig } from "./types.ts";

/**
 * Normalizes a category to a readonly string array.
 * Accepts either a string (dot-separated) or an array.
 *
 * @example
 * normalizeCategory("myapp.http.request") // ["myapp", "http", "request"]
 * normalizeCategory(["myapp", "http"]) // ["myapp", "http"]
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
 * categoryToString(["myapp", "http", "request"]) // "myapp.http.request"
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
 * isDescendant(["app", "http", "req"], ["app"]) // true
 * isDescendant(["app", "http"], ["app", "http"]) // false (same, not descendant)
 * isDescendant(["app"], ["app", "http"]) // false (shorter)
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
 * isDescendantOrSelf(["app", "http"], ["app"]) // true
 * isDescendantOrSelf(["app"], ["app"]) // true
 * isDescendantOrSelf(["other"], ["app"]) // false
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
 * isAncestor(["app"], ["app", "http", "req"]) // true
 * isAncestor(["app", "http"], ["app", "http"]) // false (same, not ancestor)
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
 * // configs: [{ category: ["app"] }, { category: ["app", "http"] }]
 * // findMatchingConfigs(["app", "http", "req"], configs)
 * // Returns: [{ category: ["app", "http"] }, { category: ["app"] }]
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
 * getParentCategory(["app", "http", "req"]) // ["app", "http"]
 * getParentCategory(["app"]) // null
 * getParentCategory([]) // null
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
 * extendCategory(["app"], "http") // ["app", "http"]
 * extendCategory(["app"], ["http", "req"]) // ["app", "http", "req"]
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
 * getCommonAncestor(["app", "http"], ["app", "db"]) // ["app"]
 * getCommonAncestor(["app", "http"], ["other"]) // []
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
 * matchesPattern(["app", "http", "req"], ["app", "*", "req"]) // true
 * matchesPattern(["app", "http", "req"], ["app", "**"]) // true
 * matchesPattern(["app", "http"], ["app", "db"]) // false
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
