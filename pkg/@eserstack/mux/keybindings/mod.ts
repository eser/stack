// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Keybinding/mode registry for the multiplexer.
 *
 * @module
 */

export type { InputMode, KeyChord } from "./modes.ts";
export { parseChord } from "./modes.ts";
export type { Keymap, KeymapTable } from "./registry.ts";
export { buildKeymap, lookup, mergeOverrides } from "./registry.ts";
export { defaultKeymap } from "./defaults.ts";
