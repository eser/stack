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
    readonly items: readonly string[];
    readonly fromIteration: number;
  } | null;
  readonly concerns: readonly string[];
  readonly maxIterations: number;
  readonly awaitingStatusReport: boolean;
  readonly pendingClear: boolean;
  readonly verificationPassed: boolean | null;
  readonly decisionsCount: number;
  readonly discoveryAnswered: number;
  readonly discoveryTotal: number;
  readonly trackedFiles: readonly string[];
  readonly timeSinceUpdate: number | null;
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
    pendingClear: state.pendingClear,
    verificationPassed: state.execution.lastVerification?.passed ?? null,
    decisionsCount: state.decisions.length,
    discoveryAnswered: state.discovery.answers.length,
    discoveryTotal: 6,
    trackedFiles,
    timeSinceUpdate,
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
    case "DONE":
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

const renderTerminal = (snap: WatchSnapshot): string => {
  const lines: string[] = [];
  const w = 52;
  const border = "─".repeat(w);

  lines.push(`${DIM}╭${border}╮${RESET}`);
  lines.push(
    `${DIM}│${RESET}  ${BOLD}noskills watch${RESET} — ${
      snap.spec ?? "no active spec"
    }${DIM}${
      " ".repeat(Math.max(0, w - 18 - (snap.spec?.length ?? 15)))
    }│${RESET}`,
  );

  // Phase
  const pc = phaseColor(snap.phase);
  lines.push(
    `${DIM}│${RESET}  Phase: ${pc}${snap.phase}${RESET}${
      " ".repeat(Math.max(0, w - 10 - snap.phase.length))
    }${DIM}│${RESET}`,
  );

  // Phase-specific content
  if (snap.phase === "DISCOVERY") {
    lines.push(
      `${DIM}│${RESET}  Discovery: ${snap.discoveryAnswered}/${snap.discoveryTotal} questions answered${
        " ".repeat(Math.max(0, w - 38))
      }${DIM}│${RESET}`,
    );
  } else if (snap.phase === "SPEC_DRAFT") {
    lines.push(
      `${DIM}│${RESET}  ${YELLOW}Awaiting approval${RESET}${
        " ".repeat(Math.max(0, w - 19))
      }${DIM}│${RESET}`,
    );
  } else if (snap.phase === "EXECUTING" || snap.phase === "BLOCKED") {
    // Progress bar: completed / total tasks
    const bar = progressBar(snap.completedTaskCount, snap.totalTasks, 12);
    const pct = snap.totalTasks > 0
      ? Math.round((snap.completedTaskCount / snap.totalTasks) * 100)
      : 0;
    const progLine =
      `${bar} ${snap.completedTaskCount}/${snap.totalTasks} tasks (${pct}%)`;
    lines.push(
      `${DIM}│${RESET}  Progress: ${GREEN}${progLine}${RESET}${
        " ".repeat(Math.max(0, w - 12 - progLine.length))
      }${DIM}│${RESET}`,
    );
    lines.push(
      `${DIM}│${RESET}  Iteration: ${snap.iteration}${
        " ".repeat(Math.max(0, w - 14 - String(snap.iteration).length))
      }${DIM}│${RESET}`,
    );

    // Active task
    if (snap.activeTaskId !== null) {
      const taskLine = `${snap.activeTaskId}${
        snap.activeTaskTitle !== null ? ` (${snap.activeTaskTitle})` : ""
      }`;
      const truncTask = taskLine.slice(0, w - 16);
      lines.push(
        `${DIM}│${RESET}  Active task: ${CYAN}${truncTask}${RESET}${
          " ".repeat(Math.max(0, w - 16 - truncTask.length))
        }${DIM}│${RESET}`,
      );
    }

    if (snap.phase === "BLOCKED") {
      const reason = (snap.lastProgress ?? "unknown").replace(
        /^BLOCKED:\s*/,
        "",
      );
      lines.push(
        `${DIM}│${RESET}  ${RED}BLOCKED: ${reason.slice(0, w - 12)}${RESET}${
          " ".repeat(Math.max(0, w - 12 - reason.slice(0, w - 12).length))
        }${DIM}│${RESET}`,
      );
      lines.push(
        `${DIM}│${RESET}  ${YELLOW}Human input needed${RESET}${
          " ".repeat(Math.max(0, w - 20))
        }${DIM}│${RESET}`,
      );
    }
  } else if (snap.phase === "DONE") {
    lines.push(
      `${DIM}│${RESET}  ${GREEN}Complete!${RESET} ${snap.iteration} iterations, ${snap.decisionsCount} decisions${
        " ".repeat(
          Math.max(
            0,
            w - 35 - String(snap.iteration).length -
              String(snap.decisionsCount).length,
          ),
        )
      }${DIM}│${RESET}`,
    );
  }

  lines.push(`${DIM}│${"".padEnd(w)}│${RESET}`);

  // Last update
  lines.push(
    `${DIM}│${RESET}  Last update: ${formatTime(snap.timeSinceUpdate)}${
      " ".repeat(Math.max(0, w - 16 - formatTime(snap.timeSinceUpdate).length))
    }${DIM}│${RESET}`,
  );

  // Last progress
  if (snap.lastProgress !== null) {
    const prog = snap.lastProgress.slice(0, w - 4);
    lines.push(
      `${DIM}│${RESET}  ${DIM}${prog}${RESET}${
        " ".repeat(Math.max(0, w - 2 - prog.length))
      }${DIM}│${RESET}`,
    );
  }

  // Status flags
  if (snap.awaitingStatusReport) {
    lines.push(
      `${DIM}│${RESET}  ${YELLOW}Status report pending${RESET}${
        " ".repeat(Math.max(0, w - 23))
      }${DIM}│${RESET}`,
    );
  }
  if (snap.pendingClear) {
    lines.push(
      `${DIM}│${RESET}  ${YELLOW}/clear pending${RESET}${
        " ".repeat(Math.max(0, w - 16))
      }${DIM}│${RESET}`,
    );
  }
  if (snap.verificationPassed === false) {
    lines.push(
      `${DIM}│${RESET}  ${RED}Verification failed${RESET}${
        " ".repeat(Math.max(0, w - 21))
      }${DIM}│${RESET}`,
    );
  }

  lines.push(`${DIM}│${"".padEnd(w)}│${RESET}`);

  // Debt
  if (snap.debt !== null && snap.debt.items.length > 0) {
    lines.push(
      `${DIM}│${RESET}  Debt: ${snap.debt.items.length} item(s)${
        " ".repeat(Math.max(0, w - 18))
      }${DIM}│${RESET}`,
    );
    for (const item of snap.debt.items.slice(0, 3)) {
      const truncated = item.slice(0, w - 8);
      lines.push(
        `${DIM}│${RESET}   └─ ${truncated}${
          " ".repeat(Math.max(0, w - 6 - truncated.length))
        }${DIM}│${RESET}`,
      );
    }
    if (snap.debt.items.length > 3) {
      lines.push(
        `${DIM}│${RESET}   └─ ... and ${snap.debt.items.length - 3} more${
          " ".repeat(Math.max(0, w - 20))
        }${DIM}│${RESET}`,
      );
    }
  }

  // Files changed
  if (snap.trackedFiles.length > 0 || snap.modifiedFiles.length > 0) {
    const files = snap.trackedFiles.length > 0
      ? snap.trackedFiles
      : snap.modifiedFiles;
    lines.push(
      `${DIM}│${RESET}  Files changed: ${files.length}${
        " ".repeat(Math.max(0, w - 18 - String(files.length).length))
      }${DIM}│${RESET}`,
    );
    for (const f of files.slice(0, 5)) {
      const short = f.length > w - 8 ? "..." + f.slice(-(w - 11)) : f;
      lines.push(
        `${DIM}│${RESET}   └─ ${short}${
          " ".repeat(Math.max(0, w - 6 - short.length))
        }${DIM}│${RESET}`,
      );
    }
    if (files.length > 5) {
      lines.push(
        `${DIM}│${RESET}   └─ ... and ${files.length - 5} more${
          " ".repeat(Math.max(0, w - 20))
        }${DIM}│${RESET}`,
      );
    }
  }

  lines.push(`${DIM}│${"".padEnd(w)}│${RESET}`);

  // Concerns + context warning
  if (snap.concerns.length > 0) {
    const cl = snap.concerns.join(", ").slice(0, w - 14);
    lines.push(
      `${DIM}│${RESET}  Concerns: ${cl}${
        " ".repeat(Math.max(0, w - 12 - cl.length))
      }${DIM}│${RESET}`,
    );
  }

  const ctxWarn = snap.iteration >= snap.maxIterations
    ? `${RED}RESTART RECOMMENDED${RESET}`
    : `${GREEN}ok${RESET} (${snap.iteration}/${snap.maxIterations})`;
  lines.push(
    `${DIM}│${RESET}  Context: ${ctxWarn}${
      " ".repeat(
        Math.max(
          0,
          w - 11 -
            // deno-lint-ignore no-control-regex
            ctxWarn.replace(/\x1b\[[0-9;]*m/g, "").length,
        ),
      )
    }${DIM}│${RESET}`,
  );

  lines.push(`${DIM}╰${border}╯${RESET}`);
  lines.push(
    `  ${DIM}watching .eser/.state/ for changes... (ctrl+c to stop)${RESET}`,
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
    pendingClear: snap.pendingClear,
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
  const fmt = formatter.parseOutputFormat(args);

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

    return snap.phase === "DONE";
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

        // Debounce: wait 100ms for rapid changes to settle
        await new Promise((resolve) => setTimeout(resolve, 100));

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
