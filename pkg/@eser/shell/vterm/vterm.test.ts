// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import { AnsiParser } from "./parser.ts";
import { Cursor } from "./cursor.ts";
import { ScreenBuffer } from "./screen.ts";
import { defaultStyle, parseSGR } from "./sgr.ts";
import { VTerminal } from "./terminal.ts";
import { renderScreen } from "./renderer.ts";

// =============================================================================
// Parser
// =============================================================================

describe("AnsiParser", () => {
  it("parses plain text", () => {
    const parser = new AnsiParser();
    const result = parser.feed("hello");
    assertEquals(result.length, 1);
    assertEquals(result[0]!.type, "text");
    if (result[0]!.type === "text") assertEquals(result[0]!.text, "hello");
  });

  it("parses CSI SGR \\x1b[31m", () => {
    const parser = new AnsiParser();
    const result = parser.feed("\x1b[31m");
    assertEquals(result.length, 1);
    assertEquals(result[0]!.type, "csi");
    if (result[0]!.type === "csi") {
      assertEquals(result[0]!.command, "m");
      assertEquals(result[0]!.params, [31]);
    }
  });

  it("parses CSI clear \\x1b[2J", () => {
    const parser = new AnsiParser();
    const result = parser.feed("\x1b[2J");
    assertEquals(result.length, 1);
    if (result[0]!.type === "csi") {
      assertEquals(result[0]!.command, "J");
      assertEquals(result[0]!.params, [2]);
    }
  });

  it("handles partial sequence across feeds", () => {
    const parser = new AnsiParser();
    const r1 = parser.feed("\x1b[");
    assertEquals(r1.length, 0); // buffered

    const r2 = parser.feed("31m");
    assertEquals(r2.length, 1);
    if (r2[0]!.type === "csi") {
      assertEquals(r2[0]!.command, "m");
      assertEquals(r2[0]!.params, [31]);
    }
  });

  it("parses control characters \\r\\n", () => {
    const parser = new AnsiParser();
    const result = parser.feed("\r\n");
    assertEquals(result.length, 2);
    assertEquals(result[0]!.type, "control");
    assertEquals(result[1]!.type, "control");
    if (result[0]!.type === "control") assertEquals(result[0]!.code, 0x0d);
    if (result[1]!.type === "control") assertEquals(result[1]!.code, 0x0a);
  });

  it("parses private mode \\x1b[?25l", () => {
    const parser = new AnsiParser();
    const result = parser.feed("\x1b[?25l");
    assertEquals(result.length, 1);
    if (result[0]!.type === "csi") {
      assertEquals(result[0]!.command, "?l");
      assertEquals(result[0]!.params, [25]);
    }
  });
});

// =============================================================================
// SGR
// =============================================================================

describe("parseSGR", () => {
  it("[0] resets all", () => {
    const style = parseSGR([0], { ...defaultStyle(), bold: true, fg: 1 });
    assertEquals(style.bold, false);
    assertEquals(style.fg, -1);
  });

  it("[31] sets fg red", () => {
    const style = parseSGR([31], defaultStyle());
    assertEquals(style.fg, 1);
  });

  it("[38, 5, 196] sets 256-color fg", () => {
    const style = parseSGR([38, 5, 196], defaultStyle());
    assertEquals(style.fg, 196);
  });

  it("[1, 33] sets bold + fg yellow", () => {
    const style = parseSGR([1, 33], defaultStyle());
    assertEquals(style.bold, true);
    assertEquals(style.fg, 3);
  });

  it("[7] sets inverse", () => {
    const style = parseSGR([7], defaultStyle());
    assertEquals(style.inverse, true);
  });
});

// =============================================================================
// Cursor
// =============================================================================

describe("Cursor", () => {
  it("moveTo sets position", () => {
    const c = new Cursor();
    c.moveTo(5, 10);
    assertEquals(c.row, 5);
    assertEquals(c.col, 10);
  });

  it("moveUp respects bounds", () => {
    const c = new Cursor();
    c.moveUp(5);
    assertEquals(c.row, 0);
  });

  it("clamp constrains to bounds", () => {
    const c = new Cursor();
    c.moveTo(100, 200);
    c.clamp(24, 80);
    assertEquals(c.row, 23);
    assertEquals(c.col, 79);
  });

  it("save and restore", () => {
    const c = new Cursor();
    c.moveTo(5, 10);
    c.save();
    c.moveTo(0, 0);
    c.restore();
    assertEquals(c.row, 5);
    assertEquals(c.col, 10);
  });
});

// =============================================================================
// ScreenBuffer
// =============================================================================

describe("ScreenBuffer", () => {
  it("writeChar via setCell", () => {
    const s = new ScreenBuffer(24, 80);
    s.setCell(0, 0, defaultStyle(), "H");
    assertEquals(s.getCell(0, 0).char, "H");
  });

  it("clearLine mode 2 clears whole line", () => {
    const s = new ScreenBuffer(24, 80);
    s.setCell(0, 0, defaultStyle(), "X");
    s.clearLine(0, 2);
    assertEquals(s.getCell(0, 0).char, " ");
  });

  it("clearDisplay mode 2 clears everything", () => {
    const s = new ScreenBuffer(24, 80);
    s.setCell(5, 5, defaultStyle(), "X");
    s.clearDisplay(2, 0, 0);
    assertEquals(s.getCell(5, 5).char, " ");
  });

  it("scrollUp moves lines up, blank at bottom", () => {
    const s = new ScreenBuffer(5, 10);
    s.setCell(0, 0, defaultStyle(), "A");
    s.setCell(1, 0, defaultStyle(), "B");
    s.scrollUp();
    assertEquals(s.getCell(0, 0).char, "B");
    assertEquals(s.getCell(4, 0).char, " ");
  });

  it("alternate screen preserves main", () => {
    const s = new ScreenBuffer(5, 10);
    s.setCell(0, 0, defaultStyle(), "M");
    s.enterAlternateScreen();
    assertEquals(s.getCell(0, 0).char, " "); // alt is clean
    s.setCell(0, 0, defaultStyle(), "A");
    s.exitAlternateScreen();
    assertEquals(s.getCell(0, 0).char, "M"); // main restored
  });
});

// =============================================================================
// VTerminal (integration)
// =============================================================================

describe("VTerminal", () => {
  it("write 'hello' places chars at row 0", () => {
    const vt = new VTerminal(24, 80);
    vt.write("hello");
    const s = vt.getScreen();
    assertEquals(s.getCell(0, 0).char, "h");
    assertEquals(s.getCell(0, 4).char, "o");
  });

  it("write red text sets fg=1", () => {
    const vt = new VTerminal(24, 80);
    vt.write("\x1b[31mred\x1b[0m");
    assertEquals(vt.getScreen().getCell(0, 0).fg, 1);
    assertEquals(vt.getScreen().getCell(0, 0).char, "r");
  });

  it("\\x1b[2J clears screen", () => {
    const vt = new VTerminal(24, 80);
    vt.write("hello");
    vt.write("\x1b[2J");
    assertEquals(vt.getScreen().getCell(0, 0).char, " ");
  });

  it("\\x1b[10;5H positions cursor", () => {
    const vt = new VTerminal(24, 80);
    vt.write("\x1b[10;5H");
    assertEquals(vt.getCursor().row, 9);
    assertEquals(vt.getCursor().col, 4);
  });

  it("\\x1b[?1049h enters alternate screen", () => {
    const vt = new VTerminal(24, 80);
    vt.write("main");
    vt.write("\x1b[?1049h");
    assertEquals(vt.getScreen().getCell(0, 0).char, " ");
    vt.write("\x1b[?1049l");
    assertEquals(vt.getScreen().getCell(0, 0).char, "m");
  });

  it("\\r\\n moves cursor correctly", () => {
    const vt = new VTerminal(24, 80);
    vt.write("line1\r\nline2");
    assertEquals(vt.getScreen().getCell(0, 0).char, "l");
    assertEquals(vt.getScreen().getCell(1, 0).char, "l");
    assertEquals(vt.getCursor().row, 1);
    assertEquals(vt.getCursor().col, 5);
  });
});

// =============================================================================
// Renderer
// =============================================================================

describe("renderScreen", () => {
  it("renders at offset with moveTo sequences", () => {
    const vt = new VTerminal(5, 10);
    vt.write("Hi");
    const output = renderScreen(vt.getScreen(), vt.getCursor(), {
      offsetRow: 5,
      offsetCol: 10,
      width: 10,
      height: 5,
      fullRedraw: true,
    });
    assertEquals(output.includes("\x1b[5;10H"), true);
    assertEquals(output.includes("H"), true);
    assertEquals(output.includes("i"), true);
  });

  it("includes color codes for styled cells", () => {
    const vt = new VTerminal(5, 10);
    vt.write("\x1b[31mR\x1b[0m");
    const output = renderScreen(vt.getScreen(), vt.getCursor(), {
      offsetRow: 1,
      offsetCol: 1,
      width: 10,
      height: 5,
      fullRedraw: true,
    });
    // Should contain fg red code (31)
    assertEquals(output.includes("31"), true);
    assertEquals(output.includes("R"), true);
  });

  it("default bg (-1) emits no background SGR codes", () => {
    const vt = new VTerminal(1, 10);
    vt.write("Hello");
    const output = renderScreen(vt.getScreen(), vt.getCursor(), {
      offsetRow: 1,
      offsetCol: 1,
      width: 10,
      height: 1,
      fullRedraw: true,
    });
    // No explicit black bg (40) or default bg (49) in output
    assertEquals(output.includes("\x1b[40m"), false);
    assertEquals(output.includes(";40;"), false);
    assertEquals(output.includes(";49;"), false);
    assertEquals(output.includes(";49m"), false);
  });

  it("explicit black bg (0) is NOT emitted — bg always transparent", () => {
    const vt = new VTerminal(1, 10);
    vt.write("\x1b[40mX\x1b[0m");
    const output = renderScreen(vt.getScreen(), vt.getCursor(), {
      offsetRow: 1,
      offsetCol: 1,
      width: 10,
      height: 1,
      fullRedraw: true,
    });
    // No background code emitted — renderer strips all bg
    assertEquals(output.includes("\x1b[40m"), false);
    assertEquals(output.includes(";40;"), false);
  });

  it("SGR reset sets bg to -1, not 0", () => {
    const style = parseSGR([31, 42], defaultStyle()); // red fg, green bg
    const reset = parseSGR([0], style);
    assertEquals(reset.bg, -1);
    assertEquals(reset.fg, -1);
  });

  it("transition from fg-styled to default emits reset", () => {
    const vt = new VTerminal(1, 10);
    vt.write("\x1b[31mR\x1b[0m N"); // red FG 'R', then reset, then 'N'
    const output = renderScreen(vt.getScreen(), vt.getCursor(), {
      offsetRow: 1,
      offsetCol: 1,
      width: 10,
      height: 1,
      fullRedraw: true,
    });
    assertEquals(output.includes("\x1b[0m"), true); // reset between styled and default
  });

  it("new lines from scrollUp have bg=-1", () => {
    const vt = new VTerminal(3, 10);
    vt.getScreen().scrollUp(1);
    const cell = vt.getScreen().getCell(2, 0);
    assertEquals(cell.bg, -1);
  });

  it("clearDisplay creates cells with bg=-1", () => {
    const vt = new VTerminal(3, 10);
    vt.write("\x1b[42mX"); // green bg
    vt.write("\x1b[2J"); // clear screen
    const cell = vt.getScreen().getCell(0, 0);
    assertEquals(cell.bg, -1);
  });
});
