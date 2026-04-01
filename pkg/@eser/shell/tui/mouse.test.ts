// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import * as mouse from "./mouse.ts";

describe("parseMouseEvent", () => {
  it("parses left mousedown", () => {
    const ev = mouse.parseMouseEvent("\x1b[<0;10;5M");
    assertEquals(ev !== null, true);
    assertEquals(ev!.type, "mousedown");
    assertEquals(ev!.button, 0);
    assertEquals(ev!.x, 9);
    assertEquals(ev!.y, 4);
  });

  it("parses left mouseup", () => {
    const ev = mouse.parseMouseEvent("\x1b[<0;10;5m");
    assertEquals(ev !== null, true);
    assertEquals(ev!.type, "mouseup");
    assertEquals(ev!.button, 0);
    assertEquals(ev!.x, 9);
    assertEquals(ev!.y, 4);
  });

  it("parses right click (button 2)", () => {
    const ev = mouse.parseMouseEvent("\x1b[<2;1;1M");
    assertEquals(ev !== null, true);
    assertEquals(ev!.type, "mousedown");
    assertEquals(ev!.button, 2);
  });

  it("parses mousemove (code & 32)", () => {
    const ev = mouse.parseMouseEvent("\x1b[<32;15;20M");
    assertEquals(ev !== null, true);
    assertEquals(ev!.type, "mousemove");
    assertEquals(ev!.x, 14);
    assertEquals(ev!.y, 19);
  });

  it("parses wheel up (code & 64)", () => {
    const ev = mouse.parseMouseEvent("\x1b[<64;5;5M");
    assertEquals(ev !== null, true);
    assertEquals(ev!.type, "wheel");
    assertEquals(ev!.direction, "up");
  });

  it("parses wheel down (code 65)", () => {
    const ev = mouse.parseMouseEvent("\x1b[<65;5;5M");
    assertEquals(ev !== null, true);
    assertEquals(ev!.type, "wheel");
    assertEquals(ev!.direction, "down");
  });

  it("parses shift modifier (code & 4)", () => {
    const ev = mouse.parseMouseEvent("\x1b[<4;10;5M");
    assertEquals(ev !== null, true);
    assertEquals(ev!.shift, true);
    assertEquals(ev!.ctrl, false);
  });

  it("parses ctrl modifier (code & 16)", () => {
    const ev = mouse.parseMouseEvent("\x1b[<16;10;5M");
    assertEquals(ev !== null, true);
    assertEquals(ev!.ctrl, true);
    assertEquals(ev!.shift, false);
  });

  it("returns null for invalid input", () => {
    assertEquals(mouse.parseMouseEvent("hello"), null);
    assertEquals(mouse.parseMouseEvent("\x1b[31m"), null);
    assertEquals(mouse.parseMouseEvent(""), null);
  });
});

describe("enableMouse / disableMouse", () => {
  it("enableMouse contains ?1000h, ?1002h, ?1006h", () => {
    const seq = mouse.enableMouse();
    assertEquals(seq.includes("?1000h"), true);
    assertEquals(seq.includes("?1002h"), true);
    assertEquals(seq.includes("?1006h"), true);
  });

  it("disableMouse contains ?1000l, ?1002l, ?1006l", () => {
    const seq = mouse.disableMouse();
    assertEquals(seq.includes("?1000l"), true);
    assertEquals(seq.includes("?1002l"), true);
    assertEquals(seq.includes("?1006l"), true);
  });
});

describe("isSGRMouseSequence", () => {
  it("detects SGR mouse start bytes", () => {
    assertEquals(
      mouse.isSGRMouseSequence(new Uint8Array([0x1b, 0x5b, 0x3c, 0x30])),
      true,
    );
  });

  it("rejects non-mouse sequences", () => {
    assertEquals(
      mouse.isSGRMouseSequence(new Uint8Array([0x1b, 0x5b, 0x41])),
      false,
    );
  });
});
