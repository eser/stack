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

/**
 * The canonical mux spawn resolver for noskills agent panes: launches the
 * coding agent (default `claude`) and stamps the per-session noskills env
 * (`NOSKILLS_SESSION` from the pane meta, `NOSKILLS_PROJECT_ROOT`). Shared by the
 * TUI manager and the web host so the agent environment never diverges.
 */
export const buildAgentSpawnResolver = (root: string): mux.SpawnResolver => {
  const baseEnv = runtime.env.toObject();

  return (pane) => ({
    command: pane.command ?? "claude",
    args: pane.args ?? [],
    cwd: pane.cwd ?? root,
    env: {
      ...baseEnv,
      NOSKILLS_SESSION: pane.meta?.["sessionId"] ?? "",
      NOSKILLS_PROJECT_ROOT: root,
    },
  });
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
