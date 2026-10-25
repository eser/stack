// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// node:async_hooks is the one module that provides AsyncLocalStorage on Node,
// Deno and Bun alike.
// deno-lint-ignore no-external-import
import * as asyncHooks from "node:async_hooks";
import type { Category, ContextLocalStorage } from "./types.ts";
import * as category from "./category.ts";

/**
 * Default AsyncLocalStorage instances for the logging context and the
 * category prefix, created on first use. Node, Deno and Bun all provide
 * node:async_hooks.
 */
let defaultContextStorage: ContextLocalStorage | undefined;
let defaultCategoryPrefixStorage: ContextLocalStorage<Category> | undefined;

/**
 * Lazily initializes the default context storage.
 */
const getDefaultContextStorage = (): ContextLocalStorage => {
  if (defaultContextStorage === undefined) {
    defaultContextStorage = new asyncHooks.AsyncLocalStorage<
      Record<string, unknown>
    >();
  }

  return defaultContextStorage;
};

/**
 * Lazily initializes the default category prefix storage.
 */
const getDefaultCategoryPrefixStorage = (): ContextLocalStorage<Category> => {
  if (defaultCategoryPrefixStorage === undefined) {
    defaultCategoryPrefixStorage = new asyncHooks.AsyncLocalStorage<Category>();
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
 * Clears default storage instances to allow clean process exit.
 *
 * AsyncLocalStorage keeps the event loop alive even when idle.
 * Call this during reset() to ensure the process can exit cleanly.
 */
export const clearDefaultStorages = (): void => {
  defaultContextStorage = undefined;
  defaultCategoryPrefixStorage = undefined;
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
 * ```typescript
 * import * as logging from "@eserstack/logging";
 *
 * await logging.context.withContext({ requestId: "abc-123" }, async () => {
 *   const logger = logging.logger.getLogger(["myapp"]);
 *   await logger.info("Processing request"); // includes requestId
 * });
 * ```
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
 * ```typescript
 * import * as logging from "@eserstack/logging";
 *
 * logging.context.withContext({ requestId: "abc-123" }, () => {
 *   const requestId = logging.context.getContext()["requestId"]; // "abc-123"
 * });
 * ```
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
 * ```typescript
 * import * as logging from "@eserstack/logging";
 *
 * await logging.context.withCategoryPrefix("my-sdk", async () => {
 *   // The logger's category is ["my-sdk", "internal"]
 *   const logger = logging.logger.getLogger(["internal"]);
 *   await logger.info("SDK initialized");
 * });
 * ```
 */
export const withCategoryPrefix = <T>(
  prefix: string | Category,
  fn: () => T,
): T => {
  const storage = getCategoryPrefixStorage();
  const normalizedPrefix = category.normalizeCategory(prefix);

  if (!storage) {
    // No AsyncLocalStorage available, just run the function
    return fn();
  }

  const currentPrefix = storage.getStore() ?? [];
  const mergedPrefix = category.extendCategory(currentPrefix, normalizedPrefix);

  return storage.run(mergedPrefix, fn);
};

/**
 * Gets the current category prefix.
 * Returns an empty array if no prefix is set.
 *
 * @example
 * ```typescript
 * import * as logging from "@eserstack/logging";
 *
 * logging.context.withCategoryPrefix("my-sdk", () => {
 *   const prefix = logging.context.getCategoryPrefix(); // ["my-sdk"]
 * });
 * ```
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
 * ```typescript
 * import * as logging from "@eserstack/logging";
 *
 * logging.context.withCategoryPrefix("my-sdk", () => {
 *   logging.context.applyPrefixToCategory(["internal"]); // ["my-sdk", "internal"]
 * });
 * ```
 */
export const applyPrefixToCategory = (baseCategory: Category): Category => {
  const prefix = getCategoryPrefix();

  if (prefix.length === 0) {
    return baseCategory;
  }

  return category.extendCategory(prefix, baseCategory);
};

/**
 * Creates a scoped context runner for specific use cases.
 * Useful for creating request-scoped or operation-scoped contexts.
 *
 * @example
 * ```typescript
 * import * as logging from "@eserstack/logging";
 *
 * const requestScope = logging.context.createContextScope({
 *   requestId: "your_request_id",
 * });
 *
 * await requestScope(async () => {
 *   await logging.logger.getLogger(["app"]).info("Handled"); // has requestId
 * });
 * ```
 */
export const createContextScope = (
  context: Record<string, unknown>,
): (<T>(fn: () => T) => T) => {
  return <T>(fn: () => T): T => withContext(context, fn);
};

/**
 * Creates a category prefix scope.
 *
 * @example
 * ```typescript
 * import * as logging from "@eserstack/logging";
 *
 * const sdkScope = logging.context.createCategoryPrefixScope("my-sdk");
 *
 * await sdkScope(async () => {
 *   // Logs under ["my-sdk", "client"]
 *   await logging.logger.getLogger(["client"]).info("Connected");
 * });
 * ```
 */
export const createCategoryPrefixScope = (
  prefix: string | Category,
): (<T>(fn: () => T) => T) => {
  return <T>(fn: () => T): T => withCategoryPrefix(prefix, fn);
};

// Re-export types
export type { Category, ContextLocalStorage } from "./types.ts";
