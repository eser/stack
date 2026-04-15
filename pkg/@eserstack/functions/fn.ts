// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Monadic do-notation for composing Result-returning operations.
 * Uses generator yield* to unwrap Results, short-circuiting on failure.
 *
 * For middleware/streaming pipelines, see collect() in pipeline.ts.
 */

import * as results from "@eserstack/primitives/results";

/**
 * Async monadic composition using generators (do-notation).
 * `yield*` unwraps a Result to get the success value, short-circuiting on failure.
 *
 * @example
 * ```typescript
 * import { run } from "@eserstack/functions";
 * import { ok, fail } from "@eserstack/primitives/results";
 *
 * const fetchUserWithPosts = (userId: number) => run(async function* () {
 *   const user = yield* fetchUser(userId);
 *   const posts = yield* fetchPosts(user.id);
 *   return { user, posts };
 * });
 * ```
 */
export const run = async <T, E>(
  generator: () => AsyncGenerator<results.Result<unknown, E>, T, unknown>,
): Promise<results.Result<T, E>> => {
  const iter = generator();

  let next = await iter.next();

  while (!next.done) {
    const result = next.value as results.Result<unknown, E>;

    if (results.isFail(result)) {
      return result as results.Result<T, E>;
    }

    next = await iter.next(result.value);
  }

  return results.ok(next.value);
};

/**
 * Sync monadic composition using generators (do-notation).
 * `yield*` unwraps a Result to get the success value, short-circuiting on failure.
 *
 * @example
 * ```typescript
 * import { runSync } from "@eserstack/functions";
 * import { ok, fail } from "@eserstack/primitives/results";
 *
 * const parseConfig = (input: string) => runSync(function* () {
 *   const json = yield* parseJson(input);
 *   const port = yield* validatePort(json.port);
 *   return { port, host: json.host };
 * });
 * ```
 */
export const runSync = <T, E>(
  generator: () => Generator<results.Result<unknown, E>, T, unknown>,
): results.Result<T, E> => {
  const iter = generator();

  let next = iter.next();

  while (!next.done) {
    const result = next.value as results.Result<unknown, E>;

    if (results.isFail(result)) {
      return result as results.Result<T, E>;
    }

    next = iter.next(result.value);
  }

  return results.ok(next.value);
};
