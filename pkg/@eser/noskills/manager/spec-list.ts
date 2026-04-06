// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Left panel — renders spec list using @eser/shell/tui list primitives.
 *
 * @module
 */

import * as tui from "@eser/shell/tui";
import type * as types from "./types.ts";

const abbreviatePhase = (phase: string | null): string => {
  if (phase === null) return "\u2014";
  const map: Record<string, string> = {
    DISCOVERY: "DISC",
    DISCOVERY_REFINEMENT: "REVW",
    SPEC_PROPOSAL: "DRFT",
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
    case "DISCOVERY_REFINEMENT":
      return "cyan";
    case "BLOCKED":
      return "red";
    case "SPEC_PROPOSAL":
    case "SPEC_APPROVED":
      return "yellow";
    case "COMPLETED":
      return "dim";
    default:
      return "dim";
  }
};

const colorize = (text: string, color: string): string => {
  switch (color) {
    case "green":
      return tui.ansi.green(text);
    case "yellow":
      return tui.ansi.yellow(text);
    case "red":
      return tui.ansi.red(text);
    case "cyan":
      return tui.ansi.cyan(text);
    case "dim":
      return tui.ansi.dim(text);
    default:
      return text;
  }
};

export type SpecInfo = {
  readonly name: string;
  readonly phase: string | null;
  readonly hasActiveSession: boolean;
};

export const buildListItems = (
  specs: readonly SpecInfo[],
  tabs: readonly types.ManagerTab[],
): readonly tui.list.ListItem[] => {
  const tabSpecs = new Set(
    tabs.filter((t) => t.spec !== null).map((t) => t.spec),
  );

  const items: tui.list.ListItem[] = specs.map((s) => ({
    label: s.name,
    badge: abbreviatePhase(s.phase),
    badgeColor: phaseColor(s.phase),
    active: tabSpecs.has(s.name),
    dimmed: s.phase === "COMPLETED",
  }));

  // Empty state
  if (items.length === 0) {
    items.push({ label: "No specs yet", dimmed: true, selectable: false });
  }

  return items;
};

export const render = (
  specs: readonly SpecInfo[],
  tabs: readonly types.ManagerTab[],
  selectedIndex: number,
  panel: tui.layout.Panel,
): string => {
  const items = buildListItems(specs, tabs);
  const border = tui.box.drawBox({
    x: panel.x,
    y: panel.y,
    width: panel.width,
    height: panel.height,
    title: "Specs",
    borderStyle: "rounded",
  });

  // Use scroll container primitives for scroll offset management
  const innerWidth = panel.width - 2;
  const viewportHeight = panel.height - 2;
  const clampedIndex = Math.max(0, Math.min(selectedIndex, items.length - 1));
  const scrollState = tui.scrollContainer.ensureVisible(
    tui.scrollContainer.createScrollState(items.length, viewportHeight),
    clampedIndex,
  );
  const range = tui.scrollContainer.visibleRange(scrollState);

  // Render visible items using the computed scroll range
  const lines: string[] = [];
  for (let vi = 0; vi < viewportHeight; vi++) {
    const idx = range.start + vi;
    const row = panel.y + 1 + vi;

    if (idx >= range.end || idx >= items.length) {
      lines.push(
        tui.ansi.moveTo(row, panel.x + 1) + " ".repeat(innerWidth),
      );
      continue;
    }

    const item = items[idx];
    if (item === undefined) {
      lines.push(
        tui.ansi.moveTo(row, panel.x + 1) + " ".repeat(innerWidth),
      );
      continue;
    }
    const isSelectable = item.selectable !== false;
    const selected = idx === selectedIndex && isSelectable;
    const bullet = item.active
      ? tui.ansi.green("\u25CF")
      : selected
      ? "\u25B8"
      : " ";
    const badge = item.badge !== undefined
      ? " " + colorize(`[${item.badge}]`, item.badgeColor ?? "dim")
      : "";
    const label = item.dimmed ? tui.ansi.dim(item.label) : item.label;
    const line = ` ${bullet} ${label}${badge}`;
    const truncated = tui.ansi.truncate(line, innerWidth);
    const pad = Math.max(0, innerWidth - tui.ansi.visibleLength(truncated));

    if (selected) {
      lines.push(
        tui.ansi.moveTo(row, panel.x + 1) +
          tui.ansi.inverse(truncated + " ".repeat(pad)),
      );
    } else {
      lines.push(
        tui.ansi.moveTo(row, panel.x + 1) + truncated + " ".repeat(pad),
      );
    }
  }

  // Render scrollbar using the scroll container primitive
  const computedPanel: tui.layoutTypes.ComputedPanel = {
    id: panel.id,
    x: panel.x,
    y: panel.y + 1,
    width: panel.width - 1,
    height: viewportHeight,
  };
  const scrollbar = tui.scrollContainer.renderScrollbar(
    computedPanel,
    scrollState,
  );

  return border + lines.join("") + scrollbar;
};
