// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// deno-lint-ignore no-explicit-any
type ObjectType = Record<string | number | symbol, any>;

/**
 * Default maximum recursion depth for deep merge operations.
 * This prevents stack overflow on deeply nested objects.
 */
export const DEEP_MERGE_DEFAULT_MAX_DEPTH = 100;

/**
 * Error thrown when deep merge encounters a circular reference or exceeds max depth.
 */
export class DeepMergeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeepMergeError";
  }
}

/**
 * Options for deep merge operations.
 */
export type DeepMergeOptions = {
  /**
   * Maximum recursion depth. Defaults to DEEP_MERGE_DEFAULT_MAX_DEPTH (100).
   * Set to Infinity to disable depth checking (not recommended).
   */
  maxDepth?: number;

  /**
   * When false (default), source properties that are `undefined` are skipped,
   * preserving the destination value. This matches lodash's _.merge behavior
   * and is ideal for merging user config into defaults.
   *
   * When true, `undefined` values in source will override destination values.
   *
   * @default false
   */
  noSkipUndefined?: boolean;
};

/**
 * Deeply merges two objects, recursively merging nested objects.
 * Properties from `other` override properties from `instance` at the same path.
 * For nested objects, the merge is recursive rather than a simple override.
 *
 * By default (matching lodash's _.merge behavior), source properties that are
 * `undefined` are skipped, preserving the destination value. This is ideal for
 * merging user config (with optional properties) into defaults.
 *
 * @param instance - The base object to merge into
 * @param other - The object to merge from (its values take precedence). Can be undefined/null.
 * @param options - Optional configuration for the merge operation
 * @returns A new object with merged properties from both inputs
 * @throws {DeepMergeError} If a circular reference is detected or max depth is exceeded
 *
 * @example
 * ```typescript
 * const base = { a: { b: 1, c: 2 } };
 * const override = { a: { b: 10 } };
 * const result = deepMerge(base, override);
 * // result = { a: { b: 10, c: 2 } }
 * ```
 *
 * @example
 * ```typescript
 * // Config merging - undefined values are skipped by default
 * const defaults = { port: 8000, host: "localhost" };
 * const userConfig = { port: undefined, host: "0.0.0.0" };
 * const result = deepMerge(defaults, userConfig);
 * // result = { port: 8000, host: "0.0.0.0" }
 * ```
 *
 * @example
 * ```typescript
 * // Undefined source returns instance unchanged
 * const defaults = { port: 8000 };
 * const result = deepMerge(defaults, undefined);
 * // result = { port: 8000 }
 * ```
 */
export const deepMerge = <
  T1 extends ObjectType,
  T2 extends ObjectType | undefined | null,
  TR extends T2 extends ObjectType ? T1 & T2 : T1,
>(
  instance: T1,
  other: T2,
  options?: DeepMergeOptions,
): TR => {
  // Early return if other is undefined or null - return a shallow copy of instance
  if (other === undefined || other === null) {
    // Still need to deep copy to maintain immutability
    const Type = instance.constructor as { new (): TR };
    const result = new Type();
    for (const key of Object.keys(instance)) {
      (result as Record<string, unknown>)[key] = instance[key];
    }
    return result;
  }

  const maxDepth = options?.maxDepth ?? DEEP_MERGE_DEFAULT_MAX_DEPTH;
  const noSkipUndefined = options?.noSkipUndefined ?? false;
  const seenInstance = new WeakSet<object>();
  const seenOther = new WeakSet<object>();

  const mergeRecursive = <
    U1 extends ObjectType,
    U2 extends ObjectType,
    UR extends U1 & U2,
  >(
    inst: U1,
    oth: U2,
    currentDepth: number,
  ): UR => {
    // Handle non-object instance (primitives)
    if (!(inst instanceof Object)) {
      return inst as unknown as UR;
    }

    // Check for circular references in instance
    if (seenInstance.has(inst)) {
      throw new DeepMergeError(
        "Circular reference detected in first argument: cannot deep merge objects with circular references",
      );
    }

    // Check for circular references in other
    if (oth instanceof Object && seenOther.has(oth)) {
      throw new DeepMergeError(
        "Circular reference detected in second argument: cannot deep merge objects with circular references",
      );
    }

    // Check depth limit
    if (currentDepth > maxDepth) {
      throw new DeepMergeError(
        `Maximum recursion depth exceeded (${maxDepth}). Objects are too deeply nested or contain circular references.`,
      );
    }

    // Mark objects as seen
    seenInstance.add(inst);
    if (oth instanceof Object) {
      seenOther.add(oth);
    }

    try {
      const Type = inst.constructor as { new (): UR };
      // deno-lint-ignore no-explicit-any
      const result: Record<string, any> = new Type();
      const instKeys = Object.keys(inst);
      const processedKeys = new Set<string>();

      // Process keys from instance
      for (let i = 0, len = instKeys.length; i < len; i++) {
        const itemKey = instKeys[i]!;
        const recordValue = inst[itemKey];
        const otherKeyExists = (oth !== undefined) && (itemKey in oth);
        const otherValue = oth?.[itemKey];

        processedKeys.add(itemKey);

        // Skip undefined values in source unless noSkipUndefined is true
        const shouldSkipOther = otherKeyExists &&
          otherValue === undefined &&
          !noSkipUndefined;

        if (
          recordValue instanceof Object && recordValue.constructor !== Array
        ) {
          let mergedValue: unknown;

          if (shouldSkipOther) {
            // Skip undefined - process instance value for circular ref detection
            mergedValue = mergeRecursive(
              recordValue,
              {} as U2,
              currentDepth + 1,
            );
          } else if (
            otherKeyExists && otherValue instanceof Object &&
            otherValue.constructor !== Array
          ) {
            // Both are objects - merge recursively
            mergedValue = mergeRecursive(
              recordValue,
              otherValue,
              currentDepth + 1,
            );
          } else if (otherKeyExists) {
            // Other value takes precedence (even if not an object)
            mergedValue = otherValue;
          } else {
            // No other value - still need to process for circular ref detection
            mergedValue = mergeRecursive(
              recordValue,
              {} as U2,
              currentDepth + 1,
            );
          }

          result[itemKey] = mergedValue;
        } else {
          // For primitives: use other value unless it should be skipped
          if (shouldSkipOther) {
            result[itemKey] = recordValue;
          } else {
            result[itemKey] = otherKeyExists ? otherValue : recordValue;
          }
        }
      }

      if (oth === undefined) {
        return result as UR;
      }

      // Add remaining keys from 'other' that weren't in 'instance'
      const otherKeys = Object.keys(oth);
      for (let i = 0, len = otherKeys.length; i < len; i++) {
        const itemKey = otherKeys[i]!;
        if (processedKeys.has(itemKey)) {
          continue;
        }

        const otherValue = oth[itemKey];

        // Skip undefined values unless noSkipUndefined is true
        if (otherValue === undefined && !noSkipUndefined) {
          continue;
        }

        // For nested objects in 'other', we need to check for circular references
        if (
          otherValue instanceof Object && otherValue.constructor !== Array
        ) {
          result[itemKey] = mergeRecursive(
            {} as U1,
            otherValue,
            currentDepth + 1,
          );
        } else {
          result[itemKey] = otherValue;
        }
      }

      return result as UR;
    } finally {
      // Remove from seen sets after processing
      seenInstance.delete(inst);
      if (oth instanceof Object) {
        seenOther.delete(oth);
      }
    }
  };

  return mergeRecursive(instance, other, 0);
};

export { deepMerge as default };
