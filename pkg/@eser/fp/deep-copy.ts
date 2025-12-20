// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

type Key = string | number | symbol;

/**
 * Default maximum recursion depth for deep copy operations.
 * This prevents stack overflow on deeply nested objects.
 */
export const DEEP_COPY_DEFAULT_MAX_DEPTH = 100;

/**
 * Error thrown when deep copy encounters a circular reference or exceeds max depth.
 */
export class DeepCopyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeepCopyError";
  }
}

/**
 * Options for deep copy operations.
 */
export interface DeepCopyOptions {
  /**
   * Maximum recursion depth. Defaults to DEEP_COPY_DEFAULT_MAX_DEPTH (100).
   * Set to Infinity to disable depth checking (not recommended).
   */
  maxDepth?: number;
}

/**
 * Creates a deep copy of an object, recursively copying all nested objects.
 *
 * @param instance - The object to copy
 * @param options - Optional configuration for the copy operation
 * @returns A deep copy of the input object
 * @throws {DeepCopyError} If a circular reference is detected or max depth is exceeded
 *
 * @example
 * ```typescript
 * const original = { a: { b: { c: 1 } } };
 * const copy = deepCopy(original);
 * copy.a.b.c = 2;
 * console.log(original.a.b.c); // Still 1
 * ```
 */
// deno-lint-ignore no-explicit-any
export const deepCopy = <T extends Record<Key, any>>(
  instance: T,
  options?: DeepCopyOptions,
): T => {
  const maxDepth = options?.maxDepth ?? DEEP_COPY_DEFAULT_MAX_DEPTH;
  const seen = new WeakSet<object>();

  const copyRecursive = <U extends Record<Key, unknown>>(
    obj: U,
    currentDepth: number,
  ): U => {
    // Handle primitives and null
    if (obj === null || typeof obj !== "object") {
      return obj;
    }

    // Check for circular references
    if (seen.has(obj)) {
      throw new DeepCopyError(
        "Circular reference detected: cannot deep copy objects with circular references",
      );
    }

    // Check depth limit
    if (currentDepth > maxDepth) {
      throw new DeepCopyError(
        `Maximum recursion depth exceeded (${maxDepth}). Object is too deeply nested or contains circular references.`,
      );
    }

    // Mark this object as seen
    seen.add(obj);

    try {
      // Handle arrays specially
      if (Array.isArray(obj)) {
        // deno-lint-ignore no-explicit-any
        return obj.map((item) => copyRecursive(item, currentDepth + 1)) as any;
      }

      const Type = obj.constructor as { new (): U };
      const keys = Object.keys(obj);
      // deno-lint-ignore no-explicit-any
      const objCopy: Record<Key, any> = new Type();

      for (const key of keys) {
        const value = obj[key];

        if (value !== null && typeof value === "object") {
          objCopy[key] = copyRecursive(
            value as Record<Key, unknown>,
            currentDepth + 1,
          );
        } else {
          objCopy[key] = value;
        }
      }

      return objCopy as U;
    } finally {
      // Remove from seen set after processing to allow the same object
      // to appear in different branches (just not as a circular ref)
      seen.delete(obj);
    }
  };

  return copyRecursive(instance, 0);
};

/**
 * Alternative implementation of deep copy using reduce pattern.
 * Includes the same safety features as deepCopy.
 *
 * @param instance - The object to copy
 * @param options - Optional configuration for the copy operation
 * @returns A deep copy of the input object
 * @throws {DeepCopyError} If a circular reference is detected or max depth is exceeded
 */
// deno-lint-ignore no-explicit-any
export const deepCopy2 = <T extends Record<string | number | symbol, any>>(
  instance: T,
  options?: DeepCopyOptions,
): T => {
  const maxDepth = options?.maxDepth ?? DEEP_COPY_DEFAULT_MAX_DEPTH;
  const seen = new WeakSet<object>();

  const copyRecursive = <U extends Record<Key, unknown>>(
    obj: U,
    currentDepth: number,
  ): U => {
    if (!(obj instanceof Object)) {
      return obj;
    }

    // Check for circular references
    if (seen.has(obj)) {
      throw new DeepCopyError(
        "Circular reference detected: cannot deep copy objects with circular references",
      );
    }

    // Check depth limit
    if (currentDepth > maxDepth) {
      throw new DeepCopyError(
        `Maximum recursion depth exceeded (${maxDepth}). Object is too deeply nested or contains circular references.`,
      );
    }

    seen.add(obj);

    try {
      // Handle arrays specially
      if (Array.isArray(obj)) {
        // deno-lint-ignore no-explicit-any
        return obj.map((item) => copyRecursive(item, currentDepth + 1)) as any;
      }

      const Type = obj.constructor as { new (): U };

      return Object.entries(obj).reduce(
        (acc, [itemKey, value]) => {
          if (value instanceof Object && value.constructor !== Array) {
            acc[itemKey] = copyRecursive(
              value as Record<Key, unknown>,
              currentDepth + 1,
            );
            return acc;
          }

          acc[itemKey] = value;
          return acc;
        },
        // deno-lint-ignore no-explicit-any
        new Type() as any,
      );
    } finally {
      seen.delete(obj);
    }
  };

  return copyRecursive(instance, 0);
};

export { deepCopy as default };
