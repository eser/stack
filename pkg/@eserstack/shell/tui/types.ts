// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Shared types for the TUI module.
 *
 * @module
 */

import * as streams from "@eserstack/streams";
import { runtime } from "@eserstack/standards/cross-runtime";
import type { Audience, Interaction } from "../env/mod.ts";

// =============================================================================
// Cancellation
// =============================================================================

/** What a prompt returns when the user cancels it. */
export const CANCEL: unique symbol = Symbol("tui.cancel");
/** The type of {@link CANCEL}. */
export type Cancel = typeof CANCEL;

/** Whether a prompt's answer is {@link CANCEL}. */
export const isCancel = (value: unknown): value is Cancel => value === CANCEL;

// =============================================================================
// TUI Context — pluggable I/O for production and testing
// =============================================================================

/** @deprecated Use `Interaction` from `@eserstack/shell/env` instead. */
export type TuiTarget = "interactive" | "non-interactive";

/**
 * What a prompt does on a signal key: exit the process, cancel the prompt, or
 * ignore the key.
 */
export type SignalAction = "exit" | "cancel" | "ignore";

/** How prompts react to Ctrl+C and Escape. */
export type SignalConfig = {
  /** Ctrl+C behavior. Default: "exit" (exit process with code 130). */
  readonly ctrlC: SignalAction;
  /** Escape behavior. Default: "cancel" (cancel current prompt). */
  readonly escape: SignalAction;
};

/** Ctrl+C exits the process; Escape cancels the prompt. */
export const DEFAULT_SIGNALS: SignalConfig = {
  ctrlC: "exit",
  escape: "cancel",
};

/**
 * The output stream a {@link TuiContext} writes to: `Output` from
 * `@eserstack/streams`, named here so a custom context can be typed from this
 * package alone.
 */
export type TuiOutput = streams.Output;

/**
 * The I/O every prompt and widget writes through: real terminal streams from
 * {@link createTuiContext}, or buffers from {@link createTestContext}.
 */
export type TuiContext = {
  /** Where prompts and output are written. */
  readonly output: TuiOutput;
  /** Where keypresses are read from. */
  readonly input: ReadableStream<Uint8Array>;
  /** @deprecated Use `interaction` instead. */
  readonly target: TuiTarget;
  /** Whether a person can answer prompts. */
  readonly interaction: Interaction;
  /** Who reads the output: a person or an agent. */
  readonly audience: Audience;
  /** How prompts react to Ctrl+C and Escape. */
  readonly signals: SignalConfig;
  /** stderr output for non-interactive mode (logs go here, stdout stays pure JSON) */
  readonly stderr: TuiOutput;
};

/** Overrides for {@link createTuiContext}; anything unset gets its default. */
export type TuiContextOptions = Partial<TuiContext> & {
  /** @deprecated Use `interaction` instead. */
  target?: TuiTarget;
  /** "interactive" when unset. */
  interaction?: Interaction;
  /** "human" when unset. */
  audience?: Audience;
  /** Merged over {@link DEFAULT_SIGNALS}. */
  signals?: Partial<SignalConfig>;
};

/** Get stdin as a ReadableStream, falling back to empty stream if unavailable. */
const getStdinStream = (): ReadableStream<Uint8Array> => {
  try {
    return runtime.process.stdin;
  } catch {
    // Runtime doesn't support stdin (browser, test env)
    return new ReadableStream();
  }
};

/**
 * Create a context on the real terminal. Interactive mode writes ANSI to
 * stdout and reads stdin; non-interactive mode writes plain text to stderr, so
 * stdout stays clean for machine-readable output.
 */
export const createTuiContext = (
  options?: TuiContextOptions,
): TuiContext => {
  // Resolve interaction: explicit interaction > legacy target > default
  const interaction: Interaction = options?.interaction ??
    (options?.target === "non-interactive" ? "non-interactive" : "interactive");
  const audience: Audience = options?.audience ?? "human";

  // Legacy target stays in sync
  const target: TuiTarget = interaction === "non-interactive"
    ? "non-interactive"
    : "interactive";

  // Non-interactive output goes to stderr with plain renderer (stdout stays clean)
  const isInteractive = interaction === "interactive";

  return {
    output: options?.output ?? streams.output({
      renderer: isInteractive
        ? streams.renderers.ansi()
        : streams.renderers.plain(),
      sink: isInteractive ? streams.sinks.stdout() : streams.sinks.stderr(),
    }),
    input: options?.input ?? getStdinStream(),
    target,
    interaction,
    audience,
    signals: { ...DEFAULT_SIGNALS, ...options?.signals },
    stderr: options?.stderr ?? streams.output({
      renderer: streams.renderers.plain(),
      sink: streams.sinks.stderr(),
    }),
  };
};

/**
 * Create a test context with buffer-backed output and injectable input.
 * No real terminal needed — unit test any prompt.
 */
export const createTestContext = (): {
  ctx: TuiContext;
  getOutput: () => string;
  pushInput: (bytes: Uint8Array) => void;
  pushKey: (name: string) => void;
} => {
  const inputChunks: Uint8Array[] = [];
  let inputController: ReadableStreamDefaultController<Uint8Array> | undefined;

  const inputStream = new ReadableStream<Uint8Array>({
    start(controller) {
      inputController = controller;
      for (const chunk of inputChunks) {
        controller.enqueue(chunk);
      }
    },
  });

  const sink = streams.sinks.buffer();
  const out = streams.output({
    renderer: streams.renderers.plain(),
    sink,
  });

  const KEY_MAP: Record<string, Uint8Array> = {
    return: new Uint8Array([0x0d]),
    enter: new Uint8Array([0x0d]),
    escape: new Uint8Array([0x1b]),
    up: new Uint8Array([0x1b, 0x5b, 0x41]),
    down: new Uint8Array([0x1b, 0x5b, 0x42]),
    right: new Uint8Array([0x1b, 0x5b, 0x43]),
    left: new Uint8Array([0x1b, 0x5b, 0x44]),
    space: new Uint8Array([0x20]),
    backspace: new Uint8Array([0x7f]),
    "ctrl+c": new Uint8Array([0x03]),
    tab: new Uint8Array([0x09]),
  };

  return {
    ctx: {
      output: out,
      input: inputStream,
      target: "interactive",
      interaction: "interactive",
      audience: "human",
      signals: { ctrlC: "cancel", escape: "cancel" },
      stderr: out,
    },
    getOutput: () => sink.items().map(String).join(""),
    pushInput: (bytes: Uint8Array) => {
      if (inputController !== undefined) {
        inputController.enqueue(bytes);
      } else {
        inputChunks.push(bytes);
      }
    },
    pushKey: (name: string) => {
      const bytes = KEY_MAP[name];
      if (bytes !== undefined) {
        if (inputController !== undefined) {
          inputController.enqueue(bytes);
        } else {
          inputChunks.push(bytes);
        }
      } else {
        // Treat as literal character
        const encoded = new TextEncoder().encode(name);
        if (inputController !== undefined) {
          inputController.enqueue(encoded);
        } else {
          inputChunks.push(encoded);
        }
      }
    },
  };
};

// =============================================================================
// Prompt option types
// =============================================================================

/** What every prompt takes. */
export type PromptOptions = {
  /** The question shown to the user. */
  readonly message: string;
};

/** Options for the `text` prompt. */
export type TextOptions = PromptOptions & {
  /** Dimmed text shown while the answer is empty. */
  readonly placeholder?: string;
  /** The answer to start with. */
  readonly initialValue?: string;
  /** Returns a message to refuse the answer, or `undefined` to accept it. */
  readonly validate?: (value: string) => string | undefined;
};

/** One choice in `select` or `multiselect`. */
export type SelectOption<T> = {
  /** What the prompt returns for this choice. */
  readonly value: T;
  /** The text shown. */
  readonly label: string;
  /** Dimmed text shown next to the label. */
  readonly hint?: string;
  /** Shown but cannot be chosen. */
  readonly disabled?: boolean;
};

/** Options for the `select` prompt. */
export type SelectOptions<T> = PromptOptions & {
  /** The choices, in display order. */
  readonly options: readonly SelectOption<T>[];
  /** The value highlighted first; the first enabled choice when unset. */
  readonly initialValue?: T;
};

/** Options for the `multiselect` prompt. */
export type MultiselectOptions<T> = PromptOptions & {
  /** The choices, in display order. */
  readonly options: readonly SelectOption<T>[];
  /** The values checked at the start. */
  readonly initialValues?: readonly T[];
  /** False to accept an empty choice; true when unset. */
  readonly required?: boolean;
};

/** Options for the `confirm` prompt. */
export type ConfirmOptions = PromptOptions & {
  /** The answer to start with; true when unset. */
  readonly initialValue?: boolean;
};

/** Options for `group`. */
export type GroupOptions = {
  /** Called once when any prompt in the group is cancelled. */
  readonly onCancel?: () => void;
};
