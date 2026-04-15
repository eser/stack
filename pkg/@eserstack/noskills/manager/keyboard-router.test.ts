// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import * as tui from "@eserstack/shell/tui";
import * as keyboardRouter from "./keyboard-router.ts";

// =============================================================================
// Mouse routing
// =============================================================================

// Mock panels (1-based coords)
const mockPanels: tui.layout.LayoutResult = {
  left: { id: "left", x: 1, y: 1, width: 20, height: 23 },
  rightTop: { id: "rightTop", x: 21, y: 1, width: 60, height: 8 },
  rightBottom: { id: "rightBottom", x: 21, y: 9, width: 60, height: 15 },
  statusBar: { id: "statusBar", x: 1, y: 24, width: 80, height: 1 },
};

// Mock list items (no action items — specs only)
const mockItems: readonly tui.list.ListItem[] = [
  { label: "No specs yet", selectable: false },
];

// Helper: create a mouse event (0-based coords, matching SGR protocol)
const mouseEvent = (
  type: "mousedown" | "mouseup" | "mousemove" | "wheel",
  x: number,
  y: number,
  overrides: Partial<tui.mouse.MouseEvent> = {},
): tui.mouse.MouseEvent =>
  ({
    type,
    button: 0 as const,
    x,
    y,
    shift: false,
    ctrl: false,
    direction: undefined,
    ...overrides,
  }) as tui.mouse.MouseEvent;

describe("routeMouseEvent", () => {
  it("click in terminal panel when list focused returns clickTerminal", () => {
    // rightBottom panel starts at x=21, y=9 (1-based).
    // 0-based coords inside: x=25, y=12 -> 1-based: 26,13 which is inside.
    const ev = mouseEvent("mousedown", 25, 12);
    const action = keyboardRouter.routeMouseEvent(
      ev,
      mockPanels,
      mockItems,
      "list",
    );
    assertEquals(action.type, "clickTerminal");
  });

  it("click in terminal panel when terminal focused returns forwardMouse", () => {
    const ev = mouseEvent("mousedown", 25, 12);
    const action = keyboardRouter.routeMouseEvent(
      ev,
      mockPanels,
      mockItems,
      "terminal",
    );
    assertEquals(action.type, "forwardMouse");
  });

  it("scroll in spec list returns scrollSpecs with direction", () => {
    const ev = mouseEvent("wheel", 5, 5, {
      direction: "down",
    });
    const action = keyboardRouter.routeMouseEvent(
      ev,
      mockPanels,
      mockItems,
      "list",
    );
    assertEquals(action.type, "scrollSpecs");
    if (action.type === "scrollSpecs") {
      assertEquals(action.direction, "down");
    }
  });

  it("scroll in terminal returns scrollTerminal with direction", () => {
    const ev = mouseEvent("wheel", 30, 15, {
      direction: "up",
    });
    const action = keyboardRouter.routeMouseEvent(
      ev,
      mockPanels,
      mockItems,
      "terminal",
    );
    assertEquals(action.type, "scrollTerminal");
    if (action.type === "scrollTerminal") {
      assertEquals(action.direction, "up");
    }
  });

  it("click in monitor returns clickMonitor", () => {
    // rightTop panel at x=21, y=1, w=60, h=8 (1-based).
    // 0-based coords: x=30, y=4 -> 1-based: 31,5 which is inside rightTop.
    const ev = mouseEvent("mousedown", 30, 4);
    const action = keyboardRouter.routeMouseEvent(
      ev,
      mockPanels,
      mockItems,
      "list",
    );
    assertEquals(action.type, "clickMonitor");
  });

  it("click outside all panels returns none", () => {
    // statusBar is at y=24 (1-based). 0-based y=23 -> 1-based y=24.
    // But statusBar starts at x=1, w=80, h=1 — so (80,24) is x=81 which is outside.
    const ev = mouseEvent("mousedown", 79, 24);
    const action = keyboardRouter.routeMouseEvent(
      ev,
      mockPanels,
      mockItems,
      "list",
    );
    assertEquals(action.type, "none");
  });

  it("click on non-selectable spec list item returns none", () => {
    // First item "No specs yet" is at index 0, not selectable.
    // relRow = y - 1 = 0, so y = 1 (0-based).
    const ev = mouseEvent("mousedown", 5, 1);
    const action = keyboardRouter.routeMouseEvent(
      ev,
      mockPanels,
      mockItems,
      "list",
    );
    assertEquals(action.type, "none");
  });

  it("click on regular spec item returns clickSpec with index", () => {
    const specItems: readonly tui.list.ListItem[] = [
      { label: "my-spec", selectable: true },
    ];
    // Index 0: relRow = y - 1 = 0, so y = 1 (0-based).
    const ev = mouseEvent("mousedown", 5, 1);
    const action = keyboardRouter.routeMouseEvent(
      ev,
      mockPanels,
      specItems,
      "list",
    );
    assertEquals(action.type, "clickSpec");
    if (action.type === "clickSpec") {
      assertEquals(action.index, 0);
    }
  });

  it("mouseup in spec list returns none", () => {
    const ev = mouseEvent("mouseup", 5, 3);
    const action = keyboardRouter.routeMouseEvent(
      ev,
      mockPanels,
      mockItems,
      "list",
    );
    assertEquals(action.type, "none");
  });

  it("scroll up in spec list returns scrollSpecs up", () => {
    const ev = mouseEvent("wheel", 5, 5, {
      direction: "up",
    });
    const action = keyboardRouter.routeMouseEvent(
      ev,
      mockPanels,
      mockItems,
      "list",
    );
    assertEquals(action.type, "scrollSpecs");
    if (action.type === "scrollSpecs") {
      assertEquals(action.direction, "up");
    }
  });
});
