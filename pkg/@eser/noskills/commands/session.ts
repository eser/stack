// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `noskills session` — Manage sessions for multi-instance support.
 *
 * Sessions bind a Claude Code (or other tool) instance to a specific spec
 * or free mode, so multiple instances on the same codebase don't conflict.
 *
 * @module
 */

import * as results from "@eser/primitives/results";
import * as streams from "@eser/streams";
import * as span from "@eser/streams/span";
import type * as shellArgs from "@eser/shell/args";
import * as persistence from "../state/persistence.ts";
import { cmd, cmdPrefix } from "../output/cmd.ts";
import { runtime } from "@eser/standards/cross-runtime";

export const main = async (
  args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const subcommand = args?.[0];

  if (subcommand === "start") return await sessionStart(args?.slice(1));
  if (subcommand === "end") return await sessionEnd(args?.slice(1));
  if (subcommand === "list") return await sessionList();
  if (subcommand === "gc") return await sessionGc();

  const prefix = cmdPrefix();
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });
  out.writeln(
    `Usage: ${prefix} session <start | end | list | gc>`,
  );
  out.writeln("");
  out.writeln(span.dim("  start --spec=<name>   Bind to a spec"));
  out.writeln(
    span.dim("  start --free          Idle mode (no spec, no enforcement)"),
  );
  out.writeln(span.dim("  start --auto          Auto-detect spec or idle"));
  out.writeln(span.dim("  end [--id=<id>]       End current/specific session"));
  out.writeln(span.dim("  list                  Show active sessions"));
  out.writeln(span.dim("  gc                    Remove stale sessions"));
  await out.close();

  return results.ok(undefined);
};

// =============================================================================
// session start
// =============================================================================

const sessionStart = async (
  args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  const root = runtime.process.cwd();

  if (!(await persistence.isInitialized(root))) {
    out.writeln(
      span.red("noskills is not initialized."),
      " Run: ",
      span.bold(cmd("init")),
    );
    await out.close();
    return results.fail({ exitCode: 1 });
  }

  // Parse flags
  let specName: string | null = null;
  let freeMode = false;
  let autoMode = false;

  for (const arg of args ?? []) {
    if (arg.startsWith("--spec=")) {
      specName = arg.slice("--spec=".length);
    } else if (arg === "--free") {
      freeMode = true;
    } else if (arg === "--auto") {
      autoMode = true;
    }
  }

  // Auto mode: pick spec if exactly one exists, otherwise free
  if (autoMode) {
    const specStates = await persistence.listSpecStates(root);
    const activeSpecs = specStates.filter(
      (s) => s.state.phase !== "COMPLETED" && s.state.phase !== "IDLE",
    );

    if (activeSpecs.length === 1) {
      specName = activeSpecs[0]!.name;
    } else {
      freeMode = true;
    }
  }

  if (specName === null && !freeMode) {
    out.writeln(
      span.red("Specify --spec=<name>, --free, or --auto."),
    );
    out.writeln(
      span.dim(
        `Example: ${cmdPrefix()} session start --spec=my-feature`,
      ),
    );
    await out.close();
    return results.fail({ exitCode: 1 });
  }

  // If spec mode, validate spec exists and get its phase
  let phase: string | null = null;
  if (specName !== null) {
    try {
      const specState = await persistence.resolveState(root, specName);
      phase = specState.phase;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      out.writeln(span.red(`Error: ${msg}`));
      await out.close();
      return results.fail({ exitCode: 1 });
    }
  }

  const sessionId = persistence.generateSessionId();
  const session: persistence.Session = {
    id: sessionId,
    spec: specName,
    mode: freeMode ? "free" : "spec",
    phase: freeMode ? null : phase,
    pid: 0, // Deno doesn't expose PID easily; use 0 as placeholder
    startedAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
    tool: "claude-code",
  };

  await persistence.createSession(root, session);

  out.writeln(
    span.green("Session started."),
  );
  out.writeln("  ID:   ", span.bold(sessionId));
  out.writeln(
    "  Mode: ",
    span.bold(freeMode ? "free" : "spec"),
  );
  if (specName !== null) {
    out.writeln("  Spec: ", span.bold(specName));
    if (phase !== null) {
      out.writeln("  Phase: ", span.dim(phase));
    }
  }
  out.writeln("");
  out.writeln(
    `Run: `,
    span.bold(`export NOSKILLS_SESSION=${sessionId}`),
  );
  await out.close();

  return results.ok(undefined);
};

// =============================================================================
// session end
// =============================================================================

const sessionEnd = async (
  args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  const root = runtime.process.cwd();

  // Parse --id flag or use env var
  let sessionId: string | null = null;
  for (const arg of args ?? []) {
    if (arg.startsWith("--id=")) {
      sessionId = arg.slice("--id=".length);
    }
  }

  if (sessionId === null) {
    sessionId = runtime.env.get("NOSKILLS_SESSION") ?? null;
  }

  if (sessionId === null) {
    out.writeln(
      span.red(
        "No session specified. Use --id=<id> or set NOSKILLS_SESSION env var.",
      ),
    );
    await out.close();
    return results.fail({ exitCode: 1 });
  }

  const deleted = await persistence.deleteSession(root, sessionId);
  if (deleted) {
    out.writeln(span.green("Session ended: "), span.dim(sessionId));
  } else {
    out.writeln(span.red(`Session not found: ${sessionId}`));
  }

  await out.close();
  return results.ok(undefined);
};

// =============================================================================
// session list
// =============================================================================

const sessionList = async (): Promise<shellArgs.CliResult<void>> => {
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  const root = runtime.process.cwd();
  const sessions = await persistence.listSessions(root);

  out.writeln(span.bold("Sessions"));
  out.writeln("");

  if (sessions.length === 0) {
    out.writeln(
      span.dim(
        `  No active sessions. Start one with: ${
          cmd("session start --spec=<name>")
        }`,
      ),
    );
  } else {
    for (const s of sessions) {
      const stale = persistence.isSessionStale(s);
      const elapsed = Date.now() - new Date(s.lastActiveAt).getTime();
      const mins = Math.floor(elapsed / 60000);
      const timeLabel = mins < 60
        ? `${mins}min ago`
        : `${Math.floor(mins / 60)}h ago`;

      const modeLabel = s.mode === "free" ? "free" : `spec:${s.spec ?? "?"}`;
      const phaseLabel = s.phase ?? "—";
      const staleLabel = stale ? span.red(" (stale)") : "";

      out.writeln(
        "  ",
        span.bold(s.id),
        "  ",
        span.dim(modeLabel.padEnd(25)),
        " ",
        span.dim(phaseLabel.padEnd(18)),
        " ",
        span.dim(timeLabel),
        staleLabel,
      );
    }
  }

  await out.close();
  return results.ok(undefined);
};

// =============================================================================
// session gc
// =============================================================================

const sessionGc = async (): Promise<shellArgs.CliResult<void>> => {
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  const root = runtime.process.cwd();
  const removed = await persistence.gcStaleSessions(root);

  if (removed.length === 0) {
    out.writeln(span.dim("No stale sessions to remove."));
  } else {
    out.writeln(
      span.green(`Removed ${removed.length} stale session(s):`),
    );
    for (const id of removed) {
      out.writeln("  ", span.dim(id));
    }
  }

  await out.close();
  return results.ok(undefined);
};
