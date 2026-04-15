// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * @eserstack/laroux-runtime — Application runtime for laroux.js framework.
 *
 * Extends AppRuntime with manifest loading, base URL management,
 * and development mode support.
 *
 * @module
 */

import * as primitives from "./primitives.ts";
export {
  createLarouxRuntimeState,
  type LarouxExportedSymbol,
  type LarouxManifest,
  LarouxRuntime,
  type LarouxRuntimeOptions,
  type LarouxRuntimeState,
} from "./primitives.ts";

/**
 * Creates a new LarouxRuntime instance.
 */
export const createRuntime = (): primitives.LarouxRuntime => {
  return new primitives.LarouxRuntime();
};
