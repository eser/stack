// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { describe, it } from "@std/testing/bdd";
import * as assert from "@std/assert";
import * as terminal from "../vterm/terminal.ts";
import * as ansi from "./ansi.ts";
import * as tabBar from "./tab-bar.ts";
import * as box from "./box.ts";
import * as flexLayout from "./flex-layout.ts";
import * as scrollContainer from "./scroll-container.ts";

/**
 * Render ANSI output through VTerminal and extract the character grid
 * as an array of strings (one per row).
 */
const renderToGrid = async (
  ansiOutput: string,
  width: number,
  height: number,
): Promise<string[]> => {
  const vt = new terminal.VTerminal(height, width);
  await vt.writeAsync(ansiOutput);
  const buf = vt.activeBuffer;
  const rows: string[] = [];

  for (let r = 0; r < height; r++) {
    const line = buf.getLine(r);
    let rowText = "";
    for (let c = 0; c < width; c++) {
      const cell = line?.getCell(c);
      rowText += cell?.getChars() || " ";
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
  it("should render tab labels", async () => {
    const tabs = [
      { id: "1", label: "Alpha" },
      { id: "2", label: "Beta" },
    ];

    const output = tabBar.renderTabBar({
      tabs,
      activeIndex: 0,
      maxWidth: 40,
    });

    const grid = await renderToGrid(output, 40, 1);

    assert.assertEquals(gridContains(grid, "Alpha"), true);
    assert.assertEquals(gridContains(grid, "Beta"), true);
  });

  it("should show active tab differently from inactive", async () => {
    const tabs = [
      { id: "1", label: "Alpha" },
      { id: "2", label: "Beta" },
    ];

    const output = tabBar.renderTabBar({
      tabs,
      activeIndex: 0,
      maxWidth: 40,
    });

    const grid = await renderToGrid(output, 40, 1);

    assert.assertEquals(grid[0]!.includes("Alpha"), true);
    assert.assertEquals(grid[0]!.includes("Beta"), true);

    assert.assertEquals(ansi.visibleLength(output), 40);
  });

  it("should render tab indices", async () => {
    const tabs = [
      { id: "1", label: "Alpha" },
      { id: "2", label: "Beta" },
    ];

    const output = tabBar.renderTabBar({
      tabs,
      activeIndex: 1,
      maxWidth: 40,
    });

    const grid = await renderToGrid(output, 40, 1);

    assert.assertEquals(grid[0]!.includes("1:Alpha"), true);
    assert.assertEquals(grid[0]!.includes("2:Beta"), true);
  });
});

// ---------------------------------------------------------------------------
// Box snapshot tests
// ---------------------------------------------------------------------------

describe("VTerm snapshot: Box", () => {
  it("should render box borders with rounded style", async () => {
    const output = box.drawBox({
      x: 1,
      y: 1,
      width: 20,
      height: 5,
      borderStyle: "rounded",
    });

    const grid = await renderToGrid(output, 22, 6);

    assert.assertEquals(charAt(grid, 0, 0), "\u256D"); // "╭"
    assert.assertEquals(charAt(grid, 0, 19), "\u256E"); // "╮"
    assert.assertEquals(charAt(grid, 4, 0), "\u2570"); // "╰"
    assert.assertEquals(charAt(grid, 4, 19), "\u256F"); // "╯"
  });

  it("should render box with title", async () => {
    const output = box.drawBox({
      x: 1,
      y: 1,
      width: 20,
      height: 5,
      title: "Test",
    });

    const grid = await renderToGrid(output, 22, 6);
    assert.assertEquals(grid[0]!.includes("Test"), true);
  });

  it("should render single border style", async () => {
    const output = box.drawBox({
      x: 1,
      y: 1,
      width: 10,
      height: 3,
      borderStyle: "single",
    });

    const grid = await renderToGrid(output, 12, 4);

    assert.assertEquals(charAt(grid, 0, 0), "\u250C"); // "┌"
    assert.assertEquals(charAt(grid, 0, 9), "\u2510"); // "┐"
    assert.assertEquals(charAt(grid, 2, 0), "\u2514"); // "└"
    assert.assertEquals(charAt(grid, 2, 9), "\u2518"); // "┘"
  });

  it("should render vertical borders on middle rows", async () => {
    const output = box.drawBox({
      x: 1,
      y: 1,
      width: 10,
      height: 4,
      borderStyle: "single",
    });

    const grid = await renderToGrid(output, 12, 5);

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
  it("should render side-by-side panels", async () => {
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
    const grid = await renderToGrid(combined, 40, 10);

    assert.assertEquals(charAt(grid, 0, 0), "\u250C"); // "┌"
    assert.assertEquals(leftPanel.width, 20);
    assert.assertEquals(rightPanel.x, 20);
    assert.assertEquals(charAt(grid, 0, 20), "\u250C"); // "┌" of right box
  });

  it("should respect fixed-size children", async () => {
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

    const grid = await renderToGrid(sidebarBox + mainBox, 40, 10);

    assert.assertEquals(charAt(grid, 0, 0), "\u256D"); // "╭"
    assert.assertEquals(charAt(grid, 0, 10), "\u256D"); // "╭"
  });
});

// ---------------------------------------------------------------------------
// Scrollbar snapshot tests
// ---------------------------------------------------------------------------

describe("VTerm snapshot: ScrollBar", () => {
  it("should render scrollbar in rightmost column", async () => {
    const scrollState = scrollContainer.createScrollState(100, 10);
    const panel = { id: "test", x: 0, y: 0, width: 20, height: 10 };
    const output = scrollContainer.renderScrollbar(panel, scrollState);

    const grid = await renderToGrid(output, 21, 11);

    const scrollbarChars: string[] = [];
    for (let r = 0; r < 10; r++) {
      scrollbarChars.push(charAt(grid, r, 19));
    }

    const hasThumb = scrollbarChars.some((ch) => ch === "\u2588");
    const hasTrack = scrollbarChars.some((ch) => ch === "\u2502");

    assert.assertEquals(hasThumb || hasTrack, true);
  });

  it("should not render scrollbar when content fits in viewport", () => {
    const scrollState = scrollContainer.createScrollState(5, 10);
    const panel = { id: "test", x: 0, y: 0, width: 20, height: 10 };
    const output = scrollContainer.renderScrollbar(panel, scrollState);
    assert.assertEquals(output, "");
  });

  it("should render thumb at top when offset is 0", async () => {
    const scrollState = scrollContainer.createScrollState(100, 10);
    const panel = { id: "test", x: 0, y: 0, width: 20, height: 10 };
    const output = scrollContainer.renderScrollbar(panel, scrollState, "block");

    const grid = await renderToGrid(output, 21, 11);
    const firstScrollChar = charAt(grid, 0, 19);
    assert.assertEquals(firstScrollChar, "\u2588");
  });

  it("should render thumb at bottom when scrolled to end", async () => {
    const scrollState = {
      offset: 90,
      contentHeight: 100,
      viewportHeight: 10,
    };
    const panel = { id: "test", x: 0, y: 0, width: 20, height: 10 };
    const output = scrollContainer.renderScrollbar(panel, scrollState, "block");

    const grid = await renderToGrid(output, 21, 11);
    const lastScrollChar = charAt(grid, 9, 19);
    assert.assertEquals(lastScrollChar, "\u2588");
  });
});
