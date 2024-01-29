// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as primitives from "./primitives.ts";
export * from "./primitives.ts";

/**
 * Initializes a new Lime instance and sets it as the default instance.
 *
 * @returns {Lime}
 */
export const builder = () => {
  const instance = new primitives.Lime();
  instance.setAsDefaultAppServer();

  return instance;
};
