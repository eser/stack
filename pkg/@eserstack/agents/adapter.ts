// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The runtime agent-adapter abstraction: how to discover, launch, and read the
 * state of an interactive coding agent running in a pane.
 *
 * This is distinct from @eserstack/ai (one-shot text generation): an adapter
 * drives a long-lived interactive TUI. Binary discovery mirrors ai/noskills
 * (`which`/`where` on PATH).
 *
 * @module
 */

import * as exec from "@eserstack/shell/exec";
import { getPlatform } from "@eserstack/standards/cross-runtime";

/** Lifecycle state inferred from a pane's terminal contents. */
export type AgentState =
  | "starting"
  | "prompt-ready"
  | "busy"
  | "awaiting-input"
  | "finished"
  | "exited";

/** Read-only view of a pane's terminal grid, supplied by the consumer. */
export type TerminalView = {
  readonly cursorRow: number;
  readonly cursorCol: number;
  readonly rows: number;
  readonly cols: number;
  /** Text of a 0-based grid row (empty string if out of range). */
  lineText(row: number): string;
  /** Recently emitted bytes (a rolling window), for scrolling-output matchers. */
  recentOutput(): string;
};

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
  readonly canDetectAwaitingInput: boolean;
  readonly canDetectFinished: boolean;
};

export interface AgentAdapter {
  readonly id: string;
  readonly displayName: string;
  readonly capabilities: AgentCapabilities;
  /** Resolve the binary on PATH; null when not installed. */
  resolveCommand(): Promise<string | null>;
  /** Full spawn spec, or null when the binary isn't found. */
  buildSpawnSpec(ctx: SpawnContext): Promise<SpawnSpec | null>;
  /** Classify the current state from the terminal view + previous state. */
  detectState(view: TerminalView, prev: AgentState): AgentState;
  /** Key sequence that submits a typed message (e.g. "\r"). */
  submitSequence(): string;
  /** Optional: the question text when awaiting input. */
  extractPrompt?(view: TerminalView): string | null;
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
// Shared state detection
// ---------------------------------------------------------------------------

/** Regex matchers over the terminal tail; first match wins in priority order. */
export type StateMatchers = {
  readonly busy?: RegExp;
  readonly awaitingInput?: RegExp;
  readonly finished?: RegExp;
  readonly promptReady?: RegExp;
};

/**
 * Snapshot the last `tailLines` rows of the LIVE grid into one blob the matchers
 * run against. Pure given a stable {@link TerminalView}.
 *
 * Deliberately excludes `recentOutput()` (the rolling byte window): state must
 * reflect the *current* screen. Including scrollback would let a stale spinner
 * ("esc to interrupt") keep the agent classified as busy after it has returned
 * to the prompt, stalling injection.
 */
export const terminalTail = (view: TerminalView, tailLines = 10): string => {
  const lines: string[] = [];
  for (let i = tailLines - 1; i >= 0; i--) {
    const row = view.rows - 1 - i;
    if (row >= 0) lines.push(view.lineText(row));
  }

  return lines.join("\n");
};

/**
 * Classify state via matchers (busy > awaiting-input > finished > prompt-ready),
 * falling back to the previous state. Adapters supply their own matchers.
 */
export const detectStateFromMatchers = (
  view: TerminalView,
  prev: AgentState,
  matchers: StateMatchers,
  tailLines = 10,
): AgentState => {
  const blob = terminalTail(view, tailLines);

  if (matchers.busy?.test(blob)) return "busy";
  if (matchers.awaitingInput?.test(blob)) return "awaiting-input";
  if (matchers.finished?.test(blob)) return "finished";
  if (matchers.promptReady?.test(blob)) return "prompt-ready";

  return prev;
};

// ---------------------------------------------------------------------------
// CLI adapter factory
// ---------------------------------------------------------------------------

export type CliAdapterOptions = {
  readonly id: string;
  readonly displayName: string;
  /** PATH candidates, tried in order (e.g. ["claude", "claude-code"]). */
  readonly candidates: readonly string[];
  readonly matchers: StateMatchers;
  /** Submit sequence; defaults to Enter. */
  readonly submit?: string;
  readonly capabilities?: Partial<AgentCapabilities>;
};

/**
 * Build an adapter for an interactive CLI agent. The three built-in adapters are
 * thin configs over this; the matchers are heuristics and fully overridable.
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
      canDetectAwaitingInput: opts.matchers.awaitingInput !== undefined,
      canDetectFinished: opts.matchers.finished !== undefined,
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
    detectState(view: TerminalView, prev: AgentState): AgentState {
      return detectStateFromMatchers(view, prev, opts.matchers);
    },
    submitSequence(): string {
      return opts.submit ?? "\r";
    },
  };
};
