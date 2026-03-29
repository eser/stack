// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `noskills run` — Autonomous execution loop (Ralph loop).
 *
 * Wraps the EXECUTING phase in a bash-level loop. Each iteration spawns a
 * fresh `claude -p` process — no /clear needed because each process is born
 * with zero context. State persists in .eser/.state/state.json between
 * iterations.
 *
 * Usage:
 *   noskills run                              # default, pauses at BLOCKED
 *   noskills run --unattended                 # logs blocks, continues
 *   noskills run --max-iterations=20          # safety valve
 *   noskills run --max-turns=15               # turns per agent process
 *
 * Git rule: agents never touch git. If autoCommit is true in manifest,
 * the noskills CLI (this loop) commits after each accepted task — not
 * the agent.
 *
 * @module
 */

import * as results from "@eser/primitives/results";
import * as streams from "@eser/streams";
import * as span from "@eser/streams/span";
import type * as shellArgs from "@eser/shell/args";
import * as tui from "@eser/shell/tui";
import * as persistence from "../state/persistence.ts";
import * as machine from "../state/machine.ts";
import * as compiler from "../context/compiler.ts";
import * as syncEngine from "../sync/engine.ts";
import { cmd, cmdPrefix } from "../output/cmd.ts";
import { runtime } from "@eser/standards/cross-runtime";

export const main = async (
  args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  const root = runtime.process.cwd();
  const unattended = args?.includes("--unattended") ?? false;
  const maxTurns = parseFlag(args, "--max-turns") ?? 10;
  const maxIterations = parseFlag(args, "--max-iterations") ?? 50;

  if (!(await persistence.isInitialized(root))) {
    out.writeln(
      span.red(`noskills not initialized. Run: ${cmd("init")}`),
    );
    await out.close();

    return results.fail({ exitCode: 1 });
  }

  // Validate starting phase
  const specFlag = persistence.parseSpecFlag(args);
  const initialState = await persistence.resolveState(root, specFlag);

  if (
    initialState.phase !== "EXECUTING" &&
    initialState.phase !== "SPEC_APPROVED"
  ) {
    out.writeln(span.red(`Cannot run from phase: ${initialState.phase}`));
    out.writeln(
      span.dim("Must be in SPEC_APPROVED or EXECUTING to start."),
    );
    await out.close();

    return results.fail({ exitCode: 1 });
  }

  // If SPEC_APPROVED, transition to EXECUTING via library API
  if (initialState.phase === "SPEC_APPROVED") {
    out.writeln(span.dim("Starting execution from approved spec..."));
    const newState = machine.startExecution(initialState);
    await persistence.writeState(root, newState);
  }

  const config = await persistence.readManifest(root);

  if (config === null) {
    out.writeln(span.red("Config not found."));
    await out.close();

    return results.fail({ exitCode: 1 });
  }

  out.writeln(span.bold(`${cmdPrefix()} run`));
  out.writeln(
    span.dim(
      `Mode: ${
        unattended ? "unattended" : "interactive"
      }, max-turns: ${maxTurns}, max-iterations: ${maxIterations}`,
    ),
  );
  out.writeln("");

  // ==========================================================================
  // The Ralph Loop
  // ==========================================================================

  let loopIteration = 0;
  let exitCode = 0;

  while (loopIteration < maxIterations) {
    loopIteration++;

    // Read fresh state each iteration
    const state = await persistence.readState(root);

    // ── Exit: DONE ──
    if (state.phase === "DONE") {
      out.writeln("");
      out.writeln(span.green("✔"), " Spec completed!");
      out.writeln(`  Iterations: ${state.execution.iteration}`);
      out.writeln(`  Decisions:  ${state.decisions.length}`);
      break;
    }

    // ── Exit: BLOCKED ──
    if (state.phase === "BLOCKED") {
      const reason = state.execution.lastProgress ?? "Unknown";
      out.writeln("");
      out.writeln(
        span.yellow("⚠"),
        " Execution blocked: ",
        span.dim(reason),
      );

      if (unattended) {
        // Log to file and exit — user resolves later
        await logBlocked(root, reason, loopIteration);
        out.writeln(
          span.dim("Logged to .eser/.state/blocked.log. Resolve and re-run."),
        );
        exitCode = 1;
        break;
      }

      // Interactive: prompt for resolution via tui.text
      const tuiCtx = tui.createTuiContext();
      const resolution = await tui.text(tuiCtx, {
        message: "Enter resolution (or leave empty to stop):",
      });

      if (tui.isCancel(resolution) || resolution === "") {
        out.writeln(span.dim("Stopped by user."));
        break;
      }

      // Submit resolution via library API (not shell)
      const unblocked = machine.transition(state, "EXECUTING");
      await persistence.writeState(root, {
        ...unblocked,
        execution: {
          ...unblocked.execution,
          lastProgress: `Resolved: ${resolution}`,
        },
      });

      continue;
    }

    // ── Exit: unexpected phase ──
    if (state.phase !== "EXECUTING") {
      out.writeln(span.red(`Unexpected phase: ${state.phase}. Stopping.`));
      exitCode = 1;
      break;
    }

    // ── Build agent prompt from compiler output ──
    const allConcerns = await persistence.listConcerns(root);
    const activeConcerns = allConcerns.filter((c) =>
      config.concerns.includes(c.id)
    );
    const rules = await syncEngine.loadRules(root);
    const output = compiler.compile(state, activeConcerns, rules, config);

    const prompt = buildAgentPrompt(output);

    // ── Log iteration ──
    out.writeln(
      span.cyan(`── Iteration ${loopIteration}`),
      span.dim(
        ` (execution: ${state.execution.iteration}, debt: ${
          state.execution.debt?.items.length ?? 0
        })`,
      ),
    );

    if (state.execution.lastProgress !== null) {
      out.writeln(span.dim(`  Last: ${state.execution.lastProgress}`));
    }

    if (state.execution.lastVerification?.passed === false) {
      out.writeln(span.red("  Verification failed — agent will fix"));
    }

    if (state.execution.debt !== null) {
      out.writeln(
        span.yellow(`  Debt: ${state.execution.debt.items.length} items`),
      );
    }

    // ── Spawn fresh claude process ──
    out.writeln(span.dim("  Spawning agent..."));

    try {
      const shellExec = await import("@eser/shell/exec");
      await shellExec
        .exec`claude -p ${prompt} --max-turns ${
        String(maxTurns)
      } --output-format json`
        .noThrow()
        .text();
    } catch {
      out.writeln(span.red("  Failed to spawn claude CLI. Is it installed?"));
      exitCode = 1;
      break;
    }

    // Stop hook fires automatically on claude exit, updating state.json
    out.writeln(span.dim("  Agent exited. Stop hook captured state."));

    // ── Auto-commit if configured (CLI commits, not agent) ──
    const freshState = await persistence.readState(root);

    if (
      (config as Record<string, unknown>)["autoCommit"] === true &&
      config.allowGit !== false
    ) {
      try {
        const shellExec = await import("@eser/shell/exec");
        const diffOutput = await shellExec
          .exec`git diff --name-only`
          .noThrow()
          .text();

        if (diffOutput.trim().length > 0) {
          await shellExec.exec`git add -A`.noThrow().text();
          const msg =
            `noskills: iteration ${freshState.execution.iteration} — ${
              freshState.execution.lastProgress ?? "progress"
            }`;
          await shellExec
            .exec`git commit -m ${msg}`
            .noThrow()
            .text();
          out.writeln(span.dim("  Auto-committed."));
        }
      } catch {
        out.writeln(span.dim("  Auto-commit failed (non-fatal)."));
      }
    }
  }

  // ── Safety valve ──
  if (loopIteration >= maxIterations) {
    out.writeln("");
    out.writeln(
      span.yellow("⚠"),
      ` Max iterations (${maxIterations}) reached. Stopping.`,
    );
    exitCode = 2;
  }

  await out.close();

  if (exitCode !== 0) {
    return results.fail({ exitCode });
  }

  return results.ok(undefined);
};

// =============================================================================
// Agent Prompt Builder
// =============================================================================

const buildAgentPrompt = (
  output: compiler.NextOutput,
): string => {
  const lines: string[] = [];

  // Resume context
  lines.push(output.meta.resumeHint);
  lines.push("");

  // Spec reference
  if (output.meta.spec !== null) {
    lines.push(`Working on spec: ${output.meta.spec}`);
    lines.push("");
  }

  // Main instruction
  if ("instruction" in output) {
    lines.push(output.instruction as string);
    lines.push("");
  }

  // Debt carry-forward
  if ("previousIterationDebt" in output) {
    const debt = (output as compiler.ExecutionOutput).previousIterationDebt;
    if (debt !== undefined) {
      lines.push(`DEBT from iteration ${debt.fromIteration} (address first):`);
      for (const item of debt.items) {
        lines.push(`- ${item}`);
      }
      lines.push("");
    }
  }

  // Status report request
  if ("statusReportRequired" in output) {
    const sr = (output as compiler.ExecutionOutput).statusReport;
    if (sr !== undefined) {
      lines.push("Report against these acceptance criteria:");
      for (const c of sr.criteria) {
        lines.push(`- ${c}`);
      }
      lines.push("");
    }
  }

  // Verification failure details
  if ("verificationFailed" in output && output.verificationFailed === true) {
    lines.push("Test output:");
    lines.push(
      ("verificationOutput" in output ? output.verificationOutput : "") ?? "",
    );
    lines.push("");
  }

  // Behavioral rules
  if (output.behavioral.rules.length > 0) {
    lines.push("Rules:");
    for (const r of output.behavioral.rules) {
      lines.push(`- ${r}`);
    }
    lines.push("");
  }

  // Concern reminders
  if ("context" in output) {
    const ctx = (output as { context: compiler.ContextBlock }).context;
    if (ctx.concernReminders.length > 0) {
      lines.push("Reminders:");
      for (const r of ctx.concernReminders) {
        lines.push(`- ${r}`);
      }
      lines.push("");
    }
  }

  // Protocol footer
  const prefix = cmdPrefix();
  lines.push(
    `When done, report progress: ${prefix} next --answer="your progress"`,
  );
  lines.push(`If blocked, run: ${prefix} block "reason"`);
  lines.push(`When all tasks are complete: ${prefix} done`);

  return lines.join("\n");
};

// =============================================================================
// Helpers
// =============================================================================

const parseFlag = (
  args: readonly string[] | undefined,
  flag: string,
): number | null => {
  if (args === undefined) return null;
  const prefix = `${flag}=`;

  for (const arg of args) {
    if (arg.startsWith(prefix)) {
      const n = parseInt(arg.slice(prefix.length), 10);
      if (!isNaN(n) && n > 0) return n;
    }
  }

  return null;
};

const logBlocked = async (
  root: string,
  reason: string,
  iteration: number,
): Promise<void> => {
  const logFile = `${root}/.eser/.state/blocked.log`;
  const entry = `[${
    new Date().toISOString()
  }] iteration=${iteration} reason=${reason}\n`;

  try {
    const { appendFileSync, mkdirSync } = await import("node:fs");
    const { dirname } = await import("node:path");
    mkdirSync(dirname(logFile), { recursive: true });
    appendFileSync(logFile, entry);
  } catch {
    // best effort
  }
};
