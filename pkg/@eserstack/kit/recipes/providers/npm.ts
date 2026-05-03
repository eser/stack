// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * npm provider stub for kit recipe sources.
 *
 * Parses npm: specifiers but fetch is not yet implemented.
 *
 * @module
 */

import type { ParsedSpec, Provider } from "./types.ts";

const parseNpm = (specifier: string): ParsedSpec => {
  const raw = specifier.replace(/^npm:/, "");
  // Accept: package, package@version, @scope/package, @scope/package@version
  if (raw === "" || raw === "@") {
    throw new Error(`Invalid npm specifier: ${specifier}`);
  }
  return {
    specifier,
    providerName: "npm",
    stripComponents: 1,
  };
};

const fetchNpm = (_parsed: ParsedSpec): Promise<ReadableStream<Uint8Array>> => {
  throw new Error(
    "npm: provider not yet implemented. Use gh:owner/repo or wait for npm support. " +
      "Track at https://github.com/eser/stack/issues?q=label:kit-npm",
  );
};

export const provider: Provider = Object.freeze({
  name: "npm",
  parse: parseNpm,
  fetch: fetchNpm,
});
