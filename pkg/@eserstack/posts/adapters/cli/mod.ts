// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/** CLI adapter barrel. */

export {
  outputError,
  outputPost,
  outputPosts,
  outputSuccess,
} from "./output.ts";
export { createAppContext } from "./wiring.ts";
export type { AppContext } from "./wiring.ts";
export * as commands from "./commands/mod.ts";
