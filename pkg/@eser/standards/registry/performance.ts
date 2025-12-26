// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// =============================================================================
// Bitmap-Based Matching (Generic)
// =============================================================================

/**
 * A bitmap representing a set of flags for O(1) matching.
 * Maximum 32 flags supported (JavaScript bitwise limit).
 */
export type Bitmap = number;

/**
 * Bitmap matcher interface returned by createBitmapMatcher.
 */
export type BitmapMatcher<K extends string> = {
  /** Convert an array of keys to a bitmap for O(1) matching. */
  readonly toBitmap: (keys: readonly string[]) => Bitmap;
  /** Check if any required bit is present in available (OR match). */
  readonly match: (required: Bitmap, available: Bitmap) => boolean;
  /** Check if all required bits are present in available (AND match). */
  readonly matchAll: (required: Bitmap, available: Bitmap) => boolean;
  /** The mapping used to create this matcher. */
  readonly mapping: Readonly<Record<K, number>>;
};

/**
 * Create a bitmap matcher for any set of string keys.
 *
 * The CONSUMER defines their own mapping - library knows nothing about domain.
 * This follows the "provide mechanisms, not policies" principle.
 *
 * @example
 * ```typescript
 * // Consumer defines their own domain-specific mapping
 * const StackBits = {
 *   javascript: 1 << 0,
 *   typescript: 1 << 1,
 *   golang: 1 << 2,
 * } as const;
 *
 * const matcher = createBitmapMatcher(StackBits);
 * const bitmap = matcher.toBitmap(["javascript", "typescript"]);
 * // bitmap = 0b11 (bits 0 and 1 set)
 *
 * matcher.match(0b01, 0b11);    // true (any match)
 * matcher.matchAll(0b11, 0b11); // true (all match)
 * ```
 */
export const createBitmapMatcher = <K extends string>(
  mapping: Readonly<Record<K, number>>,
): BitmapMatcher<K> => {
  const toBitmap = (keys: readonly string[]): Bitmap => {
    let bitmap = 0;
    for (const key of keys) {
      const bit = mapping[key as K];
      if (bit !== undefined) {
        bitmap |= bit;
      }
    }
    return bitmap;
  };

  const match = (required: Bitmap, available: Bitmap): boolean => {
    // No requirements = matches all
    if (required === 0) return true;
    // No available = match all (legacy behavior for optional filtering)
    if (available === 0) return true;
    // Check intersection (any bit matches)
    return (required & available) !== 0;
  };

  const matchAll = (required: Bitmap, available: Bitmap): boolean => {
    if (required === 0) return true;
    if (available === 0) return true;
    // Check all required bits are present
    return (required & available) === required;
  };

  return { toBitmap, match, matchAll, mapping } as const;
};

// =============================================================================
// Function Parameter Caching
// =============================================================================

/**
 * Cache for parsed function parameters.
 * Uses WeakMap to avoid memory leaks when functions are garbage collected.
 */
// deno-lint-ignore ban-types
const parameterCache = new WeakMap<Function, readonly string[]>();

/**
 * Regex for extracting function parameters (compiled once).
 * Matches: function name(...) or (...) => or async function(...) etc.
 */
const PARAM_REGEX = /(?:async\s+)?(?:function\s*\w*\s*)?\(([^)]*)\)/;

/**
 * Get function parameter names with caching.
 *
 * First call parses the function string, subsequent calls return cached result.
 * Uses WeakMap so cache entries are garbage collected with the function.
 *
 * @example
 * ```typescript
 * const fn = (logger, database, config) => { ... };
 * getFunctionParameters(fn); // ["logger", "database", "config"]
 * getFunctionParameters(fn); // Returns cached result
 * ```
 */
// deno-lint-ignore ban-types
export const getFunctionParameters = (fn: Function): readonly string[] => {
  const cached = parameterCache.get(fn);
  if (cached !== undefined) {
    return cached;
  }

  const fnString = fn.toString();
  const match = PARAM_REGEX.exec(fnString);

  const params: readonly string[] = match?.[1]
    ? Object.freeze(
      match[1]
        .split(",")
        .map((p) => p.trim())
        // Remove default values and destructuring
        .map((p) => p.split("=")[0]?.trim() ?? "")
        .map((p) => p.replace(/^\{.*\}$/, "").trim())
        .map((p) => p.replace(/^\[.*\]$/, "").trim())
        .filter((p) => p.length > 0 && !p.startsWith("...")),
    )
    : Object.freeze([]);

  parameterCache.set(fn, params);
  return params;
};

/**
 * Clear the parameter cache for a specific function.
 * Useful for testing or when function behavior changes.
 */
// deno-lint-ignore ban-types
export const clearParameterCache = (fn: Function): void => {
  parameterCache.delete(fn);
};

// =============================================================================
// Parallel Initialization Helpers
// =============================================================================

/**
 * Load multiple modules in parallel and extract specified exports.
 *
 * @example
 * ```typescript
 * const validators = await parallelImport([
 *   ["./validators/circular-deps.ts", "circularDepsValidator"],
 *   ["./validators/mod-exports.ts", "modExportsValidator"],
 * ]);
 * // validators = [circularDepsValidator, modExportsValidator]
 * ```
 */
export const parallelImport = async <T>(
  imports: ReadonlyArray<readonly [path: string, exportName: string]>,
): Promise<T[]> => {
  const modules = await Promise.all(
    imports.map(([path]) => import(path)),
  );

  return imports.map(([, exportName], index) => {
    const module = modules[index];
    if (!(exportName in module)) {
      throw new Error(`Export "${exportName}" not found in module`);
    }
    return module[exportName] as T;
  });
};

/**
 * Load multiple modules in parallel and return all as an array.
 *
 * @example
 * ```typescript
 * const [mod1, mod2, mod3] = await parallelImportModules([
 *   "./validators/circular-deps.ts",
 *   "./validators/mod-exports.ts",
 *   "./validators/docs.ts",
 * ]);
 * ```
 */
export const parallelImportModules = async <T extends Record<string, unknown>>(
  paths: ReadonlyArray<string>,
): Promise<T[]> => {
  return await Promise.all(paths.map((path) => import(path))) as T[];
};

// =============================================================================
// Frozen Array Utilities
// =============================================================================

/**
 * Create a frozen copy of an array.
 * Returns the same reference if already frozen.
 */
export const freezeArray = <T>(arr: readonly T[]): readonly T[] => {
  if (Object.isFrozen(arr)) {
    return arr;
  }
  return Object.freeze([...arr]);
};

/**
 * Memoize a function that returns an array.
 * Caches the frozen result for subsequent calls.
 */
export const memoizeArray = <T, A extends unknown[]>(
  fn: (...args: A) => readonly T[],
): (...args: A) => readonly T[] => {
  let cached: readonly T[] | null = null;
  let lastArgs: A | null = null;

  return (...args: A): readonly T[] => {
    // Check if args are the same (shallow comparison)
    if (
      lastArgs !== null &&
      args.length === lastArgs.length &&
      args.every((arg, i) => arg === lastArgs![i])
    ) {
      return cached!;
    }

    const result = fn(...args);
    cached = freezeArray(result);
    lastArgs = args;
    return cached;
  };
};

// =============================================================================
// Lazy Initialization Pattern
// =============================================================================

/**
 * Create a lazy value that is computed once on first access.
 *
 * @example
 * ```typescript
 * const expensiveValue = lazy(() => computeExpensiveValue());
 * // Later...
 * const value = expensiveValue(); // Computed on first call
 * const same = expensiveValue();  // Returns cached value
 * ```
 */
export const lazy = <T>(factory: () => T): () => T => {
  let cached: T | undefined;
  let computed = false;

  return (): T => {
    if (!computed) {
      cached = factory();
      computed = true;
    }
    return cached as T;
  };
};

/**
 * Create an async lazy value that is computed once on first access.
 */
export const lazyAsync = <T>(factory: () => Promise<T>): () => Promise<T> => {
  let cached: T | undefined;
  let promise: Promise<T> | null = null;

  return (): Promise<T> => {
    if (cached !== undefined) {
      return Promise.resolve(cached);
    }

    if (promise === null) {
      promise = factory().then((value) => {
        cached = value;
        return value;
      });
    }

    return promise;
  };
};
