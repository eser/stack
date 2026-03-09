// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * @eser/functions - Functional programming patterns for pipelines, middleware, and result handling.
 *
 * @example
 * ```typescript
 * import * as functions from "@eser/functions";
 *
 * // Result type for error handling
 * const divide = (a: number, b: number): functions.results.Result<number, string> =>
 *   b === 0 ? functions.results.fail("Division by zero") : functions.results.ok(a / b);
 *
 * // Option type for nullable values
 * const maybeValue = functions.options.fromNullable(getValue());
 *
 * // collect() for middleware/streaming
 * const pipeline = functions.collect<string, Error>()
 *   .use(loggingMiddleware)
 *   .use(handler);
 *
 * // run() for monadic composition
 * const result = await functions.run(async function* () {
 *   const user = yield* fetchUser(1);
 *   const posts = yield* fetchPosts(user.id);
 *
 *   return { user, posts };
 * });
 * ```
 */

// Namespaced exports matching file names
export * as results from "./results.ts";
export * as options from "./options.ts";
export * as resources from "./resources.ts";

// Utility types - direct export for convenience
export {
  type AsyncPredicateFn,
  type AsyncUnaryFn,
  type Awaited,
  type BinaryFn,
  type Brand,
  type ComparatorFn,
  type DeepReadonly,
  type Head,
  isNonEmpty,
  type Lazy,
  type NonEmptyArray,
  type OptionalKeys,
  type PredicateFn,
  type Promisable,
  type RequiredKeys,
  type Tail,
  type UnaryFn,
  unwrapLazy,
} from "./types.ts";

export {
  collect,
  type CollectResult,
  type Context,
  type Middleware,
  type Pipeline,
  run,
  runSync,
  type State,
} from "./fn.ts";
