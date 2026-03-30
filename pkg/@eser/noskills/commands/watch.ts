// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `noskills watch` — Live dashboard for monitoring agent progress.
 *
 * Completely read-only. Zero LLM interaction. Everything derived from
 * filesystem state. Opens in another terminal while agent works.
 *
 * @module
 */

import * as results from "@eser/primitives/results";
import type * as shellArgs from "@eser/shell/args";
import type * as schema from "../state/schema.ts";
import * as persistence from "../state/persistence.ts";
import * as specParser from "../spec/parser.ts";
import * as formatter from "../output/formatter.ts";
import { runtime } from "@eser/standards/cross-runtime";

// =============================================================================
// Watch snapshot — everything we display, derived from files
// =============================================================================

export type SpecSnapshot = {
  readonly name: string;
  readonly phase: schema.Phase;
  readonly iteration: number;
};

export type WatchSnapshot = {
  readonly spec: string | null;
  readonly phase: schema.Phase;
  readonly iteration: number;
  readonly activeTaskId: string | null;
  readonly activeTaskTitle: string | null;
  readonly totalTasks: number;
  readonly completedTaskCount: number;
  readonly lastProgress: string | null;
  readonly lastCalledAt: string | null;
  readonly modifiedFiles: readonly string[];
  readonly debt: {
    readonly items: readonly schema.DebtItem[];
    readonly fromIteration: number;
  } | null;
  readonly concerns: readonly string[];
  readonly maxIterations: number;
  readonly awaitingStatusReport: boolean;
  readonly verificationPassed: boolean | null;
  readonly decisionsCount: number;
  readonly discoveryAnswered: number;
  readonly discoveryTotal: number;
  readonly trackedFiles: readonly string[];
  readonly timeSinceUpdate: number | null;
  readonly allSpecs: readonly SpecSnapshot[];
};

// =============================================================================
// Build snapshot from filesystem
// =============================================================================

const buildSnapshot = async (
  root: string,
): Promise<WatchSnapshot> => {
  const state = await persistence.readState(root);
  const config = await persistence.readManifest(root);

  // Read tracked files from hook log
  const trackedFiles = await readTrackedFiles(root);

  // Parse spec to get task info
  let activeTaskId: string | null = null;
  let activeTaskTitle: string | null = null;
  let totalTasks = 0;
  let completedTaskCount = 0;

  if (state.spec !== null) {
    const parsed = await specParser.parseSpec(root, state.spec);

    if (parsed !== null) {
      totalTasks = parsed.tasks.length;
      completedTaskCount = state.execution.completedTasks.length;
      const nextTask = specParser.findNextTask(
        parsed.tasks,
        state.execution.completedTasks,
      );

      if (nextTask !== null) {
        activeTaskId = nextTask.id;
        activeTaskTitle = nextTask.title;
      }
    }
  }

  // Compute time since last update
  let timeSinceUpdate: number | null = null;
  if (state.lastCalledAt !== null) {
    timeSinceUpdate = Math.floor(
      (Date.now() - new Date(state.lastCalledAt).getTime()) / 1000,
    );
  }

  // Collect all specs for multi-spec dashboard
  const specStates = await persistence.listSpecStates(root);
  const allSpecs: SpecSnapshot[] = specStates.map((ss) => ({
    name: ss.name,
    phase: ss.state.phase,
    iteration: ss.state.execution.iteration,
  }));

  return {
    spec: state.spec,
    phase: state.phase,
    iteration: state.execution.iteration,
    activeTaskId,
    activeTaskTitle,
    totalTasks,
    completedTaskCount,
    lastProgress: state.execution.lastProgress,
    lastCalledAt: state.lastCalledAt,
    modifiedFiles: state.execution.modifiedFiles,
    debt: state.execution.debt,
    concerns: config?.concerns ?? [],
    maxIterations: config?.maxIterationsBeforeRestart ?? 15,
    awaitingStatusReport: state.execution.awaitingStatusReport,
    verificationPassed: state.execution.lastVerification?.passed ?? null,
    decisionsCount: state.decisions.length,
    discoveryAnswered: state.discovery.answers.length,
    discoveryTotal: 6,
    trackedFiles,
    timeSinceUpdate,
    allSpecs,
  };
};

const readTrackedFiles = async (root: string): Promise<readonly string[]> => {
  const logFile = `${root}/.eser/.state/files-changed.jsonl`;

  try {
    const content = await runtime.fs.readTextFile(logFile);
    const lines = content.trim().split("\n").filter(Boolean);
    const files: string[] = [];

    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as { file: string };
        if (!files.includes(entry.file)) {
          files.push(entry.file);
        }
      } catch {
        // skip malformed lines
      }
    }

    return files;
  } catch {
    return [];
  }
};

// =============================================================================
// Terminal renderer (ANSI)
// =============================================================================

const CLEAR = "\x1b[2J\x1b[H";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";

const phaseColor = (phase: string): string => {
  switch (phase) {
    case "COMPLETED":
      return GREEN;
    case "BLOCKED":
      return RED;
    case "EXECUTING":
      return CYAN;
    default:
      return YELLOW;
  }
};

const progressBar = (current: number, total: number, width: number): string => {
  if (total === 0) return "░".repeat(width);
  const ratio = Math.min(current / total, 1); // clamp to 100%
  const filled = Math.round(ratio * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
};

const formatTime = (seconds: number | null): string => {
  if (seconds === null) return "never";
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
};

/** Pad text to fit within a box cell, stripping ANSI for length calc. */
// deno-lint-ignore no-control-regex
const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, "");
const padCell = (text: string, w: number): string => {
  const visible = stripAnsi(text).length;
  return text + " ".repeat(Math.max(0, w - visible));
};

const renderTerminal = (snap: WatchSnapshot): string => {
  const lines: string[] = [];
  const w = 54;
  const border = "─".repeat(w);
  const row = (content: string): string =>
    `${DIM}│${RESET}  ${padCell(content, w - 2)}${DIM}│${RESET}`;
  const blank = (): string => `${DIM}│${"".padEnd(w)}│${RESET}`;

  lines.push(`${DIM}╭${border}╮${RESET}`);
  lines.push(row(`${BOLD}noskills watch${RESET}`));
  lines.push(blank());

  // ── Per-spec summary rows ──
  lines.push(row(`${BOLD}Specs:${RESET}`));

  if (snap.allSpecs.length > 0) {
    for (const s of snap.allSpecs) {
      const pc = phaseColor(s.phase);
      const nameCol = s.name.slice(0, 18).padEnd(18);
      const phaseCol = `${pc}${s.phase}${RESET}`.padEnd(
        s.phase.length + 10,
      );

      if (
        s.phase === "EXECUTING" || s.phase === "BLOCKED"
      ) {
        // Show inline progress bar for executing specs
        const bar = progressBar(snap.completedTaskCount, snap.totalTasks, 10);
        const pct = snap.totalTasks > 0
          ? Math.round((snap.completedTaskCount / snap.totalTasks) * 100)
          : 0;
        lines.push(
          row(
            `  ${nameCol} ${phaseCol} ${bar} ${snap.completedTaskCount}/${snap.totalTasks} (${pct}%)`,
          ),
        );
      } else if (s.phase === "COMPLETED") {
        lines.push(
          row(`  ${nameCol} ${phaseCol} done`),
        );
      } else {
        lines.push(
          row(`  ${nameCol} ${phaseCol}`),
        );
      }
    }
  } else if (snap.spec !== null) {
    // Fallback: single spec from main state
    const pc = phaseColor(snap.phase);
    lines.push(row(`  ${snap.spec}  ${pc}${snap.phase}${RESET}`));
  } else {
    lines.push(row(`  ${DIM}No specs yet${RESET}`));
  }

  lines.push(blank());

  // ── Detail block for the primary spec ──
  // Phase-specific content
  if (snap.phase === "DISCOVERY" || snap.phase === "DISCOVERY_REVIEW") {
    lines.push(
      row(
        `Phase: ${
          phaseColor(snap.phase)
        }${snap.phase}${RESET}  Discovery: ${snap.discoveryAnswered}/${snap.discoveryTotal} questions answered`,
      ),
    );
  } else if (snap.phase === "SPEC_DRAFT") {
    lines.push(
      row(
        `Phase: ${YELLOW}${snap.phase}${RESET}  ${YELLOW}Awaiting approval${RESET}`,
      ),
    );
  } else if (snap.phase === "SPEC_APPROVED") {
    lines.push(
      row(
        `Phase: ${YELLOW}${snap.phase}${RESET}  ${GREEN}Ready to start${RESET}`,
      ),
    );
  } else if (snap.phase === "EXECUTING" || snap.phase === "BLOCKED") {
    if (snap.spec !== null) {
      lines.push(
        row(
          `${BOLD}${snap.spec}${RESET} (iteration ${snap.iteration}):`,
        ),
      );
    }

    // Active task
    if (snap.activeTaskId !== null) {
      const taskLine = `${snap.activeTaskId}${
        snap.activeTaskTitle !== null ? ` (${snap.activeTaskTitle})` : ""
      }`;
      lines.push(
        row(`  Active task: ${CYAN}${taskLine.slice(0, w - 18)}${RESET}`),
      );
    }

    // Progress bar
    const bar = progressBar(snap.completedTaskCount, snap.totalTasks, 12);
    const pct = snap.totalTasks > 0
      ? Math.round((snap.completedTaskCount / snap.totalTasks) * 100)
      : 0;
    lines.push(
      row(
        `  Progress: ${GREEN}${bar} ${snap.completedTaskCount}/${snap.totalTasks} tasks (${pct}%)${RESET}`,
      ),
    );
    lines.push(row(`  Iteration: ${snap.iteration}`));

    // Last update + progress
    lines.push(row(`  Last update: ${formatTime(snap.timeSinceUpdate)}`));
    if (snap.lastProgress !== null) {
      lines.push(
        row(`  ${DIM}${snap.lastProgress.slice(0, w - 4)}${RESET}`),
      );
    }

    if (snap.phase === "BLOCKED") {
      const reason = (snap.lastProgress ?? "unknown").replace(
        /^BLOCKED:\s*/,
        "",
      );
      lines.push(
        row(`  ${RED}BLOCKED: ${reason.slice(0, w - 14)}${RESET}`),
      );
      lines.push(row(`  ${YELLOW}Human input needed${RESET}`));
    }

    // Status flags
    if (snap.awaitingStatusReport) {
      lines.push(row(`  ${YELLOW}Status report pending${RESET}`));
    }
    if (snap.verificationPassed === false) {
      lines.push(row(`  ${RED}Verification failed${RESET}`));
    }

    lines.push(blank());

    // Debt
    if (snap.debt !== null && snap.debt.items.length > 0) {
      lines.push(row(`  Debt: ${snap.debt.items.length} item(s)`));
      for (const item of snap.debt.items.slice(0, 3)) {
        lines.push(row(`   └─ ${item.text.slice(0, w - 10)}`));
      }
      if (snap.debt.items.length > 3) {
        lines.push(
          row(`   └─ ... and ${snap.debt.items.length - 3} more`),
        );
      }
    }

    // Files changed
    if (snap.trackedFiles.length > 0 || snap.modifiedFiles.length > 0) {
      const files = snap.trackedFiles.length > 0
        ? snap.trackedFiles
        : snap.modifiedFiles;
      lines.push(row(`  Files changed: ${files.length}`));
      for (const f of files.slice(0, 5)) {
        const short = f.length > w - 10 ? "..." + f.slice(-(w - 13)) : f;
        lines.push(row(`   └─ ${short}`));
      }
      if (files.length > 5) {
        lines.push(row(`   └─ ... and ${files.length - 5} more`));
      }
    }
  } else if (snap.phase === "COMPLETED") {
    lines.push(
      row(
        `${GREEN}Complete!${RESET} ${snap.iteration} iterations, ${snap.decisionsCount} decisions`,
      ),
    );
  } else if (snap.phase === "FREE") {
    lines.push(row(`${DIM}Free mode — no enforcement${RESET}`));
  } else if (snap.phase === "IDLE") {
    lines.push(row(`${DIM}No active work${RESET}`));
  }

  lines.push(blank());

  // ── Footer: concerns + context ──
  if (snap.concerns.length > 0) {
    lines.push(
      row(`Concerns: ${snap.concerns.join(", ").slice(0, w - 14)}`),
    );
  }

  const ctxWarn = snap.iteration >= snap.maxIterations
    ? `${RED}RESTART RECOMMENDED${RESET}`
    : `${GREEN}ok${RESET} (${snap.iteration}/${snap.maxIterations})`;
  lines.push(row(`Context: ${ctxWarn}`));

  lines.push(`${DIM}╰${border}╯${RESET}`);
  lines.push(
    `  ${DIM}watching .eser/.state/ ... ctrl+c to stop${RESET}`,
  );

  return lines.join("\n");
};

// =============================================================================
// JSON line renderer
// =============================================================================

const renderJsonLine = (snap: WatchSnapshot): string => {
  return JSON.stringify({
    ts: new Date().toISOString(),
    phase: snap.phase,
    spec: snap.spec,
    iteration: snap.iteration,
    activeTask: snap.activeTaskId,
    tasks: { completed: snap.completedTaskCount, total: snap.totalTasks },
    progress: snap.lastProgress,
    debt: snap.debt?.items.length ?? 0,
    filesChanged: snap.trackedFiles.length > 0
      ? snap.trackedFiles
      : snap.modifiedFiles,
    timeSinceUpdate: snap.timeSinceUpdate,
    verificationPassed: snap.verificationPassed,
  });
};

// =============================================================================
// Main command
// =============================================================================

export const main = async (
  args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const root = runtime.process.cwd();
  // Watch defaults to terminal dashboard (not JSON like other commands).
  // Only use JSON/markdown when explicitly requested via -o flag.
  const hasExplicitFormat = args !== undefined &&
    args.some((a) => a === "-o" || a.startsWith("--output"));
  const fmt = hasExplicitFormat ? formatter.parseOutputFormat(args) : "ansi";

  if (!(await persistence.isInitialized(root))) {
    const encoder = new TextEncoder();
    const writer = runtime.process.stdout.getWriter();
    await writer.write(
      encoder.encode("noskills not initialized.\n"),
    );
    writer.releaseLock();

    return results.fail({ exitCode: 1 });
  }

  const stateDir = `${root}/.eser/.state`;

  // Initial render
  let lastRender = "";
  const render = async (): Promise<boolean> => {
    const snap = await buildSnapshot(root);
    const output = fmt === "json"
      ? renderJsonLine(snap)
      : fmt === "markdown"
      ? formatter.format(snap, "markdown")
      : renderTerminal(snap);

    if (fmt === "json") {
      // JSON line mode: emit one line per change
      const encoder = new TextEncoder();
      const writer = runtime.process.stdout.getWriter();
      await writer.write(encoder.encode(output + "\n"));
      writer.releaseLock();
    } else if (fmt === "markdown") {
      const encoder = new TextEncoder();
      const writer = runtime.process.stdout.getWriter();
      await writer.write(encoder.encode(output + "\n---\n"));
      writer.releaseLock();
    } else {
      // Terminal mode: clear and redraw
      if (output !== lastRender) {
        const encoder = new TextEncoder();
        const writer = runtime.process.stdout.getWriter();
        await writer.write(encoder.encode(CLEAR + output + "\n"));
        writer.releaseLock();
        lastRender = output;
      }
    }

    // Auto-exit when ALL specs are COMPLETED (nothing left to watch)
    const allDone = snap.allSpecs.length > 0 &&
      snap.allSpecs.every((s) => s.phase === "COMPLETED");
    return allDone ||
      (snap.allSpecs.length === 0 && snap.phase === "COMPLETED");
  };

  // Initial render
  const done = await render();
  if (done) return results.ok(undefined);

  // Watch loop using polling (cross-runtime compatible)
  const POLL_MS = 1000;
  let lastMtime = 0;

  while (true) {
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));

    // Check if state file changed
    try {
      const stat = await runtime.fs.stat(`${stateDir}/state.json`);
      const mtime = stat.mtime?.getTime() ?? 0;

      if (mtime > lastMtime) {
        lastMtime = mtime;

        // Debounce: wait 200ms for rapid changes to settle
        await new Promise((resolve) => setTimeout(resolve, 200));

        const isDone = await render();
        if (isDone) break;
      }
    } catch {
      // state file not readable — keep polling
    }
  }

  return results.ok(undefined);
};

// =============================================================================
// Exported for testing
// =============================================================================

export { buildSnapshot, renderJsonLine, renderTerminal };
export type { WatchSnapshot as _WatchSnapshot };
