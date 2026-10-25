// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "@std/testing/bdd";
import * as assert from "@eserstack/test-kit/assert";
import * as mouse from "./mouse.ts";

bdd.describe("parseMouseEvent", () => {
  bdd.it("parses left mousedown", () => {
    const ev = mouse.parseMouseEvent("\x1b[<0;10;5M");
    assert.assertEquals(ev !== null, true);
    assert.assertEquals(ev!.type, "mousedown");
    assert.assertEquals(ev!.button, 0);
    assert.assertEquals(ev!.x, 9);
    assert.assertEquals(ev!.y, 4);
  });

  bdd.it("parses left mouseup", () => {
    const ev = mouse.parseMouseEvent("\x1b[<0;10;5m");
    assert.assertEquals(ev !== null, true);
    assert.assertEquals(ev!.type, "mouseup");
    assert.assertEquals(ev!.button, 0);
    assert.assertEquals(ev!.x, 9);
    assert.assertEquals(ev!.y, 4);
  });

  bdd.it("parses right click (button 2)", () => {
    const ev = mouse.parseMouseEvent("\x1b[<2;1;1M");
    assert.assertEquals(ev !== null, true);
    assert.assertEquals(ev!.type, "mousedown");
    assert.assertEquals(ev!.button, 2);
  });

  bdd.it("parses mousemove (code & 32)", () => {
    const ev = mouse.parseMouseEvent("\x1b[<32;15;20M");
    assert.assertEquals(ev !== null, true);
    assert.assertEquals(ev!.type, "mousemove");
    assert.assertEquals(ev!.x, 14);
    assert.assertEquals(ev!.y, 19);
  });

  bdd.it("parses wheel up (code & 64)", () => {
    const ev = mouse.parseMouseEvent("\x1b[<64;5;5M");
    assert.assertEquals(ev !== null, true);
    assert.assertEquals(ev!.type, "wheel");
    assert.assertEquals(ev!.direction, "up");
  });

  bdd.it("parses wheel down (code 65)", () => {
    const ev = mouse.parseMouseEvent("\x1b[<65;5;5M");
    assert.assertEquals(ev !== null, true);
    assert.assertEquals(ev!.type, "wheel");
    assert.assertEquals(ev!.direction, "down");
  });

  bdd.it("parses shift modifier (code & 4)", () => {
    const ev = mouse.parseMouseEvent("\x1b[<4;10;5M");
    assert.assertEquals(ev !== null, true);
    assert.assertEquals(ev!.shift, true);
    assert.assertEquals(ev!.ctrl, false);
  });

  bdd.it("parses ctrl modifier (code & 16)", () => {
    const ev = mouse.parseMouseEvent("\x1b[<16;10;5M");
    assert.assertEquals(ev !== null, true);
    assert.assertEquals(ev!.ctrl, true);
    assert.assertEquals(ev!.shift, false);
  });

  bdd.it("returns null for invalid input", () => {
    assert.assertEquals(mouse.parseMouseEvent("hello"), null);
    assert.assertEquals(mouse.parseMouseEvent("\x1b[31m"), null);
    assert.assertEquals(mouse.parseMouseEvent(""), null);
  });
});

bdd.describe("enableMouse / disableMouse", () => {
  bdd.it("enableMouse contains ?1000h, ?1002h, ?1006h", () => {
    const seq = mouse.enableMouse();
    assert.assertEquals(seq.includes("?1000h"), true);
    assert.assertEquals(seq.includes("?1002h"), true);
    assert.assertEquals(seq.includes("?1006h"), true);
  });

  bdd.it("disableMouse contains ?1000l, ?1002l, ?1006l", () => {
    const seq = mouse.disableMouse();
    assert.assertEquals(seq.includes("?1000l"), true);
    assert.assertEquals(seq.includes("?1002l"), true);
    assert.assertEquals(seq.includes("?1006l"), true);
  });
});

bdd.describe("isSGRMouseSequence", () => {
  bdd.it("detects SGR mouse start bytes", () => {
    assert.assertEquals(
      mouse.isSGRMouseSequence(new Uint8Array([0x1b, 0x5b, 0x3c, 0x30])),
      true,
    );
  });

  bdd.it("rejects non-mouse sequences", () => {
    assert.assertEquals(
      mouse.isSGRMouseSequence(new Uint8Array([0x1b, 0x5b, 0x41])),
      false,
    );
  });
});
