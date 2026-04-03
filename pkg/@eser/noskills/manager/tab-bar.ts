// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Tab bar — renders the horizontal tab strip at the top of the TUI.
 *
 * Delegates to the generic tab bar widget from `@eser/shell/tui/tab-bar.ts`.
 *
 * @module
 */

import * as tui from "@eser/shell/tui";
import type * as types from "./types.ts";

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

const phaseColor = (
  phase: string | null,
): "green" | "yellow" | "red" | "cyan" | "dim" => {
  switch (phase) {
    case "EXECUTING":
      return "green";
    case "DISCOVERY":
    case "DISCOVERY_REVIEW":
      return "cyan";
    case "BLOCKED":
      return "red";
    case "SPEC_DRAFT":
    case "SPEC_APPROVED":
      return "yellow";
    case "COMPLETED":
      return "dim";
    default:
      return "dim";
  }
};

/** Convert ManagerTab[] to the generic TabDefinition[] format. */
const toTabDefinitions = (
  tabs: readonly types.ManagerTab[],
): ReadonlyArray<tui.layoutTypes.TabDefinition> =>
  tabs.map((tab) => ({
    id: tab.id,
    label: tab.spec !== null ? tab.spec : "IDLE",
    badge: tab.phase !== null ? abbreviatePhase(tab.phase) : undefined,
    badgeColor: tab.phase !== null ? phaseColor(tab.phase) : undefined,
    closable: true,
  }));

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

  const definitions = toTabDefinitions(tabs);
  const tabBarContent = tui.tabBar.renderTabBar({
    tabs: definitions,
    activeIndex,
    maxWidth: width,
    style: "inverse",
  });

  parts.push(tabBarContent);

  return parts.join("");
};
