// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * JSR provider stub for kit recipe sources.
 *
 * Parses jsr: specifiers but fetch is not yet implemented.
 *
 * @module
 */

import type { ParsedSpec, Provider } from "./types.ts";

const parseJsr = (specifier: string): ParsedSpec => {
  const raw = specifier.replace(/^jsr:/, "");
  // Accept: @scope/name, @scope/name@version
  if (!raw.startsWith("@") || raw === "@") {
    throw new Error(
      `Invalid jsr specifier: ${specifier}. Expected format: jsr:@scope/name[@version]`,
    );
  }
  return {
    specifier,
    providerName: "jsr",
    stripComponents: 1,
  };
};

const fetchJsr = (_parsed: ParsedSpec): Promise<ReadableStream<Uint8Array>> => {
  throw new Error(
    "jsr: provider not yet implemented. Use gh:owner/repo or wait for JSR support. " +
      "Track at https://github.com/eser/stack/issues?q=label:kit-jsr",
  );
};

export const provider: Provider = Object.freeze({
  name: "jsr",
  parse: parseJsr,
  fetch: fetchJsr,
});
