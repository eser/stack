// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `noskills run` — Autonomous execution loop (Ralph loop).
 *
 * Wraps the EXECUTING phase in a loop. Each iteration runs one agent turn in a
 * fresh process — no /clear needed because each process is born with zero
 * context. State persists in .eser/.state/progresses/state.json between
 * iterations.
 *
 * The turn goes through the ai package's claude-code provider, which uses the
 * ACP-backed Go bridge when the `eser-acp` shim is on PATH and the pure
 * TypeScript adapter otherwise. Either way the loop learns the turn's outcome
 * in band and records the iteration itself, rather than discarding the output
 * and hoping Claude Code's Stop hook wrote state.json for it.
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

import * as results from "@eserstack/primitives/results";
import * as streams from "@eserstack/streams";
import * as span from "@eserstack/streams/span";
import type * as shellArgs from "@eserstack/shell/args";
import * as tui from "@eserstack/shell/tui";
import * as persistence from "../state/persistence.ts";
import * as machine from "../state/machine.ts";
import * as iteration from "../state/iteration.ts";
import * as compiler from "../context/compiler.ts";
import * as syncEngine from "../sync/engine.ts";
import { cmd, cmdPrefix } from "../output/cmd.ts";

// The agent model for one loop iteration. Matches the `ai ask` default for
// claude-code so the two entry points do not silently diverge.
const AGENT_MODEL = "claude-sonnet-5";

export const main = async (
  args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  const { root } = await persistence.resolveProjectRoot();
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

  // Claim iteration recording for this loop before the first turn.
  //
  // Written into state.json rather than passed as an environment variable: the
  // agent is reached through the FFI bridge, whose Go library caches its
  // environment at load, so a variable exported now would not reach the process
  // that needs to read it. The hook reads state.json regardless.
  await iteration.setDriver(root, "acp");

  try {
    while (loopIteration < maxIterations) {
      loopIteration++;

      // Read fresh state each iteration
      const state = await persistence.readState(root);

      // ── Exit: COMPLETED ──
      if (state.phase === "COMPLETED") {
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
            span.dim(
              "Logged to .eser/.state/progresses/blocked.log. Resolve and re-run.",
            ),
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
      const hints = syncEngine.resolveInteractionHints(config.tools);
      const output = await compiler.compile(
        state,
        activeConcerns,
        rules,
        config,
        undefined,
        undefined,
        undefined,
        hints,
      );

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

      // The turn runs through the ai package's claude-code provider rather than a
      // raw `claude -p` shell-out.
      //
      // factoryFor picks the ACP-backed Go bridge when the `eser-acp` shim is on
      // PATH and the pure-TypeScript adapter otherwise, so this is strictly better
      // where the shim exists and unchanged where it does not. Both paths run the
      // same vendor binary in the same non-interactive mode -- the shim spawns
      // `claude --print --output-format stream-json`, and `-p` IS `--print` -- so
      // the agent behaves identically and its own hooks still fire. What changes
      // is that the turn's outcome comes back IN BAND.
      //
      // That is the point. This loop used to discard stdout entirely and learn
      // what happened only by re-reading state.json, which the Stop hook was
      // expected to have written. Nothing verified that it had. With the hook
      // absent or misconfigured the state never moved, the same prompt was rebuilt
      // and re-sent, and the loop burned every one of maxIterations before exiting
      // "Max iterations reached" -- never reporting the actual fault.
      let stopReason: string;

      try {
        // Imported from the package's declared entry points. `./registry` and
        // `./content` are NOT in the ai package's exports map, so importing them
        // directly threw ERR_PACKAGE_PATH_NOT_EXPORTED at runtime on Deno AND
        // Node -- and `deno check` did not notice, because type resolution and
        // runtime module resolution disagree here.
        const [ai, adapters] = await Promise.all([
          import("@eserstack/ai/mod"),
          import("@eserstack/ai/adapters"),
        ]);

        const factory = await adapters.factoryFor("claude-code");

        if (factory === undefined) {
          throw new Error("no claude-code provider available");
        }

        const registry = new ai.Registry({ factories: [factory] });

        await registry.addModel("default", {
          provider: "claude-code",
          // A real id, not "". The TypeScript adapter builds `--model` from
          // this value, so an empty string spawned `claude --model ` with a
          // dangling flag and exited 1.
          model: AGENT_MODEL,
          // maxTurns was already a flag on this command and cwd keeps the agent
          // rooted at the project rather than wherever the loop was launched from.
          properties: { maxTurns, cwd: root },
        });

        const model = registry.getDefault();

        if (model === null) {
          throw new Error("failed to initialise the claude-code model");
        }

        // The prompt travels as a message, so it is never argv. It is assembled
        // from the spec, the acceptance criteria and -- when a previous iteration
        // failed -- the whole verification output, which is arbitrary test output
        // of arbitrary length. As argv that is bounded by ARG_MAX, and the loop
        // would die with an opaque spawn failure exactly on the iterations where
        // the most had gone wrong.
        const turn = await model.generateText({
          messages: [ai.textMessage("user", prompt)],
        });

        await model.close();

        if (results.isFail(turn)) {
          const failure = turn.error as { message?: string };

          out.writeln(
            span.red(
              `  Agent turn failed: ${failure.message ?? "unknown error"}`,
            ),
          );
          exitCode = 1;
          break;
        }

        stopReason = turn.value.stopReason;
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);

        out.writeln(
          span.red(`  Failed to run the agent: ${detail}`),
          span.dim(" Is the claude CLI installed?"),
        );
        exitCode = 1;
        break;
      }

      // Record the iteration here, from the turn we just watched finish, rather
      // than trusting the in-agent Stop hook to have done it. setDriver told the
      // hook to stand down for exactly this reason -- two writers doing a
      // read-modify-write on state.json for one turn lose updates.
      const record = await iteration.recordIteration(root);

      if (record === null) {
        out.writeln(
          span.red("  Could not record the iteration (state unreadable)."),
        );
        exitCode = 1;
        break;
      }

      out.writeln(
        span.dim(
          `  Agent finished (${stopReason}). Iteration ${record.iteration}: ${
            record.gitStat || "no file changes"
          }`,
        ),
      );

      // A turn that ended for any reason other than finishing normally is worth
      // surfacing: the loop would otherwise re-prompt into the same wall.
      if (stopReason !== "end_turn") {
        out.writeln(
          span.yellow(`  Turn ended early: ${stopReason}`),
        );
      }

      // ── Auto-commit if configured (CLI commits, not agent) ──
      const freshState = await persistence.readState(root);

      if (
        (config as Record<string, unknown>)["autoCommit"] === true &&
        config.allowGit !== false
      ) {
        try {
          const shellExec = await import("@eserstack/shell/exec");
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
  } finally {
    // Release the claim even if the loop threw or broke out early. A stale
    // "acp" left in state.json would silently disable the Stop hook for every
    // later agent-driven session in this project -- the exact silent-no-write
    // failure this change exists to remove, just pointed the other way.
    await iteration.setDriver(root, null);
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
  const logFile = `${root}/${persistence.paths.progressesDir}/blocked.log`;
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
