// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Shared utility types for @eserstack/functions.
 */

// Generic function types
export type UnaryFn<T, R> = (value: T) => R;
export type BinaryFn<T1, T2, R> = (a: T1, b: T2) => R;
export type PredicateFn<T> = (value: T) => boolean;
export type ComparatorFn<T> = (a: T, b: T) => number;

// Async variants
export type AsyncUnaryFn<T, R> = (value: T) => Promise<R>;
export type AsyncPredicateFn<T> = (value: T) => Promise<boolean>;

// Lazily evaluated value
export type Lazy<T> = T | (() => T);

// Unwrap lazy value
export const unwrapLazy = <T>(value: Lazy<T>): T =>
  typeof value === "function" ? (value as () => T)() : value;

// Brand type for nominal typing
export type Brand<T, B extends string> = T & { readonly __brand: B };

// Non-empty array type
export type NonEmptyArray<T> = readonly [T, ...T[]];

// Check if array is non-empty (type guard)
export const isNonEmpty = <T>(arr: readonly T[]): arr is NonEmptyArray<T> =>
  arr.length > 0;

// First element type
export type Head<T extends readonly unknown[]> = T extends readonly [
  infer H,
  ...unknown[],
] ? H
  : never;

// Rest elements type
export type Tail<T extends readonly unknown[]> = T extends readonly [
  unknown,
  ...infer R,
] ? R
  : never;

// Make specific keys required
export type RequiredKeys<T, K extends keyof T> = T & Required<Pick<T, K>>;

// Make specific keys optional
export type OptionalKeys<T, K extends keyof T> =
  & Omit<T, K>
  & Partial<Pick<T, K>>;

// Deep readonly
export type DeepReadonly<T> = T extends object
  ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
  : T;

// Extract the value type from a Promise
export type Awaited<T> = T extends Promise<infer U> ? U : T;
