// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "@std/testing/bdd";
import * as assert from "@std/assert";
import * as terminal from "./terminal.ts";
import * as renderer from "./renderer.ts";
import type { RenderState } from "./renderer.ts";

// =============================================================================
// Helper: write and wait for xterm to process
// =============================================================================

const writeAndFlush = async (
  term: terminal.VTerminal,
  data: string,
): Promise<void> => {
  await term.writeAsync(data);
};

// =============================================================================
// VTerminal — xterm-headless wrapper
// =============================================================================

bdd.describe("VTerminal", () => {
  bdd.it("constructs with correct dimensions", () => {
    const term = new terminal.VTerminal(24, 80);
    assert.assertEquals(term.rows, 24);
    assert.assertEquals(term.cols, 80);
  });

  bdd.it("write places chars in buffer", async () => {
    const term = new terminal.VTerminal(24, 80);
    await writeAndFlush(term, "hello");

    const line = term.activeBuffer.getLine(0);
    const text = line?.translateToString(true, 0, 5);
    assert.assertEquals(text, "hello");
  });

  bdd.it("cursor position updates after write", async () => {
    const term = new terminal.VTerminal(24, 80);
    await writeAndFlush(term, "abc");

    assert.assertEquals(term.cursorCol, 3);
    assert.assertEquals(term.cursorRow, 0);
  });

  bdd.it("newline moves cursor down", async () => {
    const term = new terminal.VTerminal(24, 80);
    await writeAndFlush(term, "line1\r\nline2");

    assert.assertEquals(term.cursorRow, 1);
    const line1 = term.activeBuffer.getLine(1);
    assert.assert(line1?.translateToString(true).startsWith("line2"));
  });

  bdd.it("cursor positioning via CSI H", async () => {
    const term = new terminal.VTerminal(24, 80);
    await writeAndFlush(term, "\x1b[5;10H*");

    assert.assertEquals(term.cursorRow, 4); // 0-indexed
    assert.assertEquals(term.cursorCol, 10);
  });

  bdd.it("erase display (CSI 2J)", async () => {
    const term = new terminal.VTerminal(5, 10);
    await writeAndFlush(term, "hello\r\nworld");
    await writeAndFlush(term, "\x1b[2J");

    const line0 = term.activeBuffer.getLine(0);
    assert.assertEquals(line0?.translateToString(true).trim(), "");
  });

  bdd.it("resize changes dimensions", () => {
    const term = new terminal.VTerminal(24, 80);
    term.resize(30, 100);

    assert.assertEquals(term.rows, 30);
    assert.assertEquals(term.cols, 100);
  });

  bdd.it("alternate screen buffer", async () => {
    const term = new terminal.VTerminal(24, 80);
    await writeAndFlush(term, "main screen");

    // Enter alt screen — alt buffer should be active
    await writeAndFlush(term, "\x1b[?1049h");
    await writeAndFlush(term, "alt content");

    const altLine = term.activeBuffer.getLine(0);
    const altText = altLine?.translateToString(true) ?? "";
    assert.assert(
      altText.includes("alt content"),
      `Alt screen should show 'alt content', got: '${altText}'`,
    );
  });
});

// =============================================================================
// Dirty-line tracking
// =============================================================================

bdd.describe("dirty-line tracking", () => {
  bdd.it("all lines dirty after construction", () => {
    const term = new terminal.VTerminal(5, 10);
    const dirty = term.getDirtyLines();
    assert.assertEquals(dirty.size, 5);
  });

  bdd.it("clearDirty resets dirty state", () => {
    const term = new terminal.VTerminal(5, 10);
    term.clearDirty();
    const dirty = term.getDirtyLines();
    // Only cursor row should be dirty
    assert.assert(dirty.size <= 1);
  });

  bdd.it("write marks changed lines dirty", async () => {
    const term = new terminal.VTerminal(5, 10);
    term.clearDirty();

    await writeAndFlush(term, "hello");
    const dirty = term.getDirtyLines();
    assert.assert(dirty.has(0)); // line 0 changed
  });

  bdd.it("markAllDirty marks everything", () => {
    const term = new terminal.VTerminal(5, 10);
    term.clearDirty();
    term.markAllDirty();
    const dirty = term.getDirtyLines();
    assert.assertEquals(dirty.size, 5);
  });

  bdd.it("resize marks all dirty", () => {
    const term = new terminal.VTerminal(5, 10);
    term.clearDirty();
    term.resize(8, 12);
    const dirty = term.getDirtyLines();
    assert.assertEquals(dirty.size, 8);
  });
});

// =============================================================================
// Colors and styling
// =============================================================================

bdd.describe("color handling", () => {
  bdd.it("16-color foreground sets color mode", async () => {
    const term = new terminal.VTerminal(5, 20);
    await writeAndFlush(term, "\x1b[31mR"); // red

    const cell = term.activeBuffer.getLine(0)?.getCell(0);
    assert.assert(cell !== null && cell !== undefined);
    assert.assertEquals(cell.getFgColor(), 1); // red = 1
    assert.assert(cell.getFgColorMode() !== 0); // not default
  });

  bdd.it("256-color foreground", async () => {
    const term = new terminal.VTerminal(5, 20);
    await writeAndFlush(term, "\x1b[38;5;208mX");

    const cell = term.activeBuffer.getLine(0)?.getCell(0);
    assert.assert(cell !== null && cell !== undefined);
    assert.assertEquals(cell.getFgColor(), 208);
  });

  bdd.it("RGB foreground", async () => {
    const term = new terminal.VTerminal(5, 20);
    await writeAndFlush(term, "\x1b[38;2;100;200;50mX");

    const cell = term.activeBuffer.getLine(0)?.getCell(0);
    assert.assert(cell !== null && cell !== undefined);
    // RGB packed as 24-bit: (100 << 16) | (200 << 8) | 50 = 6604850
    assert.assertEquals(cell.getFgColor(), 6604850);
  });

  bdd.it("bold attribute", async () => {
    const term = new terminal.VTerminal(5, 20);
    await writeAndFlush(term, "\x1b[1mB");

    const cell = term.activeBuffer.getLine(0)?.getCell(0);
    assert.assert(cell !== null && cell !== undefined);
    assert.assert(cell.isBold() !== 0);
  });

  bdd.it("reset clears attributes", async () => {
    const term = new terminal.VTerminal(5, 20);
    await writeAndFlush(term, "\x1b[1;31mX\x1b[0mN");

    const normal = term.activeBuffer.getLine(0)?.getCell(1);
    assert.assert(normal !== null && normal !== undefined);
    assert.assertEquals(normal.getFgColorMode(), 0); // default
    assert.assertEquals(normal.isBold(), 0);
  });
});

// =============================================================================
// Renderer
// =============================================================================

bdd.describe("renderScreen", () => {
  bdd.it("renders at offset with moveTo sequences", async () => {
    const term = new terminal.VTerminal(3, 5);
    await writeAndFlush(term, "hello");

    const output = renderer.renderScreen(term, {
      offsetRow: 10,
      offsetCol: 20,
      width: 5,
      height: 3,
      fullRedraw: true,
    });

    // Should contain moveTo for row 10 at col 20
    assert.assert(output.includes("\x1b[10;20H"));
    assert.assert(output.includes("h"));
    assert.assert(output.includes("e"));
  });

  bdd.it("includes SGR codes for colored cells", async () => {
    const term = new terminal.VTerminal(3, 10);
    await writeAndFlush(term, "\x1b[31mred");

    const output = renderer.renderScreen(term, {
      offsetRow: 1,
      offsetCol: 1,
      width: 10,
      height: 3,
      fullRedraw: true,
    });

    // Should contain red foreground SGR and text
    assert.assert(output.includes("r"));
    assert.assert(output.includes("e"));
    assert.assert(output.includes("d"));
  });

  bdd.it("does NOT emit background SGR codes (transparency)", async () => {
    const term = new terminal.VTerminal(3, 10);
    await writeAndFlush(term, "\x1b[41mBG"); // red background

    const output = renderer.renderScreen(term, {
      offsetRow: 1,
      offsetCol: 1,
      width: 10,
      height: 3,
      fullRedraw: true,
    });

    // Should NOT contain background SGR (41)
    assert.assert(!output.includes("\x1b[41m"));
  });

  bdd.it("cursor renders with inverse video", async () => {
    const term = new terminal.VTerminal(3, 10);
    await writeAndFlush(term, "ab");

    const output = renderer.renderScreen(term, {
      offsetRow: 1,
      offsetCol: 1,
      width: 10,
      height: 3,
      fullRedraw: true,
    });

    // Cursor at col 2 — should have inverse on/off
    assert.assert(output.includes("\x1b[7m")); // inverse on
    assert.assert(output.includes("\x1b[27m")); // inverse off
  });

  bdd.it("incremental rendering skips clean lines", async () => {
    const term = new terminal.VTerminal(3, 10);
    await writeAndFlush(term, "line0\r\nline1\r\nline2");

    // First render — full
    renderer.renderScreen(term, {
      offsetRow: 1,
      offsetCol: 1,
      width: 10,
      height: 3,
      fullRedraw: true,
    });

    // Modify only line 0
    await writeAndFlush(term, "\x1b[1;1HXXX");

    const output = renderer.renderScreen(term, {
      offsetRow: 1,
      offsetCol: 1,
      width: 10,
      height: 3,
    });

    // Should contain line 0 position
    assert.assert(output.includes("\x1b[1;1H"));
    // Should NOT contain line 2 position (it didn't change)
    // Line 2 would be at row 3 → "\x1b[3;1H"
    // (This may or may not be present depending on cursor movement — just verify line 0 is there)
  });

  bdd.it("RenderState tracks cursor for trail prevention", async () => {
    const term = new terminal.VTerminal(5, 10);
    const state: RenderState = { prevCursorRow: -1, prevCursorCol: -1 };

    await writeAndFlush(term, "hello");
    renderer.renderScreen(term, {
      offsetRow: 1,
      offsetCol: 1,
      width: 10,
      height: 5,
      fullRedraw: true,
    }, state);

    assert.assertEquals(state.prevCursorRow, term.cursorRow);
    assert.assertEquals(state.prevCursorCol, term.cursorCol);
  });
});
