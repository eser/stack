// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Pure mapping from raw terminal input to {@link FrontendToServer} messages.
 *
 * Keeping this pure makes the keybinding/passthrough rules unit-testable without
 * a real terminal. The frontend runs the actual `readInput` loop and calls these.
 *
 * @module
 */

import type * as tui from "@eserstack/shell/tui";
import type { InputMode } from "../../engine/types.ts";
import { lookup, parseChord } from "../../keybindings/mod.ts";
import type { Keymap } from "../../keybindings/mod.ts";
import type { FrontendToServer } from "../../ipc/protocol.ts";
import type { Scene } from "../../scene/scene.ts";

const decoder = new TextDecoder();

/**
 * Translate a key event into messages. Bound chords dispatch their actions; an
 * unbound key in `normal`/`locked` mode is forwarded raw to the focused
 * terminal (the passthrough rule). In a command mode, an unbound key is dropped.
 */
export const keyToMessages = (
  key: tui.KeypressEvent,
  mode: InputMode,
  keymap: Keymap,
): FrontendToServer[] => {
  const actions = lookup(keymap, mode, parseChord(key));
  if (actions !== undefined) {
    return actions.map((action) => ({ t: "action", action }));
  }

  if (mode === "normal" || mode === "locked") {
    return [{
      t: "action",
      action: { type: "writeInput", data: decoder.decode(key.raw) },
    }];
  }

  return [];
};

/** Translate a mouse event into messages (click-to-focus for now). */
export const mouseToMessages = (
  ev: tui.mouse.MouseEvent,
  scene: Scene | null,
): FrontendToServer[] => {
  if (scene === null || ev.type !== "mousedown") return [];

  // SGR coords are 1-based; pane boxes start at geom.(x|y)+1.
  for (const pane of scene.panes) {
    const x0 = pane.geom.x + 1;
    const y0 = pane.geom.y + 1;
    if (
      ev.x >= x0 && ev.x < x0 + pane.geom.width &&
      ev.y >= y0 && ev.y < y0 + pane.geom.height
    ) {
      return [{ t: "action", action: { type: "focusPane", pane: pane.id } }];
    }
  }

  return [];
};
