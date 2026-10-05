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
import * as crossRuntime from "@eserstack/standards/cross-runtime";

/** What the consumer knows about the pane an agent is launched in. */
export type SpawnContext = {
  /** Directory the agent starts in. */
  readonly cwd: string;
  /** Pane width in character columns. */
  readonly cols: number;
  /** Pane height in character rows. */
  readonly rows: number;
  /** Environment the agent starts with, usually the consumer's own. */
  readonly baseEnv?: Record<string, string>;
  /**
   * Variables added on top of `baseEnv` (for example session ids from the
   * consumer). A key set in both takes this value.
   */
  readonly extraEnv?: Record<string, string>;
};

/** How to launch an agent: the program, its arguments and environment. */
export type SpawnSpec = {
  /** Binary name as found on PATH (for example "claude"). */
  readonly command: string;
  /** Arguments passed to the binary. */
  readonly args: readonly string[];
  /** Full environment for the process: `baseEnv` merged with `extraEnv`. */
  readonly env: Record<string, string>;
  /** Directory to start the process in; when absent, the spawner picks one. */
  readonly cwd?: string;
};

/** Terminal features an agent's TUI handles. */
export type AgentCapabilities = {
  /**
   * True if the agent accepts bracketed paste, so a multi-line paste arrives
   * as one input instead of a key press per line.
   */
  readonly supportsBracketedPaste: boolean;
};

/** Finds an interactive coding agent on PATH and builds its spawn spec. */
export interface AgentAdapter {
  /** Stable id used for lookup (for example "claude-code"). */
  readonly id: string;
  /** Name shown to people (for example "Claude Code"). */
  readonly displayName: string;
  /** Terminal features the agent handles. */
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
  const probe = crossRuntime.getPlatform() === "windows" ? "where" : "which";
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
    // Candidates are probed in priority order and the first hit wins, so later
    // candidates are not spawned once one resolves.
    // deno-lint-ignore no-await-in-loop
    if (await isOnPath(name)) return name;
  }

  return null;
};

// ---------------------------------------------------------------------------
// CLI adapter factory
// ---------------------------------------------------------------------------

/** Options for {@link createCliAgentAdapter}. */
export type CliAdapterOptions = {
  /** Stable id used for lookup (for example "aider"). */
  readonly id: string;
  /** Name shown to people (for example "Aider"). */
  readonly displayName: string;
  /** PATH candidates, tried in order (e.g. ["claude", "claude-code"]). */
  readonly candidates: readonly string[];
  /**
   * Capabilities that differ from the defaults; every capability not given
   * here is true.
   */
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
