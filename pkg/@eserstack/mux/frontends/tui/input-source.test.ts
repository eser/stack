// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import type * as tui from "@eserstack/shell/tui";
import * as keybindings from "../../keybindings/mod.ts";
import type { Scene } from "../../scene/scene.ts";
import * as inputSource from "./input-source.ts";

const key = (over: Partial<tui.KeypressEvent>): tui.KeypressEvent => ({
  name: "a",
  ctrl: false,
  meta: false,
  shift: false,
  raw: new Uint8Array(),
  ...over,
});

nodeTest.test("a bound chord dispatches its actions", () => {
  const msgs = inputSource.keyToMessages(
    key({ name: "p", ctrl: true }),
    "normal",
    keybindings.defaultKeymap,
  );
  assert.assertEquals(msgs, [
    { t: "action", action: { type: "switchMode", mode: "pane" } },
  ]);
});

nodeTest.test(
  "an unbound key in normal mode is forwarded raw (passthrough)",
  () => {
    const msgs = inputSource.keyToMessages(
      key({ name: "a", raw: new TextEncoder().encode("a") }),
      "normal",
      keybindings.defaultKeymap,
    );
    assert.assertEquals(msgs, [
      { t: "action", action: { type: "writeInput", data: "a" } },
    ]);
  },
);

nodeTest.test("an unbound key in a command mode is dropped", () => {
  assert.assertEquals(
    inputSource.keyToMessages(
      key({ name: "a" }),
      "pane",
      keybindings.defaultKeymap,
    ),
    [],
  );
});

nodeTest.test("locked mode forwards everything except ctrl+g", () => {
  assert.assertEquals(
    inputSource.keyToMessages(
      key({ name: "p", ctrl: true, raw: new Uint8Array([16]) }),
      "locked",
      keybindings.defaultKeymap,
    ).length,
    1, // passthrough
  );
  assert.assertEquals(
    inputSource.keyToMessages(
      key({ name: "g", ctrl: true }),
      "locked",
      keybindings.defaultKeymap,
    ),
    [{ t: "action", action: { type: "switchMode", mode: "normal" } }],
  );
});

nodeTest.test("a mouse click focuses the pane under the cursor", () => {
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

  assert.assertEquals(inputSource.mouseToMessages(ev, scene), [
    { t: "action", action: { type: "focusPane", pane: "pane-2" } },
  ]);
});
