// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type { Result } from "./results.ts";
import { fail, isFail, ok } from "./results.ts";

/**
 * Function composition utilities with type-safe error handling.
 *
 * Two patterns available:
 * - `collect()`: Middleware/streaming pattern - emits multiple results
 * - `do()`/`doSync()`: Monadic composition - unwraps results, computes single value
 */

// =============================================================================
// Shared Types
// =============================================================================

// State type for pipeline context
export type State = Record<string | symbol, unknown>;

// Context passed to each middleware function
export type Context<S extends State = State> = {
  readonly state: S;
  readonly next: () => AsyncGenerator<unknown>;
};

// Acceptable return types from middleware functions
export type CollectResult<T, E> =
  | AsyncGenerator<Result<T, E>>
  | Generator<Result<T, E>>
  | Promise<Result<T, E>>
  | Result<T, E>;

// Middleware function type
export type Middleware<T, E, S extends State = State> = (
  context: Context<S>,
  ...args: ReadonlyArray<unknown>
) => CollectResult<T, E>;

// Pipeline interface with chainable methods
export type Pipeline<T, E, S extends State = State> = {
  readonly use: (
    ...fns: ReadonlyArray<Middleware<T, E, S>>
  ) => Pipeline<T, E, S>;
  readonly mapError: <E2>(f: (error: E) => E2) => Pipeline<T, E2, S>;
  readonly recover: (
    f: (error: E) => Result<T, never>,
  ) => Pipeline<T, never, S>;
  readonly iterate: (
    ...args: ReadonlyArray<unknown>
  ) => AsyncGenerator<Result<T, E>>;
  readonly run: (...args: ReadonlyArray<unknown>) => Promise<Result<T[], E>>;
  readonly runFirst: (...args: ReadonlyArray<unknown>) => Promise<Result<T, E>>;
  readonly runLast: (...args: ReadonlyArray<unknown>) => Promise<Result<T, E>>;
};

// =============================================================================
// Error Constants
// =============================================================================

const ERROR_NEXT_CALLED_MULTIPLE_TIMES =
  "next() called multiple times in same middleware";
const ERROR_NO_RESULTS = "Pipeline produced no results";

// =============================================================================
// Internal Helpers
// =============================================================================

/**
 * Check if a value is an iterator (sync or async).
 * Using Symbol checks per project convention (instanceof over typeof).
 */
const isIterator = (value: unknown): value is AsyncGenerator | Generator =>
  value !== null &&
  typeof value === "object" &&
  (Symbol.asyncIterator in value || Symbol.iterator in value);

/**
 * Check if a value is a Promise.
 * Using instanceof per project convention.
 */
const isPromise = (value: unknown): value is Promise<unknown> =>
  value instanceof Promise;

// =============================================================================
// collect() - Middleware/Streaming Pattern
// =============================================================================

/**
 * Create a pipeline for composing middleware functions that emit multiple results.
 * Each middleware receives a context with state and next() function.
 *
 * Use `collect()` when you need:
 * - Middleware pattern (before/after hooks)
 * - Streaming multiple results
 * - Express-like request pipelines
 *
 * @example
 * ```typescript
 * const pipeline = collect<string, Error>()
 *   .use(async function* (ctx) {
 *     yield results.ok("hello");
 *     yield* ctx.next();
 *   })
 *   .use(async function* () {
 *     yield results.ok("world");
 *   });
 *
 * const result = await pipeline.run();
 * // result: results.ok(["hello", "world"])
 * ```
 */
export const collect = <T, E = Error, S extends State = State>(
  ...initialFns: ReadonlyArray<Middleware<T, E, S>>
): Pipeline<T, E, S> => {
  // Pipeline state - immutable approach using spread when adding
  let stack: ReadonlyArray<Middleware<T, E, S>> = initialFns;
  let errorMapper: ((error: E) => unknown) | null = null;
  let recoverer: ((error: E) => Result<T, never>) | null = null;

  /**
   * Process a single result, applying error mapping or recovery if configured.
   */
  const processResult = (item: Result<T, E>): Result<T, E> => {
    if (isFail(item)) {
      if (recoverer !== null) {
        return recoverer(item.error) as Result<T, E>;
      }
      if (errorMapper !== null) {
        return fail(errorMapper(item.error)) as Result<T, E>;
      }
    }
    return item;
  };

  /**
   * Core iteration logic - executes middleware chain as async generator.
   */
  const iterate = async function* (
    ...args: ReadonlyArray<unknown>
  ): AsyncGenerator<Result<T, E>> {
    let prevIndex = -1;

    const executeMiddleware = async function* (
      index: number,
    ): AsyncGenerator<Result<T, E>> {
      // Prevent calling next() multiple times from same middleware
      if (index === prevIndex) {
        throw new Error(ERROR_NEXT_CALLED_MULTIPLE_TIMES);
      }
      prevIndex = index;

      const middleware = stack[index];
      if (middleware === undefined) {
        return;
      }

      const context: Context<S> = {
        state: {} as S,
        next: () => executeMiddleware(index + 1),
      };

      const result = middleware(context, ...args);

      // Handle iterator results (generators)
      if (isIterator(result)) {
        for await (const item of result) {
          yield processResult(item);
        }
        return;
      }

      // Handle promise results
      if (isPromise(result)) {
        const awaited = await result;
        yield processResult(awaited);
        return;
      }

      // Handle sync results
      yield processResult(result);
    };

    yield* executeMiddleware(0);
  };

  const pipeline: Pipeline<T, E, S> = {
    use: (...newFns) => {
      stack = [...stack, ...newFns];
      return pipeline;
    },

    mapError: <E2>(f: (error: E) => E2): Pipeline<T, E2, S> => {
      errorMapper = f as (error: E) => unknown;
      return pipeline as unknown as Pipeline<T, E2, S>;
    },

    recover: (f: (error: E) => Result<T, never>): Pipeline<T, never, S> => {
      recoverer = f;
      return pipeline as unknown as Pipeline<T, never, S>;
    },

    iterate,

    run: async (...args) => {
      const results: T[] = [];
      for await (const item of iterate(...args)) {
        if (isFail(item)) {
          return item as unknown as Result<T[], E>;
        }
        results.push(item.value);
      }
      return ok(results);
    },

    runFirst: async (...args) => {
      for await (const item of iterate(...args)) {
        return item;
      }
      return fail(new Error(ERROR_NO_RESULTS) as unknown as E);
    },

    runLast: async (...args) => {
      let lastResult: Result<T, E> | null = null;
      for await (const item of iterate(...args)) {
        if (isFail(item)) {
          return item;
        }
        lastResult = item;
      }
      if (lastResult === null) {
        return fail(new Error(ERROR_NO_RESULTS) as unknown as E);
      }
      return lastResult;
    },
  };

  return pipeline;
};

// =============================================================================
// do() / doSync() - Monadic Composition Pattern
// =============================================================================

/**
 * Async monadic composition using generators (do-notation).
 * `yield*` unwraps a Result to get the success value, short-circuiting on failure.
 *
 * Use `do()` when you need:
 * - Sequential async operations
 * - Access to intermediate values
 * - Computing a single final result
 *
 * @example
 * ```typescript
 * const fetchUserWithPosts = (userId: number) => Fn.do(async function* () {
 *   const user = yield* fetchUser(userId);       // Unwrap Result<User, E>
 *   const posts = yield* fetchPosts(user.id);    // Use user.id!
 *   return { user, posts };                      // Compute final value
 * });
 *
 * const result = await fetchUserWithPosts(1);
 * // result: Result<{ user: User, posts: Post[] }, Error>
 * ```
 */
export const run = async <T, E>(
  generator: () => AsyncGenerator<Result<unknown, E>, T, unknown>,
): Promise<Result<T, E>> => {
  const iter = generator();

  let next = await iter.next();

  while (!next.done) {
    const result = next.value as Result<unknown, E>;

    if (isFail(result)) {
      // Short-circuit on failure
      return result as Result<T, E>;
    }

    // Pass the unwrapped value back into the generator
    next = await iter.next(result.value);
  }

  // Wrap the final return value in Ok
  return ok(next.value);
};

/**
 * Sync monadic composition using generators (do-notation).
 * `yield*` unwraps a Result to get the success value, short-circuiting on failure.
 *
 * Use `doSync()` when you need:
 * - Sequential sync operations
 * - Access to intermediate values
 * - Computing a single final result without async
 *
 * @example
 * ```typescript
 * const parseConfig = (input: string) => Fn.doSync(function* () {
 *   const json = yield* parseJson(input);       // Unwrap Result<Json, E>
 *   const port = yield* validatePort(json.port); // Use json!
 *   return { port, host: json.host };           // Compute final value
 * });
 *
 * const result = parseConfig('{"port": 3000}');
 * // result: Result<{ port: number, host: string }, Error>
 * ```
 */
export const runSync = <T, E>(
  generator: () => Generator<Result<unknown, E>, T, unknown>,
): Result<T, E> => {
  const iter = generator();

  let next = iter.next();

  while (!next.done) {
    const result = next.value as Result<unknown, E>;

    if (isFail(result)) {
      // Short-circuit on failure
      return result as Result<T, E>;
    }

    // Pass the unwrapped value back into the generator
    next = iter.next(result.value);
  }

  // Wrap the final return value in Ok
  return ok(next.value);
};
