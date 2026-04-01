// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Right-bottom panel — renders PTY output via VTermWidget.
 *
 * When a tab has a VTermWidget, renders the virtual terminal screen.
 * Falls back to raw buffer lines if no widget is available.
 *
 * @module
 */

import * as tui from "@eser/shell/tui";
import type * as types from "./types.ts";

export const render = (
  tab: types.ManagerTab | null,
  panel: tui.layout.Panel,
): string => {
  const title = tab !== null
    ? tab.mode === "free" ? "Terminal (FREE)" : `Terminal (${tab.spec ?? "?"})`
    : "Terminal";

  // Use VTermWidget?
  const hasWidget = tab !== null && tab.widget !== null;

  // Draw box border — skip interior fill when VTermWidget paints the content
  const border = tui.box.drawBox({
    x: panel.x,
    y: panel.y,
    width: panel.width,
    height: panel.height,
    title,
    borderStyle: "rounded",
    skipInterior: hasWidget,
  });

  // No tab or no content — show placeholder
  if (tab === null || (tab.widget === null && tab.buffer.length === 0)) {
    const placeholder = tui.ansi.dim("Waiting for output...");
    const padLine = " ".repeat(panel.width - 2);
    let content = "";
    for (let r = 1; r < panel.height - 1; r++) {
      content += tui.ansi.moveTo(panel.y + r, panel.x + 1);
      content += r === 1
        ? tui.ansi.truncate(placeholder, panel.width - 2) +
          " ".repeat(
            Math.max(0, panel.width - 2 - tui.ansi.visibleLength(placeholder)),
          )
        : padLine;
    }
    return border + content;
  }

  // VTermWidget available — render virtual terminal screen
  if (tab.widget !== null) {
    return border + tab.widget.render(panel);
  }

  // Fallback: raw buffer lines
  const innerHeight = panel.height - 2;
  const visibleLines = tab.buffer.slice(-innerHeight);
  return tui.box.fillBox(
    {
      x: panel.x,
      y: panel.y,
      width: panel.width,
      height: panel.height,
      title,
      borderStyle: "rounded",
    },
    visibleLines,
  );
};
