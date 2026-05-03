// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Provider resolution — pure lazy dispatch, no module-level side effects.
 *
 * @module
 */

import * as github from "./github.ts";
import * as npm from "./npm.ts";
import * as jsr from "./jsr.ts";
import type { Provider } from "./types.ts";

export const resolveProvider = (specifier: string): Provider => {
  if (specifier.startsWith("npm:")) return npm.provider;
  if (specifier.startsWith("jsr:")) return jsr.provider;
  if (specifier.startsWith("gh:") || specifier.startsWith("github:")) {
    return github.provider;
  }
  // Bare owner/repo → github (existing convention)
  if (/^[\w-]+\/[\w.-]+/.test(specifier)) return github.provider;
  throw new Error(`Unknown specifier scheme: ${specifier}`);
};

export type { ParsedSpec, Provider } from "./types.ts";
