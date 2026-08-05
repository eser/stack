// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The runtime agent-adapter abstraction: how to discover and launch an
 * interactive coding agent in a pane.
 *
 * It used to read agent state as well, by matching regexes against the last ten
 * rows of the terminal. That is gone: agent state now arrives as ACP
 * session/update events, which the agent reports about itself rather than being
 * inferred from how its TUI happens to render this week. What remains here is
 * binary discovery and spawning, which a terminal pane genuinely needs.
 *
 * @module
 */

import * as exec from "@eserstack/shell/exec";
import { getPlatform } from "@eserstack/standards/cross-runtime";

export type SpawnContext = {
  readonly cwd: string;
  readonly cols: number;
  readonly rows: number;
  /** Extra env to merge (e.g. session ids from the consumer). */
  readonly baseEnv?: Record<string, string>;
  readonly extraEnv?: Record<string, string>;
};

export type SpawnSpec = {
  readonly command: string;
  readonly args: readonly string[];
  readonly env: Record<string, string>;
  readonly cwd?: string;
};

export type AgentCapabilities = {
  readonly supportsBracketedPaste: boolean;
};

export interface AgentAdapter {
  readonly id: string;
  readonly displayName: string;
  readonly capabilities: AgentCapabilities;
  /** Resolve the binary on PATH; null when not installed. */
  resolveCommand(): Promise<string | null>;
  /** Full spawn spec, or null when the binary isn't found. */
  buildSpawnSpec(ctx: SpawnContext): Promise<SpawnSpec | null>;
}

// ---------------------------------------------------------------------------
// Binary discovery
// ---------------------------------------------------------------------------

/** True if `name` resolves on PATH (cross-platform `which`/`where`). */
export const isOnPath = async (name: string): Promise<boolean> => {
  const probe = getPlatform() === "windows" ? "where" : "which";
  try {
    const code = await exec.exec`${probe} ${name}`.noThrow().code();

    return code === 0;
  } catch {
    return false;
  }
};

/** Return the first candidate found on PATH, or null. */
export const resolveFirstOnPath = async (
  candidates: readonly string[],
): Promise<string | null> => {
  for (const name of candidates) {
    if (await isOnPath(name)) return name;
  }

  return null;
};

// ---------------------------------------------------------------------------
// CLI adapter factory
// ---------------------------------------------------------------------------

export type CliAdapterOptions = {
  readonly id: string;
  readonly displayName: string;
  /** PATH candidates, tried in order (e.g. ["claude", "claude-code"]). */
  readonly candidates: readonly string[];
  readonly capabilities?: Partial<AgentCapabilities>;
};

/**
 * Build an adapter for an interactive CLI agent. The built-in adapters are thin
 * configs over this.
 */
export const createCliAgentAdapter = (
  opts: CliAdapterOptions,
): AgentAdapter => {
  // Cache only a positive result: a "not found" is re-probed so a binary
  // installed after the first lookup is picked up by a long-lived process.
  let cached: string | null = null;

  const resolveCommand = async (): Promise<string | null> => {
    if (cached !== null) return cached;
    cached = await resolveFirstOnPath(opts.candidates);

    return cached;
  };

  return {
    id: opts.id,
    displayName: opts.displayName,
    capabilities: {
      supportsBracketedPaste: true,
      ...opts.capabilities,
    },
    resolveCommand,
    async buildSpawnSpec(ctx: SpawnContext): Promise<SpawnSpec | null> {
      const command = await resolveCommand();
      if (command === null) return null;

      return {
        command,
        args: [],
        env: { ...ctx.baseEnv, ...ctx.extraEnv },
        cwd: ctx.cwd,
      };
    },
  };
};
