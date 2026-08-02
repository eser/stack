// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { assertEquals } from "@std/assert";
import type * as tui from "@eserstack/shell/tui";
import { defaultKeymap } from "../../keybindings/mod.ts";
import type { Scene } from "../../scene/scene.ts";
import { keyToMessages, mouseToMessages } from "./input-source.ts";

const key = (over: Partial<tui.KeypressEvent>): tui.KeypressEvent => ({
  name: "a",
  ctrl: false,
  meta: false,
  shift: false,
  raw: new Uint8Array(),
  ...over,
});

Deno.test("a bound chord dispatches its actions", () => {
  const msgs = keyToMessages(
    key({ name: "p", ctrl: true }),
    "normal",
    defaultKeymap,
  );
  assertEquals(msgs, [
    { t: "action", action: { type: "switchMode", mode: "pane" } },
  ]);
});

Deno.test("an unbound key in normal mode is forwarded raw (passthrough)", () => {
  const msgs = keyToMessages(
    key({ name: "a", raw: new TextEncoder().encode("a") }),
    "normal",
    defaultKeymap,
  );
  assertEquals(msgs, [
    { t: "action", action: { type: "writeInput", data: "a" } },
  ]);
});

Deno.test("an unbound key in a command mode is dropped", () => {
  assertEquals(keyToMessages(key({ name: "a" }), "pane", defaultKeymap), []);
});

Deno.test("locked mode forwards everything except ctrl+g", () => {
  assertEquals(
    keyToMessages(
      key({ name: "p", ctrl: true, raw: new Uint8Array([16]) }),
      "locked",
      defaultKeymap,
    )
      .length,
    1, // passthrough
  );
  assertEquals(
    keyToMessages(key({ name: "g", ctrl: true }), "locked", defaultKeymap),
    [
      { t: "action", action: { type: "switchMode", mode: "normal" } },
    ],
  );
});

Deno.test("a mouse click focuses the pane under the cursor", () => {
  const scene: Scene = {
    tabs: [{ id: "tab-1", name: "t" }],
    activeTab: 0,
    mode: "normal",
    viewport: { cols: 80, rows: 24 },
    chrome: { tabBarRows: 1, statusBarRows: 1 },
    focusedPane: "pane-1",
    panes: [
      {
        id: "pane-1",
        kind: "terminal",
        title: "a",
        geom: { x: 0, y: 1, width: 40, height: 20 },
        focused: true,
        exited: false,
      },
      {
        id: "pane-2",
        kind: "terminal",
        title: "b",
        geom: { x: 40, y: 1, width: 40, height: 20 },
        focused: false,
        exited: false,
      },
    ],
  };

  const ev: tui.mouse.MouseEvent = {
    type: "mousedown",
    button: 0,
    x: 50,
    y: 5,
    shift: false,
    ctrl: false,
  };

  assertEquals(mouseToMessages(ev, scene), [
    { t: "action", action: { type: "focusPane", pane: "pane-2" } },
  ]);
});
