// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Default keybindings, modelled on conventions from established terminal
 * multiplexers. Everything here is overridable via {@link mergeOverrides}.
 *
 * Reserved keys in `normal` mode are intercepted; every other key falls through
 * to the focused terminal (the raw-passthrough rule lives in the frontend). In
 * `locked` mode ONLY `ctrl+g` is intercepted, so full-screen TUI apps get every
 * key untouched.
 *
 * @module
 */

import type { Action } from "../engine/types.ts";
import { buildKeymap, type Keymap, type KeymapTable } from "./registry.ts";

const toNormal: Action = { type: "switchMode", mode: "normal" };

const DEFAULT_TABLE: KeymapTable = {
  normal: {
    "ctrl+p": { type: "switchMode", mode: "pane" },
    "ctrl+t": { type: "switchMode", mode: "tab" },
    "ctrl+n": { type: "switchMode", mode: "resize" },
    "ctrl+s": { type: "switchMode", mode: "scroll" },
    "ctrl+g": { type: "switchMode", mode: "locked" },
    "ctrl+o": { type: "detach" },
    "ctrl+q": { type: "quit" },
  },

  pane: {
    n: [{ type: "newPane" }, toNormal],
    v: [{ type: "splitPane", direction: "vertical" }, toNormal],
    s: [{ type: "splitPane", direction: "horizontal" }, toNormal],
    x: [{ type: "closeFocusedPane" }, toNormal],
    f: [{ type: "toggleFullscreen" }, toNormal],
    z: [{ type: "toggleFullscreen" }, toNormal],
    left: { type: "focusDirection", direction: "left" },
    right: { type: "focusDirection", direction: "right" },
    up: { type: "focusDirection", direction: "up" },
    down: { type: "focusDirection", direction: "down" },
    h: { type: "focusDirection", direction: "left" },
    l: { type: "focusDirection", direction: "right" },
    k: { type: "focusDirection", direction: "up" },
    j: { type: "focusDirection", direction: "down" },
    enter: toNormal,
    escape: toNormal,
  },

  tab: {
    n: [{ type: "newTab" }, toNormal],
    x: [{ type: "closeTab" }, toNormal],
    left: { type: "prevTab" },
    h: { type: "prevTab" },
    right: { type: "nextTab" },
    l: { type: "nextTab" },
    "1": { type: "gotoTab", index: 0 },
    "2": { type: "gotoTab", index: 1 },
    "3": { type: "gotoTab", index: 2 },
    "4": { type: "gotoTab", index: 3 },
    "5": { type: "gotoTab", index: 4 },
    "6": { type: "gotoTab", index: 5 },
    "7": { type: "gotoTab", index: 6 },
    "8": { type: "gotoTab", index: 7 },
    "9": { type: "gotoTab", index: 8 },
    enter: toNormal,
    escape: toNormal,
  },

  resize: {
    left: { type: "resizePane", direction: "left" },
    right: { type: "resizePane", direction: "right" },
    up: { type: "resizePane", direction: "up" },
    down: { type: "resizePane", direction: "down" },
    h: { type: "resizePane", direction: "left" },
    l: { type: "resizePane", direction: "right" },
    k: { type: "resizePane", direction: "up" },
    j: { type: "resizePane", direction: "down" },
    enter: toNormal,
    escape: toNormal,
  },

  scroll: {
    up: { type: "scroll", action: "up" },
    down: { type: "scroll", action: "down" },
    k: { type: "scroll", action: "up" },
    j: { type: "scroll", action: "down" },
    pageup: { type: "scroll", action: "pageUp" },
    pagedown: { type: "scroll", action: "pageDown" },
    g: { type: "scroll", action: "home" },
    "shift+g": { type: "scroll", action: "end" },
    enter: toNormal,
    escape: toNormal,
  },

  locked: {
    "ctrl+g": toNormal,
  },
};

/** The compiled default keymap. */
export const defaultKeymap: Keymap = buildKeymap(DEFAULT_TABLE);
