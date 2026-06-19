// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Keybinding registry: a `Mode -> (Chord -> Action[])` lookup table.
 *
 * Tables are authored as plain objects ({@link KeymapTable}) and compiled into
 * nested maps for O(1) lookup. User overrides merge on top of the defaults.
 *
 * @module
 */

import type { Action, InputMode } from "../engine/types.ts";
import type { KeyChord } from "./modes.ts";

/** Compiled, immutable keymap. */
export type Keymap = ReadonlyMap<
  InputMode,
  ReadonlyMap<KeyChord, readonly Action[]>
>;

/** Authoring shape: a single action or a list per chord, per mode. */
export type KeymapTable = Partial<
  Record<InputMode, Record<KeyChord, Action | readonly Action[]>>
>;

const toList = (v: Action | readonly Action[]): readonly Action[] =>
  Array.isArray(v) ? v : [v as Action];

/** Compile an authoring table into a {@link Keymap}. */
export const buildKeymap = (table: KeymapTable): Keymap => {
  const map = new Map<InputMode, Map<KeyChord, readonly Action[]>>();

  for (const mode of Object.keys(table) as InputMode[]) {
    const chords = table[mode];
    if (chords === undefined) continue;

    const inner = new Map<KeyChord, readonly Action[]>();
    for (const chord of Object.keys(chords)) {
      inner.set(chord, toList(chords[chord]!));
    }
    map.set(mode, inner);
  }

  return map;
};

/** Look up the actions bound to a chord in a mode, or `undefined` if unbound. */
export const lookup = (
  km: Keymap,
  mode: InputMode,
  chord: KeyChord,
): readonly Action[] | undefined => km.get(mode)?.get(chord);

/** Merge user overrides over a base keymap (per mode, per chord). */
export const mergeOverrides = (
  base: Keymap,
  overrides: KeymapTable,
): Keymap => {
  const merged = new Map<InputMode, Map<KeyChord, readonly Action[]>>();

  for (const [mode, chords] of base) {
    merged.set(mode, new Map(chords));
  }

  for (const mode of Object.keys(overrides) as InputMode[]) {
    const chords = overrides[mode];
    if (chords === undefined) continue;

    const inner = merged.get(mode) ?? new Map<KeyChord, readonly Action[]>();
    for (const chord of Object.keys(chords)) {
      inner.set(chord, toList(chords[chord]!));
    }
    merged.set(mode, inner);
  }

  return merged;
};
