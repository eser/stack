// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Right-top panel — shows spec state, roadmap, progress.
 *
 * @module
 */

import * as tui from "@eser/shell/tui";
import type * as types from "./types.ts";

const ROADMAP_PHASES = [
  "IDLE",
  "DISCOVERY",
  "REVIEW",
  "DRAFT",
  "APPROVED",
  "EXECUTING",
  "DONE",
  "IDLE",
];

const buildRoadmap = (phase: string | null): string => {
  if (phase === null || phase === "IDLE") return "IDLE";
  const phaseMap: Record<string, string> = {
    DISCOVERY_REVIEW: "REVIEW",
    SPEC_DRAFT: "DRAFT",
    SPEC_APPROVED: "APPROVED",
    COMPLETED: "DONE",
  };
  const mapped = phaseMap[phase] ?? phase;
  return ROADMAP_PHASES.map((p) =>
    p === mapped ? tui.ansi.bold(`\u2726${p}\u2726`) : tui.ansi.dim(p)
  ).join("\u2192");
};

const buildProgressBar = (
  completed: number,
  total: number,
  width: number,
): string => {
  if (total === 0) return tui.ansi.dim("no tasks");
  const filled = Math.round((completed / total) * width);
  const empty = width - filled;
  return tui.ansi.green("\u2588".repeat(filled)) +
    tui.ansi.dim("\u2591".repeat(empty)) +
    ` ${completed}/${total}`;
};

export const render = (
  tab: types.ManagerTab | null,
  panel: tui.layout.Panel,
  taskInfo?: { completed: number; total: number },
): string => {
  const lines: string[] = [];

  if (tab === null) {
    lines.push(tui.ansi.bold("Mode: ") + tui.ansi.cyan("IDLE"));
    lines.push(tui.ansi.dim("No active spec"));
  } else if (tab.mode === "free") {
    lines.push(tui.ansi.bold("Mode: ") + tui.ansi.cyan("IDLE"));
    lines.push(tui.ansi.dim("No active spec"));
    lines.push("");
    lines.push(tui.ansi.dim(`Session: ${tab.sessionId}`));
  } else {
    lines.push(tui.ansi.bold("Spec: ") + (tab.spec ?? "unknown"));
    lines.push(tui.ansi.bold("Phase: ") + (tab.phase ?? "unknown"));
    lines.push("");
    lines.push(buildRoadmap(tab.phase));
    lines.push("");
    if (taskInfo !== undefined) {
      lines.push(
        tui.ansi.bold("Progress: ") +
          buildProgressBar(taskInfo.completed, taskInfo.total, 15),
      );
    }
    lines.push("");
    lines.push(tui.ansi.dim(`Session: ${tab.sessionId}`));
  }

  return tui.box.fillBox(
    {
      x: panel.x,
      y: panel.y,
      width: panel.width,
      height: panel.height,
      title: "Monitor",
      borderStyle: "rounded",
    },
    lines,
  );
};
