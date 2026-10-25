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
 * import * as functions from "@eserstack/functions";
 * import * as primitives from "@eserstack/primitives";
 *
 * const fetchUser = (id: number) =>
 *   Promise.resolve(primitives.results.ok({ id, name: "Ada" }));
 * const fetchPosts = (userId: number) =>
 *   Promise.resolve(primitives.results.ok([{ userId, title: "Hello" }]));
 *
 * const fetchUserWithPosts = (userId: number) =>
 *   functions.run(async function* () {
 *     const user = yield* await fetchUser(userId);
 *     const posts = yield* await fetchPosts(user.id);
 *     return { user, posts };
 *   });
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

    // Each step resumes the generator with the previous step's value, so the
    // steps cannot overlap.
    // oxlint-disable-next-line no-await-in-loop
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
 * import * as functions from "@eserstack/functions";
 * import * as primitives from "@eserstack/primitives";
 *
 * type Json = { readonly port?: unknown; readonly host?: string };
 *
 * const parseJson = (input: string) =>
 *   primitives.results.tryCatch((): Json => JSON.parse(input), () => "bad JSON");
 * const validatePort = (port: unknown) =>
 *   typeof port === "number"
 *     ? primitives.results.ok(port)
 *     : primitives.results.fail("port must be a number");
 *
 * const parseConfig = (input: string) =>
 *   functions.runSync(function* () {
 *     const json = yield* parseJson(input);
 *     const port = yield* validatePort(json.port);
 *     return { port, host: json.host };
 *   });
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
