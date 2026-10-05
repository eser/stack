// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Main module entry point.
 *
 * @module
 */

import * as primitives from "@eserstack/primitives";

/**
 * Builds a greeting for `name`. An empty name is an expected failure, so it
 * comes back as a `Fail` result instead of a thrown error.
 *
 * @param name - Who to greet; surrounding whitespace is ignored
 * @returns `Ok` with the greeting, such as "Hello, World!", or `Fail` when
 * `name` is empty
 */
export const greet = (
  name: string,
): primitives.results.Result<string, Error> => {
  const trimmed = name.trim();

  if (trimmed === "") {
    return primitives.results.fail(new Error("name is empty"));
  }

  return primitives.results.ok(`Hello, ${trimmed}!`);
};
