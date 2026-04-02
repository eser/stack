// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Tab bar — renders the horizontal tab strip at the top of the TUI.
 *
 * @module
 */

import * as tui from "@eser/shell/tui";
import type * as types from "./types.ts";

/** Render a single tab label. */
const renderTab = (
  tab: types.ManagerTab,
  index: number,
  isActive: boolean,
): string => {
  const num = index + 1;
  const label = tab.spec !== null
    ? `${num}: ${tab.spec}${
      tab.phase ? ` (${abbreviatePhase(tab.phase)})` : ""
    }`
    : `${num}: IDLE`;

  if (isActive) {
    return tui.ansi.inverse(` ${label} `);
  }
  return tui.ansi.dim(` ${label} `);
};

const abbreviatePhase = (phase: string): string => {
  const map: Record<string, string> = {
    DISCOVERY: "DISC",
    DISCOVERY_REVIEW: "REVW",
    SPEC_DRAFT: "DRFT",
    SPEC_APPROVED: "APPR",
    EXECUTING: "EXEC",
    BLOCKED: "BLKD",
    COMPLETED: "DONE",
    IDLE: "IDLE",
  };
  return map[phase] ?? phase.slice(0, 4);
};

/** Render the full tab bar row. */
export const render = (
  tabs: readonly types.ManagerTab[],
  activeIndex: number,
  width: number,
  row: number,
  col = 1,
): string => {
  const parts: string[] = [];

  // Position at the tab bar row and column
  parts.push(tui.ansi.moveTo(row, col));

  if (tabs.length === 0) {
    const empty = tui.ansi.dim(" No tabs \u2014 press n to create one ");
    parts.push(
      empty + " ".repeat(Math.max(0, width - tui.ansi.visibleLength(empty))),
    );
    return parts.join("");
  }

  // Build tab labels
  let tabContent = "";
  for (let i = 0; i < tabs.length; i++) {
    const tab = tabs[i]!;
    tabContent += renderTab(tab, i, i === activeIndex);
    if (i < tabs.length - 1) {
      tabContent += tui.ansi.dim("\u2502"); // │ separator
    }
  }

  // Pad to full width
  const visLen = tui.ansi.visibleLength(tabContent);
  const padding = Math.max(0, width - visLen);
  parts.push(tabContent + " ".repeat(padding));

  return parts.join("");
};
