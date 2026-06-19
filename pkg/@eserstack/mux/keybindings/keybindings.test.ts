// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { assertEquals } from "@std/assert";
import type { KeypressEvent } from "@eserstack/shell/tui";
import { defaultKeymap } from "./defaults.ts";
import { parseChord } from "./modes.ts";
import { buildKeymap, lookup, mergeOverrides } from "./registry.ts";

const key = (over: Partial<KeypressEvent>): KeypressEvent => ({
  name: "a",
  ctrl: false,
  meta: false,
  shift: false,
  raw: new Uint8Array(),
  ...over,
});

Deno.test("parseChord encodes modifiers canonically", () => {
  assertEquals(parseChord(key({ name: "p", ctrl: true })), "ctrl+p");
  assertEquals(parseChord(key({ name: "left", meta: true })), "alt+left");
  assertEquals(parseChord(key({ name: "tab", shift: true })), "shift+tab");
  assertEquals(parseChord(key({ name: "A", shift: true })), "a"); // case carries shift
  assertEquals(parseChord(key({ name: "3" })), "3");
});

Deno.test("default normal-mode reserved keys map to mode switches", () => {
  assertEquals(lookup(defaultKeymap, "normal", "ctrl+p"), [
    { type: "switchMode", mode: "pane" },
  ]);
  assertEquals(lookup(defaultKeymap, "normal", "ctrl+q"), [{ type: "quit" }]);
});

Deno.test("default pane-mode split returns to normal afterwards", () => {
  assertEquals(lookup(defaultKeymap, "pane", "v"), [
    { type: "splitPane", direction: "vertical" },
    { type: "switchMode", mode: "normal" },
  ]);
});

Deno.test("locked mode only binds ctrl+g (everything else passes through)", () => {
  assertEquals(lookup(defaultKeymap, "locked", "ctrl+g"), [
    { type: "switchMode", mode: "normal" },
  ]);
  assertEquals(lookup(defaultKeymap, "locked", "ctrl+p"), undefined);
  assertEquals(lookup(defaultKeymap, "locked", "a"), undefined);
});

Deno.test("mergeOverrides replaces a binding without dropping the rest", () => {
  const overridden = mergeOverrides(defaultKeymap, {
    normal: { "ctrl+q": { type: "detach" } },
  });

  assertEquals(lookup(overridden, "normal", "ctrl+q"), [{ type: "detach" }]);
  // untouched binding still present
  assertEquals(lookup(overridden, "normal", "ctrl+p"), [
    { type: "switchMode", mode: "pane" },
  ]);
});

Deno.test("buildKeymap accepts single actions and lists", () => {
  const km = buildKeymap({
    normal: {
      a: { type: "quit" },
      b: [{ type: "focusNext" }, { type: "switchMode", mode: "normal" }],
    },
  });

  assertEquals(lookup(km, "normal", "a"), [{ type: "quit" }]);
  assertEquals(lookup(km, "normal", "b")?.length, 2);
});
