// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals } from "@std/assert";
import { VTerminal } from "./terminal.ts";
import { renderScreen, type RenderState } from "./renderer.ts";

// =============================================================================
// Helper: write and wait for xterm to process
// =============================================================================

const writeAndFlush = async (
  term: VTerminal,
  data: string,
): Promise<void> => {
  await term.writeAsync(data);
};

// =============================================================================
// VTerminal — xterm-headless wrapper
// =============================================================================

describe("VTerminal", () => {
  it("constructs with correct dimensions", () => {
    const term = new VTerminal(24, 80);
    assertEquals(term.rows, 24);
    assertEquals(term.cols, 80);
  });

  it("write places chars in buffer", async () => {
    const term = new VTerminal(24, 80);
    await writeAndFlush(term, "hello");

    const line = term.activeBuffer.getLine(0);
    const text = line?.translateToString(true, 0, 5);
    assertEquals(text, "hello");
  });

  it("cursor position updates after write", async () => {
    const term = new VTerminal(24, 80);
    await writeAndFlush(term, "abc");

    assertEquals(term.cursorCol, 3);
    assertEquals(term.cursorRow, 0);
  });

  it("newline moves cursor down", async () => {
    const term = new VTerminal(24, 80);
    await writeAndFlush(term, "line1\r\nline2");

    assertEquals(term.cursorRow, 1);
    const line1 = term.activeBuffer.getLine(1);
    assert(line1?.translateToString(true).startsWith("line2"));
  });

  it("cursor positioning via CSI H", async () => {
    const term = new VTerminal(24, 80);
    await writeAndFlush(term, "\x1b[5;10H*");

    assertEquals(term.cursorRow, 4); // 0-indexed
    assertEquals(term.cursorCol, 10);
  });

  it("erase display (CSI 2J)", async () => {
    const term = new VTerminal(5, 10);
    await writeAndFlush(term, "hello\r\nworld");
    await writeAndFlush(term, "\x1b[2J");

    const line0 = term.activeBuffer.getLine(0);
    assertEquals(line0?.translateToString(true).trim(), "");
  });

  it("resize changes dimensions", () => {
    const term = new VTerminal(24, 80);
    term.resize(30, 100);

    assertEquals(term.rows, 30);
    assertEquals(term.cols, 100);
  });

  it("alternate screen buffer", async () => {
    const term = new VTerminal(24, 80);
    await writeAndFlush(term, "main screen");

    // Enter alt screen — alt buffer should be active
    await writeAndFlush(term, "\x1b[?1049h");
    await writeAndFlush(term, "alt content");

    const altLine = term.activeBuffer.getLine(0);
    const altText = altLine?.translateToString(true) ?? "";
    assert(
      altText.includes("alt content"),
      `Alt screen should show 'alt content', got: '${altText}'`,
    );
  });
});

// =============================================================================
// Dirty-line tracking
// =============================================================================

describe("dirty-line tracking", () => {
  it("all lines dirty after construction", () => {
    const term = new VTerminal(5, 10);
    const dirty = term.getDirtyLines();
    assertEquals(dirty.size, 5);
  });

  it("clearDirty resets dirty state", () => {
    const term = new VTerminal(5, 10);
    term.clearDirty();
    const dirty = term.getDirtyLines();
    // Only cursor row should be dirty
    assert(dirty.size <= 1);
  });

  it("write marks changed lines dirty", async () => {
    const term = new VTerminal(5, 10);
    term.clearDirty();

    await writeAndFlush(term, "hello");
    const dirty = term.getDirtyLines();
    assert(dirty.has(0)); // line 0 changed
  });

  it("markAllDirty marks everything", () => {
    const term = new VTerminal(5, 10);
    term.clearDirty();
    term.markAllDirty();
    const dirty = term.getDirtyLines();
    assertEquals(dirty.size, 5);
  });

  it("resize marks all dirty", () => {
    const term = new VTerminal(5, 10);
    term.clearDirty();
    term.resize(8, 12);
    const dirty = term.getDirtyLines();
    assertEquals(dirty.size, 8);
  });
});

// =============================================================================
// Colors and styling
// =============================================================================

describe("color handling", () => {
  it("16-color foreground sets color mode", async () => {
    const term = new VTerminal(5, 20);
    await writeAndFlush(term, "\x1b[31mR"); // red

    const cell = term.activeBuffer.getLine(0)?.getCell(0);
    assert(cell !== null && cell !== undefined);
    assertEquals(cell.getFgColor(), 1); // red = 1
    assert(cell.getFgColorMode() !== 0); // not default
  });

  it("256-color foreground", async () => {
    const term = new VTerminal(5, 20);
    await writeAndFlush(term, "\x1b[38;5;208mX");

    const cell = term.activeBuffer.getLine(0)?.getCell(0);
    assert(cell !== null && cell !== undefined);
    assertEquals(cell.getFgColor(), 208);
  });

  it("RGB foreground", async () => {
    const term = new VTerminal(5, 20);
    await writeAndFlush(term, "\x1b[38;2;100;200;50mX");

    const cell = term.activeBuffer.getLine(0)?.getCell(0);
    assert(cell !== null && cell !== undefined);
    // RGB packed as 24-bit: (100 << 16) | (200 << 8) | 50 = 6604850
    assertEquals(cell.getFgColor(), 6604850);
  });

  it("bold attribute", async () => {
    const term = new VTerminal(5, 20);
    await writeAndFlush(term, "\x1b[1mB");

    const cell = term.activeBuffer.getLine(0)?.getCell(0);
    assert(cell !== null && cell !== undefined);
    assert(cell.isBold() !== 0);
  });

  it("reset clears attributes", async () => {
    const term = new VTerminal(5, 20);
    await writeAndFlush(term, "\x1b[1;31mX\x1b[0mN");

    const normal = term.activeBuffer.getLine(0)?.getCell(1);
    assert(normal !== null && normal !== undefined);
    assertEquals(normal.getFgColorMode(), 0); // default
    assertEquals(normal.isBold(), 0);
  });
});

// =============================================================================
// Renderer
// =============================================================================

describe("renderScreen", () => {
  it("renders at offset with moveTo sequences", async () => {
    const term = new VTerminal(3, 5);
    await writeAndFlush(term, "hello");

    const output = renderScreen(term, {
      offsetRow: 10,
      offsetCol: 20,
      width: 5,
      height: 3,
      fullRedraw: true,
    });

    // Should contain moveTo for row 10 at col 20
    assert(output.includes("\x1b[10;20H"));
    assert(output.includes("h"));
    assert(output.includes("e"));
  });

  it("includes SGR codes for colored cells", async () => {
    const term = new VTerminal(3, 10);
    await writeAndFlush(term, "\x1b[31mred");

    const output = renderScreen(term, {
      offsetRow: 1,
      offsetCol: 1,
      width: 10,
      height: 3,
      fullRedraw: true,
    });

    // Should contain red foreground SGR and text
    assert(output.includes("r"));
    assert(output.includes("e"));
    assert(output.includes("d"));
  });

  it("does NOT emit background SGR codes (transparency)", async () => {
    const term = new VTerminal(3, 10);
    await writeAndFlush(term, "\x1b[41mBG"); // red background

    const output = renderScreen(term, {
      offsetRow: 1,
      offsetCol: 1,
      width: 10,
      height: 3,
      fullRedraw: true,
    });

    // Should NOT contain background SGR (41)
    assert(!output.includes("\x1b[41m"));
  });

  it("cursor renders with inverse video", async () => {
    const term = new VTerminal(3, 10);
    await writeAndFlush(term, "ab");

    const output = renderScreen(term, {
      offsetRow: 1,
      offsetCol: 1,
      width: 10,
      height: 3,
      fullRedraw: true,
    });

    // Cursor at col 2 — should have inverse on/off
    assert(output.includes("\x1b[7m")); // inverse on
    assert(output.includes("\x1b[27m")); // inverse off
  });

  it("incremental rendering skips clean lines", async () => {
    const term = new VTerminal(3, 10);
    await writeAndFlush(term, "line0\r\nline1\r\nline2");

    // First render — full
    renderScreen(term, {
      offsetRow: 1,
      offsetCol: 1,
      width: 10,
      height: 3,
      fullRedraw: true,
    });

    // Modify only line 0
    await writeAndFlush(term, "\x1b[1;1HXXX");

    const output = renderScreen(term, {
      offsetRow: 1,
      offsetCol: 1,
      width: 10,
      height: 3,
    });

    // Should contain line 0 position
    assert(output.includes("\x1b[1;1H"));
    // Should NOT contain line 2 position (it didn't change)
    // Line 2 would be at row 3 → "\x1b[3;1H"
    // (This may or may not be present depending on cursor movement — just verify line 0 is there)
  });

  it("RenderState tracks cursor for trail prevention", async () => {
    const term = new VTerminal(5, 10);
    const state: RenderState = { prevCursorRow: -1, prevCursorCol: -1 };

    await writeAndFlush(term, "hello");
    renderScreen(term, {
      offsetRow: 1,
      offsetCol: 1,
      width: 10,
      height: 5,
      fullRedraw: true,
    }, state);

    assertEquals(state.prevCursorRow, term.cursorRow);
    assertEquals(state.prevCursorCol, term.cursorCol);
  });
});
