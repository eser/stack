// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Middleware/streaming pipeline pattern.
 * Koa-style middleware composition with type-safe error handling.
 *
 * For monadic do-notation, see run()/runSync() in fn.ts.
 */

import * as results from "@eserstack/primitives/results";

/**
 * State shared by every middleware of one pipeline run. Each run starts with
 * an empty object, so a value one middleware writes is visible to the
 * middleware after it in the same run and to no other run.
 */
export type State = Record<string | symbol, unknown>;

/**
 * Context passed to each middleware function.
 *
 * `next()` runs the rest of the chain and yields its results, so a middleware
 * that delegates with `yield* ctx.next()` yields the pipeline's own result
 * types. A middleware may call `next()` once.
 *
 * @template S - State type shared by the middleware of one run
 * @template T - Success value type of the pipeline
 * @template E - Error type of the pipeline
 */
export type Context<S extends State = State, T = unknown, E = unknown> = {
  readonly state: S;
  readonly next: () => AsyncGenerator<results.Result<T, E>>;
};

/** Acceptable return types from middleware functions. */
export type CollectResult<T, E> =
  | AsyncGenerator<results.Result<T, E>>
  | Generator<results.Result<T, E>>
  | Promise<results.Result<T, E>>
  | results.Result<T, E>;

/**
 * A middleware function. It receives the context and the arguments the
 * pipeline was run with, and returns one result, a promise of one, or a
 * generator of results.
 */
export type Middleware<T, E, S extends State = State> = (
  context: Context<S, T, E>,
  ...args: ReadonlyArray<unknown>
) => CollectResult<T, E>;

/**
 * A middleware pipeline built by `collect()`. `use` adds middleware,
 * `mapError` and `recover` handle failures once per failure, `iterate` yields
 * every result, `run` collects them, and `runFirst` and `runLast` return one.
 *
 * @template T - Success value type of the pipeline
 * @template E - Error type of the pipeline
 * @template S - State type shared by the middleware of one run
 */
export type Pipeline<T, E, S extends State = State> = {
  readonly use: (
    ...fns: ReadonlyArray<Middleware<T, E, S>>
  ) => Pipeline<T, E, S>;
  readonly mapError: <E2>(f: (error: E) => E2) => Pipeline<T, E2, S>;
  readonly recover: (
    f: (error: E) => results.Result<T, never>,
  ) => Pipeline<T, never, S>;
  readonly iterate: (
    ...args: ReadonlyArray<unknown>
  ) => AsyncGenerator<results.Result<T, E>>;
  readonly run: (
    ...args: ReadonlyArray<unknown>
  ) => Promise<results.Result<T[], E>>;
  readonly runFirst: (
    ...args: ReadonlyArray<unknown>
  ) => Promise<results.Result<T, E>>;
  readonly runLast: (
    ...args: ReadonlyArray<unknown>
  ) => Promise<results.Result<T, E>>;
};

// Error Constants
const ERROR_NEXT_CALLED_MULTIPLE_TIMES =
  "next() called multiple times in same middleware";
const ERROR_NO_RESULTS = "Pipeline produced no results";

// Internal Helpers
const isPromise = <T, E>(
  value: CollectResult<T, E>,
): value is Promise<results.Result<T, E>> => value instanceof Promise;

// A Result is iterable too (for do-notation), so check it before treating the
// value as a generator.
const isResult = <T, E>(
  value: CollectResult<T, E>,
): value is results.Result<T, E> => "_tag" in value;

/**
 * Create a pipeline for composing middleware functions that emit multiple results.
 * Each middleware receives a context with state and next() function.
 *
 * @example
 * ```typescript
 * import * as functions from "@eserstack/functions";
 * import * as primitives from "@eserstack/primitives";
 *
 * const pipeline = functions.collect<string, Error>()
 *   .use(async function* (ctx) {
 *     yield primitives.results.ok("hello");
 *     yield* ctx.next();
 *   })
 *   .use(async function* () {
 *     yield primitives.results.ok("world");
 *   });
 *
 * const result = await pipeline.run();
 * // result: ok(["hello", "world"])
 * ```
 */
export const collect = <T, E = Error, S extends State = State>(
  ...initialFns: ReadonlyArray<Middleware<T, E, S>>
): Pipeline<T, E, S> => {
  let stack: ReadonlyArray<Middleware<T, E, S>> = initialFns;
  let errorMapper: ((error: E) => unknown) | null = null;
  let recoverer: ((error: E) => results.Result<T, never>) | null = null;

  const processResult = (item: results.Result<T, E>): results.Result<T, E> => {
    if (results.isFail(item)) {
      if (recoverer !== null) {
        return recoverer(item.error) as results.Result<T, E>;
      }
      if (errorMapper !== null) {
        return results.fail(errorMapper(item.error)) as results.Result<T, E>;
      }
    }
    return item;
  };

  const iterate = async function* (
    ...args: ReadonlyArray<unknown>
  ): AsyncGenerator<results.Result<T, E>> {
    const state = {} as S;
    let lastIndex = -1;

    // Yields what the middleware at `index` and the rest of the chain emit,
    // before error mapping or recovery.
    const executeMiddleware = async function* (
      index: number,
    ): AsyncGenerator<results.Result<T, E>> {
      // A second next() from the same middleware asks for an index the chain
      // has already reached.
      if (index <= lastIndex) {
        throw new Error(ERROR_NEXT_CALLED_MULTIPLE_TIMES);
      }
      lastIndex = index;

      const middleware = stack[index];
      if (middleware === undefined) {
        return;
      }

      const context: Context<S, T, E> = {
        state,
        next: () => executeMiddleware(index + 1),
      };

      const result = middleware(context, ...args);

      if (isPromise(result)) {
        yield await result;
        return;
      }

      if (isResult(result)) {
        yield result;
        return;
      }

      yield* result;
    };

    // Error mapping and recovery run once, on what the whole chain emits, so a
    // failure that passes up through `yield* ctx.next()` is not mapped again.
    for await (const item of executeMiddleware(0)) {
      yield processResult(item);
    }
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

    recover: (
      f: (error: E) => results.Result<T, never>,
    ): Pipeline<T, never, S> => {
      recoverer = f;
      return pipeline as unknown as Pipeline<T, never, S>;
    },

    iterate,

    run: async (...args) => {
      const collected: T[] = [];
      for await (const item of iterate(...args)) {
        if (results.isFail(item)) {
          return item as unknown as results.Result<T[], E>;
        }
        collected.push(item.value);
      }
      return results.ok(collected);
    },

    runFirst: async (...args) => {
      for await (const item of iterate(...args)) {
        return item;
      }
      return results.fail(new Error(ERROR_NO_RESULTS) as unknown as E);
    },

    runLast: async (...args) => {
      let lastResult: results.Result<T, E> | null = null;
      for await (const item of iterate(...args)) {
        if (results.isFail(item)) {
          return item;
        }
        lastResult = item;
      }
      if (lastResult === null) {
        return results.fail(new Error(ERROR_NO_RESULTS) as unknown as E);
      }
      return lastResult;
    },
  };

  return pipeline;
};
