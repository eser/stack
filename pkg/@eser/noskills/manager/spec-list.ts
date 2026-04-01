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
    DISCOVERY_REVIEW: "REVW",
    SPEC_DRAFT: "DRFT",
    SPEC_APPROVED: "APPR",
    EXECUTING: "EXEC",
    BLOCKED: "BLKD",
    COMPLETED: "DONE",
    IDLE: "IDLE",
    FREE: "FREE",
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

  // Separator + actions
  items.push({
    label: "\u2500".repeat(20),
    dimmed: true,
    selectable: false,
  });
  items.push({ label: "[n] New spec", badge: "+", badgeColor: "green" });
  items.push({ label: "[f] Free mode", badge: "~", badgeColor: "cyan" });

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
  const listContent = tui.list.renderList(items, selectedIndex, panel);
  return border + listContent;
};
