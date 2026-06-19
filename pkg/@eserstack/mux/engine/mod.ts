// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Pure multiplexer engine: data model, split-tree ops, geometry, and the
 * action reducer. No I/O — the server interprets the emitted effects.
 *
 * @module
 */

export * from "./types.ts";
export * from "./effects.ts";
export * as tree from "./split-tree.ts";
export * as geometry from "./geometry.ts";
export { createInitialState, reduce } from "./reducer.ts";
