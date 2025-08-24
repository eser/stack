// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as primitives from "./primitives.ts";
export * from "./primitives.ts";
export * from "./registry.ts";
export * from "./router.ts";
export * from "./adapters/registry.ts";
export * from "./server-actions.ts";
export * from "./islands.ts";

/**
 * Initializes a new Lime instance and sets it as the default instance.
 *
 * @returns {Lime}
 */
export const builder = (): primitives.Lime => {
  const instance = new primitives.Lime();
  // instance.setAsDefault();

  return instance;
};
