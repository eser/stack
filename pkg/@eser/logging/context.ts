// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type { Category, ContextLocalStorage } from "./types.ts";
import { extendCategory, normalizeCategory } from "./category.ts";

/**
 * Default AsyncLocalStorage for logging context.
 * Uses the global AsyncLocalStorage if available.
 */
let defaultContextStorage: ContextLocalStorage | undefined;
let defaultCategoryPrefixStorage: ContextLocalStorage<Category> | undefined;

/**
 * Lazily initializes the default context storage using AsyncLocalStorage.
 */
const getDefaultContextStorage = (): ContextLocalStorage | undefined => {
  if (defaultContextStorage === undefined) {
    try {
      // Try to get AsyncLocalStorage from globalThis (Node.js, Deno, Bun)
      // deno-lint-ignore no-explicit-any
      const AsyncLocalStorage = (globalThis as any).AsyncLocalStorage ??
        // deno-lint-ignore no-explicit-any
        ((globalThis as any).require?.("async_hooks")?.AsyncLocalStorage);

      if (AsyncLocalStorage) {
        defaultContextStorage = new AsyncLocalStorage();
      }
    } catch {
      // AsyncLocalStorage not available (browser, some edge runtimes)
    }
  }

  return defaultContextStorage;
};

/**
 * Lazily initializes the default category prefix storage.
 */
const getDefaultCategoryPrefixStorage = ():
  | ContextLocalStorage<Category>
  | undefined => {
  if (defaultCategoryPrefixStorage === undefined) {
    try {
      // deno-lint-ignore no-explicit-any
      const AsyncLocalStorage = (globalThis as any).AsyncLocalStorage ??
        // deno-lint-ignore no-explicit-any
        ((globalThis as any).require?.("async_hooks")?.AsyncLocalStorage);

      if (AsyncLocalStorage) {
        defaultCategoryPrefixStorage = new AsyncLocalStorage();
      }
    } catch {
      // AsyncLocalStorage not available
    }
  }

  return defaultCategoryPrefixStorage;
};

/**
 * Custom context storage (set via configure()).
 */
let customContextStorage: ContextLocalStorage | undefined;
let customCategoryPrefixStorage: ContextLocalStorage<Category> | undefined;

/**
 * Sets custom context storage (called from configure()).
 */
export const setContextStorage = (storage?: ContextLocalStorage): void => {
  customContextStorage = storage;
};

/**
 * Sets custom category prefix storage (called from configure()).
 */
export const setCategoryPrefixStorage = (
  storage?: ContextLocalStorage<Category>,
): void => {
  customCategoryPrefixStorage = storage;
};

/**
 * Gets the active context storage.
 */
export const getContextStorage = (): ContextLocalStorage | undefined => {
  return customContextStorage ?? getDefaultContextStorage();
};

/**
 * Gets the active category prefix storage.
 */
export const getCategoryPrefixStorage = ():
  | ContextLocalStorage<Category>
  | undefined => {
  return customCategoryPrefixStorage ?? getDefaultCategoryPrefixStorage();
};

/**
 * Runs a callback with additional context properties.
 * The context is automatically included in all log records within the callback.
 *
 * @example
 * await withContext({ requestId: "abc-123" }, async () => {
 *   const logger = getLogger(["myapp"]);
 *   await logger.info("Processing request"); // Includes requestId automatically
 * });
 */
export const withContext = <T>(
  context: Record<string, unknown>,
  fn: () => T,
): T => {
  const storage = getContextStorage();

  if (!storage) {
    // No AsyncLocalStorage available, just run the function
    return fn();
  }

  const currentContext = storage.getStore() ?? {};
  const mergedContext = { ...currentContext, ...context };

  return storage.run(mergedContext, fn);
};

/**
 * Gets the current logging context.
 * Returns an empty object if no context is set or AsyncLocalStorage is unavailable.
 *
 * @example
 * const ctx = getContext();
 * console.log(ctx.requestId); // "abc-123"
 */
export const getContext = (): Record<string, unknown> => {
  const storage = getContextStorage();

  if (!storage) {
    return {};
  }

  return storage.getStore() ?? {};
};

/**
 * Runs a callback with a category prefix applied to all loggers.
 * Useful for SDK isolation where you want all internal logs prefixed.
 *
 * @example
 * await withCategoryPrefix("my-sdk", async () => {
 *   const logger = getLogger(["internal"]); // Actually ["my-sdk", "internal"]
 *   await logger.info("SDK initialized");
 * });
 */
export const withCategoryPrefix = <T>(
  prefix: string | Category,
  fn: () => T,
): T => {
  const storage = getCategoryPrefixStorage();
  const normalizedPrefix = normalizeCategory(prefix);

  if (!storage) {
    // No AsyncLocalStorage available, just run the function
    return fn();
  }

  const currentPrefix = storage.getStore() ?? [];
  const mergedPrefix = extendCategory(currentPrefix, normalizedPrefix);

  return storage.run(mergedPrefix, fn);
};

/**
 * Gets the current category prefix.
 * Returns an empty array if no prefix is set.
 *
 * @example
 * const prefix = getCategoryPrefix(); // ["my-sdk"]
 */
export const getCategoryPrefix = (): Category => {
  const storage = getCategoryPrefixStorage();

  if (!storage) {
    return [];
  }

  return storage.getStore() ?? [];
};

/**
 * Applies the current category prefix to a category.
 *
 * @example
 * // Inside withCategoryPrefix("my-sdk", ...)
 * applyPrefixToCategory(["internal"]) // ["my-sdk", "internal"]
 */
export const applyPrefixToCategory = (category: Category): Category => {
  const prefix = getCategoryPrefix();

  if (prefix.length === 0) {
    return category;
  }

  return extendCategory(prefix, category);
};

/**
 * Creates a scoped context runner for specific use cases.
 * Useful for creating request-scoped or operation-scoped contexts.
 *
 * @example
 * const requestScope = createContextScope({ requestId: req.id });
 * await requestScope(async () => {
 *   // All logs here include requestId
 * });
 */
export const createContextScope = (
  context: Record<string, unknown>,
): <T>(fn: () => T) => T => {
  return <T>(fn: () => T): T => withContext(context, fn);
};

/**
 * Creates a category prefix scope.
 *
 * @example
 * const sdkScope = createCategoryPrefixScope("my-sdk");
 * await sdkScope(async () => {
 *   // All logger categories here are prefixed with "my-sdk"
 * });
 */
export const createCategoryPrefixScope = (
  prefix: string | Category,
): <T>(fn: () => T) => T => {
  return <T>(fn: () => T): T => withCategoryPrefix(prefix, fn);
};

// Re-export types
export type { Category, ContextLocalStorage } from "./types.ts";
