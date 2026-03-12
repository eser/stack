// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Lazy computation type for deferred, composable async operations.
 * Task<T, E> wraps a () => Promise<Result<T, E>> — the computation
 * doesn't execute until you call runTask().
 */

import * as results from "@eser/primitives/results";
import { retry, withTimeout as resourceWithTimeout } from "./resources.ts";

// Core type
export type Task<T, E = Error> = {
  readonly _tag: "Task";
  readonly execute: () => Promise<results.Result<T, E>>;
};

// Constructors
export const task = <T, E = Error>(
  execute: () => Promise<results.Result<T, E>>,
): Task<T, E> => ({ _tag: "Task", execute });

export const succeed = <T>(value: T): Task<T, never> =>
  task(() => Promise.resolve(results.ok(value)));

export const failTask = <E>(error: E): Task<never, E> =>
  task(() => Promise.resolve(results.fail(error)));

export const fromPromise = <T, E = Error>(
  promise: () => Promise<T>,
  onError: (error: unknown) => E = (e) => e as E,
): Task<T, E> =>
  task(async () => {
    try {
      return results.ok(await promise());
    } catch (error) {
      return results.fail(onError(error));
    }
  });

// Combinators
export const map = <T, U, E>(
  t: Task<T, E>,
  f: (value: T) => U,
): Task<U, E> =>
  task(async () => {
    const result = await t.execute();
    return results.isOk(result) ? results.ok(f(result.value)) : result;
  });

export const flatMap = <T, U, E>(
  t: Task<T, E>,
  f: (value: T) => Task<U, E>,
): Task<U, E> =>
  task(async () => {
    const result = await t.execute();
    if (results.isFail(result)) return result;
    return f(result.value).execute();
  });

export const flatMapW = <T, U, E1, E2>(
  t: Task<T, E1>,
  f: (value: T) => Task<U, E2>,
): Task<U, E1 | E2> =>
  task<U, E1 | E2>(async () => {
    const result = await t.execute();
    if (results.isFail(result)) return result;
    return f(result.value).execute();
  });

// Execution
export const runTask = <T, E>(t: Task<T, E>): Promise<results.Result<T, E>> =>
  t.execute();

// Collection
export const all = <T, E>(
  tasks: ReadonlyArray<Task<T, E>>,
): Task<T[], E> =>
  task(async () => {
    const values: T[] = [];
    for (const t of tasks) {
      const result = await t.execute();
      if (results.isFail(result)) return result;
      values.push(result.value);
    }
    return results.ok(values);
  });

export const allPar = <T, E>(
  tasks: ReadonlyArray<Task<T, E>>,
): Task<T[], E> =>
  task(async () => {
    const taskResults = await Promise.all(tasks.map((t) => t.execute()));
    const values: T[] = [];
    for (const result of taskResults) {
      if (results.isFail(result)) return result;
      values.push(result.value);
    }
    return results.ok(values);
  });

// Bridges to resources.ts
export const withRetry = <T, E>(
  t: Task<T, E>,
  attempts: number,
  delay = 0,
): Task<T, E> => task(() => retry(() => t.execute(), attempts, delay));

export const withTimeout = <T, E>(
  t: Task<T, E>,
  timeoutMs: number,
  timeoutError: E,
): Task<T, E> =>
  task(() => resourceWithTimeout(() => t.execute(), timeoutMs, timeoutError));
