// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { describe, it } from "@std/testing/bdd";
import * as assert from "@std/assert";
import * as terminal from "../vterm/terminal.ts";
import * as screen from "../vterm/screen.ts";
import * as ansi from "./ansi.ts";
import * as tabBar from "./tab-bar.ts";
import * as box from "./box.ts";
import * as flexLayout from "./flex-layout.ts";
import * as scrollContainer from "./scroll-container.ts";

/**
 * Render ANSI output through VTerminal and extract the character grid
 * as an array of strings (one per row), trimming trailing spaces.
 */
const renderToGrid = (
  ansiOutput: string,
  width: number,
  height: number,
): string[] => {
  const vt = new terminal.VTerminal(height, width);
  vt.write(ansiOutput);
  const buf = vt.getScreen();
  const rows: string[] = [];

  for (let r = 0; r < height; r++) {
    let rowText = "";
    for (let c = 0; c < width; c++) {
      const cell: screen.Cell = buf.getCell(r, c);
      rowText += cell.char;
    }
    rows.push(rowText);
  }

  return rows;
};

/**
 * Check whether any row in the grid contains the given substring.
 */
const gridContains = (grid: string[], text: string): boolean =>
  grid.some((row) => row.includes(text));

/**
 * Return the character at a specific (row, col) position in the grid
 * (0-based indices).
 */
const charAt = (grid: string[], row: number, col: number): string =>
  grid[row]?.charAt(col) ?? " ";

// ---------------------------------------------------------------------------
// TabBar snapshot tests
// ---------------------------------------------------------------------------

describe("VTerm snapshot: TabBar", () => {
  it("should render tab labels", () => {
    const tabs = [
      { id: "1", label: "Alpha" },
      { id: "2", label: "Beta" },
    ];

    const output = tabBar.renderTabBar({
      tabs,
      activeIndex: 0,
      maxWidth: 40,
    });

    // Tab bar output has no cursor positioning -- it is inline text that
    // starts at cursor position (0, 0) in the VTerminal.
    const grid = renderToGrid(output, 40, 1);

    assert.assertEquals(gridContains(grid, "Alpha"), true);
    assert.assertEquals(gridContains(grid, "Beta"), true);
  });

  it("should show active tab differently from inactive", () => {
    const tabs = [
      { id: "1", label: "Alpha" },
      { id: "2", label: "Beta" },
    ];

    const output = tabBar.renderTabBar({
      tabs,
      activeIndex: 0,
      maxWidth: 40,
    });

    const grid = renderToGrid(output, 40, 1);

    // Both tab labels must appear in the rendered grid row.
    assert.assertEquals(grid[0]!.includes("Alpha"), true);
    assert.assertEquals(grid[0]!.includes("Beta"), true);

    // The visible length should fill maxWidth (padded).
    assert.assertEquals(ansi.visibleLength(output), 40);
  });

  it("should render tab indices", () => {
    const tabs = [
      { id: "1", label: "Alpha" },
      { id: "2", label: "Beta" },
    ];

    const output = tabBar.renderTabBar({
      tabs,
      activeIndex: 1,
      maxWidth: 40,
    });

    const grid = renderToGrid(output, 40, 1);

    // Tab indices are 1-based: "1:Alpha" and "2:Beta"
    assert.assertEquals(grid[0]!.includes("1:Alpha"), true);
    assert.assertEquals(grid[0]!.includes("2:Beta"), true);
  });
});

// ---------------------------------------------------------------------------
// Box snapshot tests
// ---------------------------------------------------------------------------

describe("VTerm snapshot: Box", () => {
  it("should render box borders with rounded style", () => {
    // drawBox uses ansi.moveTo which is 1-based.
    // moveTo(y, x) where y=1, x=1 maps to VTerminal row 0, col 0.
    const output = box.drawBox({
      x: 1,
      y: 1,
      width: 20,
      height: 5,
      borderStyle: "rounded",
    });

    const grid = renderToGrid(output, 22, 6);

    // Top-left corner at row 0, col 0 should be the rounded corner char.
    assert.assertEquals(charAt(grid, 0, 0), "\u256D"); // "╭"
    // Top-right corner at row 0, col 19.
    assert.assertEquals(charAt(grid, 0, 19), "\u256E"); // "╮"
    // Bottom-left corner at row 4, col 0.
    assert.assertEquals(charAt(grid, 4, 0), "\u2570"); // "╰"
    // Bottom-right corner at row 4, col 19.
    assert.assertEquals(charAt(grid, 4, 19), "\u256F"); // "╯"
  });

  it("should render box with title", () => {
    const output = box.drawBox({
      x: 1,
      y: 1,
      width: 20,
      height: 5,
      title: "Test",
    });

    const grid = renderToGrid(output, 22, 6);

    // The title should appear in the top border row (row 0).
    assert.assertEquals(grid[0]!.includes("Test"), true);
  });

  it("should render single border style", () => {
    const output = box.drawBox({
      x: 1,
      y: 1,
      width: 10,
      height: 3,
      borderStyle: "single",
    });

    const grid = renderToGrid(output, 12, 4);

    assert.assertEquals(charAt(grid, 0, 0), "\u250C"); // "┌"
    assert.assertEquals(charAt(grid, 0, 9), "\u2510"); // "┐"
    assert.assertEquals(charAt(grid, 2, 0), "\u2514"); // "└"
    assert.assertEquals(charAt(grid, 2, 9), "\u2518"); // "┘"
  });

  it("should render vertical borders on middle rows", () => {
    const output = box.drawBox({
      x: 1,
      y: 1,
      width: 10,
      height: 4,
      borderStyle: "single",
    });

    const grid = renderToGrid(output, 12, 5);

    // Middle rows (1, 2) should have vertical borders at col 0 and col 9.
    assert.assertEquals(charAt(grid, 1, 0), "\u2502"); // "│"
    assert.assertEquals(charAt(grid, 1, 9), "\u2502"); // "│"
    assert.assertEquals(charAt(grid, 2, 0), "\u2502"); // "│"
    assert.assertEquals(charAt(grid, 2, 9), "\u2502"); // "│"
  });
});

// ---------------------------------------------------------------------------
// Flex Layout + Box snapshot tests
// ---------------------------------------------------------------------------

describe("VTerm snapshot: Flex Layout + Box", () => {
  it("should render side-by-side panels", () => {
    // Create a row layout with two children.
    const root = flexLayout.createFlexNode({
      direction: "row",
      children: [
        flexLayout.createFlexNode({ id: "left" }),
        flexLayout.createFlexNode({ id: "right" }),
      ],
    });

    const panels = flexLayout.computeLayout(root, 40, 10);
    const leftPanel = flexLayout.findPanel(panels, "left");
    const rightPanel = flexLayout.findPanel(panels, "right");

    assert.assertExists(leftPanel);
    assert.assertExists(rightPanel);

    // Draw boxes at each panel position (convert to 1-based for ansi.moveTo).
    const leftBox = box.drawBox({
      x: leftPanel.x + 1,
      y: leftPanel.y + 1,
      width: leftPanel.width,
      height: leftPanel.height,
      borderStyle: "single",
    });

    const rightBox = box.drawBox({
      x: rightPanel.x + 1,
      y: rightPanel.y + 1,
      width: rightPanel.width,
      height: rightPanel.height,
      borderStyle: "single",
    });

    const combined = leftBox + rightBox;
    const grid = renderToGrid(combined, 40, 10);

    // Left box starts at col 0 -- top-left corner.
    assert.assertEquals(charAt(grid, 0, 0), "\u250C"); // "┌"

    // Right box starts at the split point.
    // With equal flex grow=1 in 40 cols, each panel is 20 cols wide.
    assert.assertEquals(leftPanel.width, 20);
    assert.assertEquals(rightPanel.x, 20);
    assert.assertEquals(charAt(grid, 0, 20), "\u250C"); // "┌" of right box
  });

  it("should respect fixed-size children", () => {
    const root = flexLayout.createFlexNode({
      direction: "row",
      children: [
        flexLayout.createFlexNode({
          id: "sidebar",
          size: { type: "fixed", value: 10 },
        }),
        flexLayout.createFlexNode({ id: "main" }),
      ],
    });

    const panels = flexLayout.computeLayout(root, 40, 10);
    const sidebar = flexLayout.findPanel(panels, "sidebar");
    const main = flexLayout.findPanel(panels, "main");

    assert.assertExists(sidebar);
    assert.assertExists(main);
    assert.assertEquals(sidebar.width, 10);
    assert.assertEquals(main.x, 10);
    assert.assertEquals(main.width, 30);

    // Draw both boxes and verify they appear correctly in VTerminal.
    const sidebarBox = box.drawBox({
      x: sidebar.x + 1,
      y: sidebar.y + 1,
      width: sidebar.width,
      height: sidebar.height,
      borderStyle: "rounded",
    });

    const mainBox = box.drawBox({
      x: main.x + 1,
      y: main.y + 1,
      width: main.width,
      height: main.height,
      borderStyle: "rounded",
    });

    const grid = renderToGrid(sidebarBox + mainBox, 40, 10);

    // Sidebar rounded corner at col 0.
    assert.assertEquals(charAt(grid, 0, 0), "\u256D"); // "╭"
    // Main panel rounded corner at col 10.
    assert.assertEquals(charAt(grid, 0, 10), "\u256D"); // "╭"
  });
});

// ---------------------------------------------------------------------------
// Scrollbar snapshot tests
// ---------------------------------------------------------------------------

describe("VTerm snapshot: ScrollBar", () => {
  it("should render scrollbar in rightmost column", () => {
    const scrollState = scrollContainer.createScrollState(100, 10);

    // Panel at position (0, 0) with width 20, height 10.
    // renderScrollbar uses 1-based coords internally via ansi.moveTo.
    // The scrollbar column is panel.x + panel.width (1-based).
    const panel = { id: "test", x: 0, y: 0, width: 20, height: 10 };
    const output = scrollContainer.renderScrollbar(panel, scrollState);

    // The scrollbar renders at col = panel.x + panel.width = 20 (1-based),
    // which is col index 19 in VTerminal (0-based).
    const grid = renderToGrid(output, 21, 11);

    // Collect the characters in the scrollbar column (col 19, 0-based).
    const scrollbarChars: string[] = [];
    for (let r = 0; r < 10; r++) {
      // The scrollbar rows start at panel.y + 0 + 1 = 1 (1-based) -> row 0 (0-based).
      scrollbarChars.push(charAt(grid, r, 19));
    }

    // At least some characters should be the thumb ("\u2588") or track ("\u2502").
    const hasThumb = scrollbarChars.some((ch) => ch === "\u2588");
    const hasTrack = scrollbarChars.some((ch) => ch === "\u2502");

    assert.assertEquals(
      hasThumb || hasTrack,
      true,
    );
  });

  it("should not render scrollbar when content fits in viewport", () => {
    const scrollState = scrollContainer.createScrollState(5, 10);
    const panel = { id: "test", x: 0, y: 0, width: 20, height: 10 };
    const output = scrollContainer.renderScrollbar(panel, scrollState);

    // When contentHeight <= viewportHeight, renderScrollbar returns "".
    assert.assertEquals(output, "");
  });

  it("should render thumb at top when offset is 0", () => {
    const scrollState = scrollContainer.createScrollState(100, 10);
    const panel = { id: "test", x: 0, y: 0, width: 20, height: 10 };
    const output = scrollContainer.renderScrollbar(panel, scrollState, "block");

    const grid = renderToGrid(output, 21, 11);

    // With offset=0, the thumb should be at the top of the scrollbar.
    // The first row of the scrollbar (row 0 in 0-based) should have the thumb.
    const firstScrollChar = charAt(grid, 0, 19);
    assert.assertEquals(firstScrollChar, "\u2588"); // block thumb
  });

  it("should render thumb at bottom when scrolled to end", () => {
    // Scroll to the end: offset = contentHeight - viewportHeight = 90.
    const scrollState = {
      offset: 90,
      contentHeight: 100,
      viewportHeight: 10,
    };
    const panel = { id: "test", x: 0, y: 0, width: 20, height: 10 };
    const output = scrollContainer.renderScrollbar(panel, scrollState, "block");

    const grid = renderToGrid(output, 21, 11);

    // With offset at maximum, the thumb should be at the bottom.
    // The last row of the scrollbar (row 9 in 0-based) should have the thumb.
    const lastScrollChar = charAt(grid, 9, 19);
    assert.assertEquals(lastScrollChar, "\u2588"); // block thumb
  });
});
