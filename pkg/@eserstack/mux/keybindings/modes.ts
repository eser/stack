// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Input modes and key-chord parsing.
 *
 * A {@link KeyChord} is a canonical string like `"ctrl+p"`, `"alt+left"`,
 * `"shift+tab"`, `"n"`, or `"enter"` — produced from a {@link KeypressEvent} so
 * the registry can look bindings up by a stable key.
 *
 * @module
 */

import type { KeypressEvent } from "@eserstack/shell/tui";

export type { InputMode } from "../engine/types.ts";

/** Canonical, registry-friendly representation of a key + modifiers. */
export type KeyChord = string;

/**
 * Build the canonical chord for a key event. Letter case is normalised to lower
 * (shift is carried by the case for printable keys, and added as an explicit
 * `shift+` modifier only for named keys like arrows/tab).
 */
export const parseChord = (ev: KeypressEvent): KeyChord => {
  const parts: string[] = [];
  if (ev.ctrl) parts.push("ctrl");
  if (ev.meta) parts.push("alt");

  const isPrintable = ev.name.length === 1;
  if (ev.shift && !isPrintable) parts.push("shift");

  parts.push(isPrintable ? ev.name.toLowerCase() : ev.name);

  return parts.join("+");
};
