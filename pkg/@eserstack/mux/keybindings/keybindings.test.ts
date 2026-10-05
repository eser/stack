// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import type { KeypressEvent } from "@eserstack/shell/tui";
import * as defaults from "./defaults.ts";
import * as modes from "./modes.ts";
import * as registry from "./registry.ts";

const key = (over: Partial<KeypressEvent>): KeypressEvent => ({
  name: "a",
  ctrl: false,
  meta: false,
  shift: false,
  raw: new Uint8Array(),
  ...over,
});

Deno.test("parseChord encodes modifiers canonically", () => {
  assert.assertEquals(
    modes.parseChord(key({ name: "p", ctrl: true })),
    "ctrl+p",
  );
  assert.assertEquals(
    modes.parseChord(key({ name: "left", meta: true })),
    "alt+left",
  );
  assert.assertEquals(
    modes.parseChord(key({ name: "tab", shift: true })),
    "shift+tab",
  );
  assert.assertEquals(modes.parseChord(key({ name: "A", shift: true })), "a"); // case carries shift
  assert.assertEquals(modes.parseChord(key({ name: "3" })), "3");
});

Deno.test("default normal-mode reserved keys map to mode switches", () => {
  assert.assertEquals(
    registry.lookup(defaults.defaultKeymap, "normal", "ctrl+p"),
    [
      { type: "switchMode", mode: "pane" },
    ],
  );
  assert.assertEquals(
    registry.lookup(defaults.defaultKeymap, "normal", "ctrl+q"),
    [{ type: "quit" }],
  );
});

Deno.test("default pane-mode split returns to normal afterwards", () => {
  assert.assertEquals(registry.lookup(defaults.defaultKeymap, "pane", "v"), [
    { type: "splitPane", direction: "vertical" },
    { type: "switchMode", mode: "normal" },
  ]);
});

Deno.test("locked mode only binds ctrl+g (everything else passes through)", () => {
  assert.assertEquals(
    registry.lookup(defaults.defaultKeymap, "locked", "ctrl+g"),
    [
      { type: "switchMode", mode: "normal" },
    ],
  );
  assert.assertEquals(
    registry.lookup(defaults.defaultKeymap, "locked", "ctrl+p"),
    undefined,
  );
  assert.assertEquals(
    registry.lookup(defaults.defaultKeymap, "locked", "a"),
    undefined,
  );
});

Deno.test("mergeOverrides replaces a binding without dropping the rest", () => {
  const overridden = registry.mergeOverrides(defaults.defaultKeymap, {
    normal: { "ctrl+q": { type: "detach" } },
  });

  assert.assertEquals(registry.lookup(overridden, "normal", "ctrl+q"), [{
    type: "detach",
  }]);
  // untouched binding still present
  assert.assertEquals(registry.lookup(overridden, "normal", "ctrl+p"), [
    { type: "switchMode", mode: "pane" },
  ]);
});

Deno.test("buildKeymap accepts single actions and lists", () => {
  const km = registry.buildKeymap({
    normal: {
      a: { type: "quit" },
      b: [{ type: "focusNext" }, { type: "switchMode", mode: "normal" }],
    },
  });

  assert.assertEquals(registry.lookup(km, "normal", "a"), [{ type: "quit" }]);
  assert.assertEquals(registry.lookup(km, "normal", "b")?.length, 2);
});
