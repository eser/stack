// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Middleware/streaming pipeline pattern.
 * Koa-style middleware composition with type-safe error handling.
 *
 * For monadic do-notation, see run()/runSync() in fn.ts.
 */

import * as results from "@eserstack/primitives/results";
import type { Generatable } from "@eserstack/primitives/promises";

// State type for pipeline context
export type State = Record<string | symbol, unknown>;

// Context passed to each middleware function
export type Context<S extends State = State> = {
  readonly state: S;
  readonly next: () => AsyncGenerator<results.Result<unknown, unknown>>;
};

// Acceptable return types from middleware functions
export type CollectResult<T, E> =
  | Generatable<results.Result<T, E>>
  | Promise<results.Result<T, E>>
  | results.Result<T, E>;

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
const isIterator = (
  value: unknown,
): value is Generatable<unknown> =>
  value !== null &&
  typeof value === "object" &&
  (Symbol.asyncIterator in (value as object) ||
    Symbol.iterator in (value as object));

const isPromise = (value: unknown): value is Promise<unknown> =>
  value instanceof Promise;

/**
 * Create a pipeline for composing middleware functions that emit multiple results.
 * Each middleware receives a context with state and next() function.
 *
 * @example
 * ```typescript
 * import { collect } from "@eserstack/functions/pipeline";
 * import { ok } from "@eserstack/primitives/results";
 *
 * const pipeline = collect<string, Error>()
 *   .use(async function* (ctx) {
 *     yield ok("hello");
 *     yield* ctx.next();
 *   })
 *   .use(async function* () {
 *     yield ok("world");
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
    let prevIndex = -1;

    const executeMiddleware = async function* (
      index: number,
    ): AsyncGenerator<results.Result<T, E>> {
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
        next: () =>
          executeMiddleware(index + 1) as AsyncGenerator<
            results.Result<unknown, unknown>
          >,
      };

      const result = middleware(context, ...args);

      if (isIterator(result)) {
        for await (const item of result) {
          yield processResult(item);
        }
        return;
      }

      if (isPromise(result)) {
        const awaited = await result;
        yield processResult(awaited);
        return;
      }

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
