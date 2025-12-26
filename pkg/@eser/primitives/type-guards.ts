// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Type guard utilities using .constructor checks per javascript-practices rules.
 * Avoids typeof operator for type checking.
 *
 * @example
 * ```typescript
 * import { isString, isPlainObject, isDefined } from "@eser/primitives/type-guards";
 *
 * if (isString(value)) {
 *   console.log(value.toUpperCase());
 * }
 *
 * if (isPlainObject(data)) {
 *   console.log(Object.keys(data));
 * }
 * ```
 *
 * @module
 */

/**
 * Checks if a value is a string primitive.
 */
export const isString = (value: unknown): value is string =>
  value !== null && value !== undefined &&
  (value as object).constructor === String;

/**
 * Checks if a value is a number primitive (excluding NaN).
 */
export const isNumber = (value: unknown): value is number =>
  value !== null &&
  value !== undefined &&
  (value as object).constructor === Number &&
  !Number.isNaN(value);

/**
 * Checks if a value is a boolean primitive.
 */
export const isBoolean = (value: unknown): value is boolean =>
  value !== null && value !== undefined &&
  (value as object).constructor === Boolean;

/**
 * Checks if a value is an array.
 */
export const isArray = <T = unknown>(value: unknown): value is T[] =>
  Array.isArray(value);

/**
 * Checks if a value is a plain object (not null, not array, constructor is Object).
 */
export const isPlainObject = (
  value: unknown,
): value is Record<string, unknown> =>
  value !== null && value !== undefined &&
  (value as object).constructor === Object;

/**
 * Checks if a value is defined (not null and not undefined).
 */
export const isDefined = <T>(value: T | null | undefined): value is T =>
  value !== null && value !== undefined;

/**
 * Checks if a value is null or undefined.
 */
export const isNullish = (value: unknown): value is null | undefined =>
  value === null || value === undefined;

/**
 * Checks if a value is a function.
 */
export const isFunction = (
  value: unknown,
): value is (...args: unknown[]) => unknown =>
  value !== null && value !== undefined &&
  (value as object).constructor === Function;

/**
 * Checks if a value is a Date instance.
 */
export const isDate = (value: unknown): value is Date => value instanceof Date;

/**
 * Checks if a value is a RegExp instance.
 */
export const isRegExp = (value: unknown): value is RegExp =>
  value instanceof RegExp;

/**
 * Checks if a value is a Promise instance.
 */
export const isPromise = <T = unknown>(value: unknown): value is Promise<T> =>
  value instanceof Promise;
