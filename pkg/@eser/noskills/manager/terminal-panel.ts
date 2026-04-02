// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Right-bottom panel — renders PTY output via VTermWidget.
 *
 * Tab bar renders one row ABOVE the panel border.
 * VTermWidget fills the full panel interior.
 *
 * @module
 */

import * as tui from "@eser/shell/tui";
import type * as types from "./types.ts";
import * as tabBarMod from "./tab-bar.ts";

export const render = (
  tab: types.ManagerTab | null,
  panel: tui.layout.Panel,
  allTabs?: readonly types.ManagerTab[],
  activeTabIndex?: number,
): string => {
  const title = "Terminal";
  const tabs = allTabs ?? [];
  const tabIdx = activeTabIndex ?? 0;

  // Tab bar sits one row ABOVE the panel border
  const tabBarRow = panel.y - 1;
  const tabBarWidth = panel.width;
  const tabBarRendered = tabBarMod.render(
    tabs,
    tabIdx,
    tabBarWidth,
    tabBarRow,
    panel.x,
  );

  // Use VTermWidget?
  const hasWidget = tab !== null && tab.widget !== null;

  // Draw box border
  const border = tui.box.drawBox({
    x: panel.x,
    y: panel.y,
    width: panel.width,
    height: panel.height,
    title,
    borderStyle: "rounded",
    skipInterior: hasWidget,
  });

  // No tabs — centered message inside panel
  if (tabs.length === 0) {
    const msg = tui.ansi.dim("No tabs \u2014 press n to create one");
    const padLine = " ".repeat(Math.max(0, panel.width - 2));
    let content = "";
    const midRow = Math.floor((panel.height - 2) / 2);
    for (let r = 1; r < panel.height - 1; r++) {
      content += tui.ansi.moveTo(panel.y + r, panel.x + 1);
      if (r === midRow) {
        const msgLen = tui.ansi.visibleLength(msg);
        const leftPad = Math.max(
          0,
          Math.floor((panel.width - 2 - msgLen) / 2),
        );
        content += " ".repeat(leftPad) + msg +
          " ".repeat(Math.max(0, panel.width - 2 - leftPad - msgLen));
      } else {
        content += padLine;
      }
    }
    return tabBarRendered + border + content;
  }

  // Tab exists but no output yet — blank interior
  if (tab === null || (tab.widget === null && tab.buffer.length === 0)) {
    const padLine = " ".repeat(Math.max(0, panel.width - 2));
    let content = "";
    for (let r = 1; r < panel.height - 1; r++) {
      content += tui.ansi.moveTo(panel.y + r, panel.x + 1);
      content += padLine;
    }
    return tabBarRendered + border + content;
  }

  // VTermWidget — render virtual terminal
  if (tab.widget !== null) {
    return tabBarRendered + border + tab.widget.render(panel);
  }

  // Fallback: raw buffer lines
  const innerHeight = panel.height - 2;
  const visibleLines = tab.buffer.slice(-innerHeight);
  return tabBarRendered + tui.box.fillBox(
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
