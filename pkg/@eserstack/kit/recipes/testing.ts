// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Helpers for the kit tests.
 *
 * @module
 */

/**
 * The static `ReadableStream.from`, which Node has and the TypeScript DOM
 * library does not declare yet.
 */
type ReadableStreamConstructorWithFrom = typeof ReadableStream & {
  from<T>(source: Iterable<T> | AsyncIterable<T>): ReadableStream<T>;
};

/** Returns a stream of the values of `source`, through `ReadableStream.from`. */
export const readableStreamFrom = <T>(
  source: Iterable<T> | AsyncIterable<T>,
): ReadableStream<T> => {
  return (ReadableStream as ReadableStreamConstructorWithFrom).from(source);
};
