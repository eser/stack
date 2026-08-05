// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Session binding for the manager — creates a persisted noskills session for a
 * tab and produces the metadata mux bakes into the pane (so the spawn resolver
 * can set NOSKILLS_SESSION/NOSKILLS_PROJECT_ROOT).
 *
 * This is the noskills-specific glue that stays here; tabs/panes/PTYs/render are
 * owned by @eserstack/mux.
 *
 * @module
 */

import type * as mux from "@eserstack/mux";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as persistence from "../state/persistence.ts";

export type SessionBinding = {
  readonly sessionId: string;
  readonly spec: string | null;
  readonly mode: "spec" | "free";
  readonly phase: string | null;
};

const nowIso = (): string => new Date().toISOString();

/** Optional behaviour for {@link buildAgentSpawnResolver}. */
export type AgentSpawnOptions = {
  /**
   * Session id stamped into panes that carry none of their own.
   *
   * A getter, not a value: the daemon's mux worker learns its session at
   * `query_start`, which arrives after the server — and therefore the resolver
   * — has been built.
   */
  readonly sessionId?: () => string;
};

/**
 * The canonical mux spawn resolver for noskills panes.
 *
 * It stamps the per-session noskills environment (`NOSKILLS_SESSION` from the
 * pane meta, `NOSKILLS_PROJECT_ROOT`) and runs whatever the pane names. Shared
 * by the TUI manager, the web host and the daemon's mux worker, which each had
 * their own copy before — copies that had already drifted apart in two ways,
 * both preserved here as parameters rather than as a third variant.
 *
 * # A pane with no command is a shell, not an agent
 *
 * The three copies all fell back to `claude`. That is wrong for the case it
 * actually fires in: an agent pane always has its binary resolved by whoever
 * dispatched it, so the fallback is reached only by `splitPane` and the default
 * `newPane` keybinding — neither of which carries a command. Splitting inside
 * an agent tab therefore launched a *second* agent, with an empty
 * `NOSKILLS_SESSION`, when the user asked for another terminal.
 *
 * `root` may be a getter for the same reason `sessionId` is.
 */
export const buildAgentSpawnResolver = (
  root: string | (() => string),
  options: AgentSpawnOptions = {},
): mux.SpawnResolver => {
  const projectRoot = typeof root === "function" ? root : () => root;

  return (pane) => {
    // Read per spawn rather than snapshotting at construction: a long-lived
    // manager would otherwise never see an environment change, and the mux
    // default resolver already reads it per spawn.
    const baseEnv = runtime.env.toObject();
    const here = projectRoot();

    return {
      command: pane.command ?? baseEnv["SHELL"] ?? "/bin/sh",
      args: pane.args ?? [],
      cwd: pane.cwd ?? here,
      env: {
        ...baseEnv,
        NOSKILLS_SESSION: pane.meta?.["sessionId"] ?? options.sessionId?.() ??
          "",
        NOSKILLS_PROJECT_ROOT: here,
      },
    };
  };
};

/** Create a free-mode session (unbound to any spec). */
export const createFreeSession = async (
  root: string,
  tool: string,
): Promise<SessionBinding> => {
  const sessionId = persistence.generateSessionId();
  await persistence.createSession(root, {
    id: sessionId,
    spec: null,
    mode: "free",
    phase: null,
    pid: 0,
    startedAt: nowIso(),
    lastActiveAt: nowIso(),
    tool,
  });

  return { sessionId, spec: null, mode: "free", phase: null };
};

/** Create a spec-bound session, loading the spec's current phase if available. */
export const createSpecSession = async (
  root: string,
  specName: string,
  tool: string,
): Promise<SessionBinding> => {
  let phase: string | null = null;
  try {
    phase = (await persistence.resolveState(root, specName)).phase;
  } catch {
    // spec has no resolvable state yet
  }

  const sessionId = persistence.generateSessionId();
  await persistence.createSession(root, {
    id: sessionId,
    spec: specName,
    mode: "spec",
    phase,
    pid: 0,
    startedAt: nowIso(),
    lastActiveAt: nowIso(),
    tool,
  });

  return { sessionId, spec: specName, mode: "spec", phase };
};
