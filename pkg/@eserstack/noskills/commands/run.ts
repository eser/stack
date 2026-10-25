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
 * ACP-backed Go bridge when the native library loads and the pure
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
 * the noskills CLI (this loop) commits after each turn, not the agent. While
 * allowGit is false the agent runs with the git wrapper first on its PATH,
 * and the loop's own commits go to the real git binary around it.
 *
 * @module
 */

import * as results from "@eserstack/primitives/results";
import * as streams from "@eserstack/streams";
import * as span from "@eserstack/streams/span";
import type * as shellArgs from "@eserstack/shell/args";
import * as shellExec from "@eserstack/shell/exec";
import * as tui from "@eserstack/shell/tui";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as schema from "../state/schema.ts";
import * as persistence from "../state/persistence.ts";
import * as machine from "../state/machine.ts";
import * as iteration from "../state/iteration.ts";
import * as compiler from "../context/compiler.ts";
import * as syncEngine from "../sync/engine.ts";
import * as cmd from "../output/cmd.ts";
import * as gitWrapper from "./git-wrapper.ts";
import * as gitWrapperInstall from "./git-wrapper-install.ts";

// The ai provider every loop turn runs, which is also the coding tool whose
// interaction hints the turn's prompt follows. The tools the manifest lists do
// not change it: the loop always drives Claude Code.
export const AGENT_PROVIDER: schema.CodingToolId =
  schema.DEFAULT_AGENT_PROVIDER;

// The agent model for one loop iteration. Matches the `ai ask` default for
// claude-code so the two entry points do not silently diverge.
const AGENT_MODEL = schema.DEFAULT_AGENT_MODEL;

// `git status` and `git add` on a working tree.
const GIT_TIMEOUT_MS = 60_000;
// A commit runs the project's commit hooks, which may run its checks.
const GIT_COMMIT_TIMEOUT_MS = 10 * 60_000;

export const main = async (
  args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  const { root } = await persistence.resolveProjectRoot();
  const prefix = await cmd.loadCommandPrefix(root);
  const unattended = args?.includes("--unattended") ?? false;
  const maxTurns = parseFlag(args, "--max-turns") ?? 10;
  const maxIterations = parseFlag(args, "--max-iterations") ?? 50;

  if (!(await persistence.isInitialized(root))) {
    out.writeln(span.red(`noskills not initialized. Run: ${cmd.cmd("init")}`));
    await out.close();

    return results.fail({ exitCode: 1 });
  }

  // Validate starting phase
  const specFlag = persistence.parseSpecFlag(args);
  const initialState = await persistence.resolveState(root, specFlag, prefix);

  if (
    initialState.phase !== "EXECUTING" &&
    initialState.phase !== "SPEC_APPROVED"
  ) {
    out.writeln(span.red(`Cannot run from phase: ${initialState.phase}`));
    out.writeln(span.dim("Must be in SPEC_APPROVED or EXECUTING to start."));
    await out.close();

    return results.fail({ exitCode: 1 });
  }

  // If SPEC_APPROVED, transition to EXECUTING via library API
  if (initialState.phase === "SPEC_APPROVED") {
    out.writeln(span.dim("Starting execution from approved spec..."));
    const newState = machine.startExecution(initialState);
    // The spec's own file too: the agent's `spec <name> next` reads it first.
    await persistence.writeStateAndSpec(root, newState);
  }

  const config = await persistence.readManifest(root);

  if (config === null) {
    out.writeln(span.red("Config not found."));
    await out.close();

    return results.fail({ exitCode: 1 });
  }

  out.writeln(span.bold(`${cmd.cmdPrefix()} run`));
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
  let stopped = false;

  // Claim iteration recording for this loop before the first turn.
  //
  // Written into state.json rather than passed as an environment variable: the
  // agent is reached through the FFI bridge, whose Go library caches its
  // environment at load, so a variable exported now would not reach the process
  // that needs to read it. The hook reads state.json regardless.
  //
  // The git wrapper does go through the environment: the first turn loads that
  // library, so PATH is set before it. The agent's SessionStart hook exports
  // the wrapper as well, for the case where the library was already loaded.
  const agentGit = await guardAgentGit(root, config, out);
  await iteration.setDriver(root, "acp");

  try {
    while (loopIteration < maxIterations) {
      loopIteration++;

      // Each turn starts from the state the previous turn wrote, so the turns
      // run one after another.
      // deno-lint-ignore no-await-in-loop
      const outcome = await runTurn(
        {
          root,
          config,
          out,
          unattended,
          maxTurns,
          gitWrapper: agentGit.wrapper,
          spec: initialState.spec,
        },
        loopIteration,
      );

      if (outcome.kind === "stop") {
        exitCode = outcome.exitCode;
        stopped = true;
        break;
      }
    }
  } finally {
    agentGit.restore();
    // Release the claim even if the loop threw or broke out early. A stale
    // "acp" left in state.json would silently disable the Stop hook for every
    // later agent-driven session in this project -- the exact silent-no-write
    // failure this change exists to remove, just pointed the other way.
    await iteration.setDriver(root, null);
  }

  // ── Safety valve ── only when the iterations ran out; a turn that stopped
  // the loop on the last allowed iteration keeps its own exit code.
  if (!stopped && loopIteration >= maxIterations) {
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
// One Loop Turn
// =============================================================================

/** What the loop does after a turn: run the next one or stop with a code. */
type TurnOutcome =
  | { readonly kind: "next" }
  | { readonly kind: "stop"; readonly exitCode: number };

const NEXT_TURN: TurnOutcome = { kind: "next" };
const STOP_OK: TurnOutcome = { kind: "stop", exitCode: 0 };
const STOP_FAILED: TurnOutcome = { kind: "stop", exitCode: 1 };

type LoopContext = {
  readonly root: string;
  readonly config: schema.NosManifest;
  readonly out: streams.Output;
  readonly unattended: boolean;
  readonly maxTurns: number;
  /** The wrapper on the agent's PATH, or null while allowGit is true. */
  readonly gitWrapper: gitWrapperInstall.InstalledGitWrapper | null;
  /** The spec the loop drives, or null for a state without one. */
  readonly spec: string | null;
};

/**
 * The spec's own state, which keeps a terminal phase after `spec <name> done`
 * resets state.json to IDLE; state.json for a loop without a spec or a spec
 * without its own file.
 */
const readLoopState = async (
  root: string,
  spec: string | null,
): Promise<schema.StateFile> => {
  if (spec !== null) {
    const own = await persistence.readSpecState(root, spec);
    if (own.spec === spec) {
      return own;
    }
  }

  return await persistence.readState(root);
};

/**
 * Runs one iteration of the loop: reads the state, handles the exits, runs one
 * agent turn and records it.
 */
const runTurn = async (
  loop: LoopContext,
  loopIteration: number,
): Promise<TurnOutcome> => {
  const { root, config, out, unattended, maxTurns } = loop;

  // Read fresh state each iteration
  const state = await readLoopState(root, loop.spec);

  // ── Exit: COMPLETED ──
  if (state.phase === "COMPLETED") {
    out.writeln("");
    out.writeln(span.green("✔"), " Spec completed!");
    out.writeln(`  Iterations: ${state.execution.iteration}`);
    out.writeln(`  Decisions:  ${state.decisions.length}`);
    return STOP_OK;
  }

  // ── Exit: BLOCKED ──
  if (state.phase === "BLOCKED") {
    const reason = state.execution.lastProgress ?? "Unknown";
    out.writeln("");
    out.writeln(span.yellow("⚠"), " Execution blocked: ", span.dim(reason));

    if (unattended) {
      // Log to file and exit — user resolves later
      await logBlocked(root, reason, loopIteration);
      out.writeln(
        span.dim(
          "Logged to .eser/.state/progresses/blocked.log. Resolve and re-run.",
        ),
      );
      return STOP_FAILED;
    }

    // Interactive: prompt for resolution via tui.text
    const tuiCtx = tui.createTuiContext();
    const resolution = await tui.text(tuiCtx, {
      message: "Enter resolution (or leave empty to stop):",
    });

    if (tui.isCancel(resolution) || resolution === "") {
      out.writeln(span.dim("Stopped by user."));
      return STOP_OK;
    }

    // Submit resolution via library API (not shell)
    const unblocked = machine.transition(state, "EXECUTING");
    await persistence.writeStateAndSpec(root, {
      ...unblocked,
      execution: {
        ...unblocked.execution,
        lastProgress: `Resolved: ${resolution}`,
      },
    });

    return NEXT_TURN;
  }

  // ── Exit: unexpected phase ──
  if (state.phase !== "EXECUTING") {
    out.writeln(span.red(`Unexpected phase: ${state.phase}. Stopping.`));
    return STOP_FAILED;
  }

  // ── Build agent prompt from compiler output ──
  const allConcerns = await persistence.listConcerns(root);
  const activeConcerns = allConcerns.filter((c) =>
    config.concerns.includes(c.id),
  );
  const rules = await syncEngine.loadRules(root);
  const hints = headlessHints();
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
  // factoryFor picks the ACP-backed Go bridge when the native library loads
  // and the pure-TypeScript adapter otherwise, so this is strictly better where
  // the library is present and unchanged where it is not. Both paths run the
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

    const factory = await adapters.factoryFor(AGENT_PROVIDER);

    if (factory === undefined) {
      throw new Error(`no ${AGENT_PROVIDER} provider available`);
    }

    const registry = new ai.Registry({ factories: [factory] });

    await registry.addModel("default", {
      provider: AGENT_PROVIDER,
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
        span.red(`  Agent turn failed: ${failure.message ?? "unknown error"}`),
      );
      return STOP_FAILED;
    }

    stopReason = turn.value.stopReason;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);

    out.writeln(
      span.red(`  Failed to run the agent: ${detail}`),
      span.dim(" Is the claude CLI installed?"),
    );
    return STOP_FAILED;
  }

  // Record the iteration here, from the turn we just watched finish, rather
  // than trusting the in-agent Stop hook to have done it. setDriver told the
  // hook to stand down for exactly this reason -- two writers doing a
  // read-modify-write on state.json for one turn lose updates.
  // A turn that left EXECUTING (the agent blocked or finished the spec) is
  // not recorded: the next turn reports the new phase, and after `done`
  // state.json is IDLE.
  if ((await readLoopState(root, loop.spec)).phase !== "EXECUTING") {
    return NEXT_TURN;
  }

  const record = await iteration.recordIteration(root);

  if (record === null) {
    out.writeln(
      span.red("  Could not record the iteration (state unreadable)."),
    );
    return STOP_FAILED;
  }

  out.writeln(
    span.dim(
      `  Agent finished (${stopReason}). Iteration ${record.iteration}: ${
        record.gitStat === "" ? "no file changes" : record.gitStat
      }`,
    ),
  );

  // A turn that ended for any reason other than finishing normally is worth
  // surfacing: the loop would otherwise re-prompt into the same wall.
  if (stopReason !== "end_turn") {
    out.writeln(span.yellow(`  Turn ended early: ${stopReason}`));
  }

  // ── Auto-commit if configured (CLI commits, not agent) ──
  // autoCommit alone decides: allowGit governs the agent's git, not the loop's.
  if ((config as Record<string, unknown>)["autoCommit"] === true) {
    const freshState = await persistence.readState(root);
    const message = `noskills: iteration ${freshState.execution.iteration}: ${
      freshState.execution.lastProgress ?? "progress"
    }`;

    try {
      if (await autoCommit(root, message, loop.gitWrapper)) {
        out.writeln(span.dim("  Auto-committed."));
      }
    } catch (error) {
      out.writeln(
        span.yellow(
          `  Auto-commit failed, the loop continues: ${gitFailure(error)}`,
        ),
      );
    }
  }

  return NEXT_TURN;
};

// =============================================================================
// Git
// =============================================================================

/** The agent-session git wrapper as the loop set it up. */
type AgentGit = {
  readonly wrapper: gitWrapperInstall.InstalledGitWrapper | null;
  /** Puts PATH back as it was before the loop. */
  readonly restore: () => void;
};

/**
 * While allowGit is false, installs the git wrapper and puts it first on this
 * process's PATH, so the agent process each turn starts inherits it. A wrapper
 * that cannot be installed is reported and the loop runs without it: the
 * PreToolUse hook still refuses git writes it can see in a command.
 */
const guardAgentGit = async (
  root: string,
  config: schema.NosManifest,
  out: streams.Output,
): Promise<AgentGit> => {
  const unguarded: AgentGit = { wrapper: null, restore: () => {} };
  if (config.allowGit === true) return unguarded;

  let wrapper: gitWrapperInstall.InstalledGitWrapper | null;
  try {
    wrapper = await gitWrapperInstall.installGitWrapper(
      root,
      config.command ?? cmd.cmdPrefix(),
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    out.writeln(
      span.yellow(
        `Git wrapper not installed in ${gitWrapperInstall.wrapperDir(
          root,
        )}: ${detail}`,
      ),
    );
    return unguarded;
  }

  if (wrapper === null) return unguarded;

  const previousPath = runtime.env.get("PATH");
  runtime.env.set(
    "PATH",
    gitWrapper.prependToPath(previousPath ?? "", wrapper.binDir),
  );

  return {
    wrapper,
    restore: () => {
      if (previousPath === undefined) {
        runtime.env.delete("PATH");
      } else {
        runtime.env.set("PATH", previousPath);
      }
    },
  };
};

/**
 * Commits every change in the project: the loop's commit, not the agent's.
 * With a wrapper installed it runs the real git binary with the wrapper
 * directory removed from PATH, so neither the commit nor the commit hooks it
 * runs (which may call git themselves) are refused by the agent's guard.
 * `env` is the environment git runs with; it defaults to this process's.
 * Returns false when there was nothing to commit; throws when git fails.
 */
export const autoCommit = async (
  root: string,
  message: string,
  wrapper: gitWrapperInstall.InstalledGitWrapper | null,
  env: Readonly<Record<string, string>> = runtime.env.toObject(),
): Promise<boolean> => {
  const gitEnv =
    wrapper === null
      ? env
      : {
          ...env,
          PATH: gitWrapper.removeFromPath(env["PATH"] ?? "", wrapper.binDir),
        };
  const git = (args: string[], timeoutMs: number): shellExec.CommandBuilder =>
    new shellExec.CommandBuilder(wrapper?.realGit ?? "git", args)
      .cwd(root)
      .env({ ...gitEnv })
      .timeout(timeoutMs);

  // --porcelain lists untracked files too; a turn that only adds files still
  // gets its commit.
  const status = await git(["status", "--porcelain"], GIT_TIMEOUT_MS).text();
  if (status === "") return false;

  await git(["add", "-A"], GIT_TIMEOUT_MS).text();
  await git(["commit", "-m", message], GIT_COMMIT_TIMEOUT_MS).text();

  return true;
};

/** What went wrong in a git call, with git's own error output when there is one. */
const gitFailure = (error: unknown): string => {
  if (error instanceof shellExec.CommandError) {
    return `${error.message}: ${error.stderr.trim()}`;
  }

  return error instanceof Error ? error.message : String(error);
};

// =============================================================================
// Agent Prompt Builder
// =============================================================================

/**
 * Interaction hints for the loop's agent: those of AGENT_PROVIDER, the tool
 * the loop runs, whatever tools the manifest lists. It runs headless
 * (`claude --print`), so nobody answers a question during the turn: the
 * compiler leaves out the rules that wait for a person and routes decisions
 * through `block`.
 */
export const headlessHints = (): compiler.InteractionHints => ({
  ...syncEngine.interactionHintsFor(AGENT_PROVIDER),
  interactive: false,
});

/** Builds the prompt one loop turn sends to the agent. */
export const buildAgentPrompt = (output: compiler.NextOutput): string => {
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
        lines.push(`- ${item.id}: ${item.text}`);
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
        lines.push(`- ${c.id}: ${c.text}`);
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

  // Protocol footer. The commands name the spec: once one is active, `next`,
  // `block` and `done` refuse to run without it.
  const spec = output.meta.spec;
  const specCommand = (sub: string): string =>
    spec === null ? cmd.cmd(sub) : cmd.cmd(`spec ${spec} ${sub}`);
  lines.push(
    `When done, report progress: ${specCommand(
      'next --answer="your progress"',
    )}`,
  );
  lines.push(`If blocked, run: ${specCommand('block "reason"')}`);
  lines.push(`When all tasks are complete: ${specCommand("done")}`);

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

/**
 * Appends a line for a blocked iteration to .eser/.state/progresses/blocked.log,
 * creating the directory when needed. Best effort: a log that cannot be
 * written does not stop the loop.
 */
export const logBlocked = async (
  root: string,
  reason: string,
  iteration: number,
): Promise<void> => {
  const logFile = `${root}/${persistence.paths.progressesDir}/blocked.log`;
  const entry = `[${new Date().toISOString()}] iteration=${iteration} reason=${reason}\n`;

  try {
    await runtime.fs.ensureDir(runtime.path.dirname(logFile));
    await runtime.fs.writeTextFile(logFile, entry, { append: true });
  } catch {
    // best effort
  }
};
