// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Shared types for the TUI module.
 *
 * @module
 */

import * as streams from "@eser/streams";
import type { Audience, Interaction } from "@eser/shell/env";

// =============================================================================
// Cancellation
// =============================================================================

export const CANCEL: unique symbol = Symbol("tui.cancel");
export type Cancel = typeof CANCEL;

export const isCancel = (value: unknown): value is Cancel => value === CANCEL;

// =============================================================================
// TUI Context — pluggable I/O for production and testing
// =============================================================================

/** @deprecated Use `Interaction` from `@eser/shell/env` instead. */
export type TuiTarget = "interactive" | "non-interactive";

export type TuiContext = {
  readonly output: streams.Output;
  readonly input: ReadableStream<Uint8Array>;
  readonly target: TuiTarget;
  readonly interaction: Interaction;
  readonly audience: Audience;
  /** stderr output for non-interactive mode (logs go here, stdout stays pure JSON) */
  readonly stderr: streams.Output;
};

export type TuiContextOptions = Partial<TuiContext> & {
  /** @deprecated Use `interaction` instead. */
  target?: TuiTarget;
  interaction?: Interaction;
  audience?: Audience;
};

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
    input: options?.input ??
      (typeof globalThis.Deno !== "undefined"
        ? Deno.stdin.readable
        : new ReadableStream()),
    target,
    interaction,
    audience,
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

export type PromptOptions = {
  readonly message: string;
};

export type TextOptions = PromptOptions & {
  readonly placeholder?: string;
  readonly initialValue?: string;
  readonly validate?: (value: string) => string | undefined;
};

export type SelectOption<T> = {
  readonly value: T;
  readonly label: string;
  readonly hint?: string;
  readonly disabled?: boolean;
};

export type SelectOptions<T> = PromptOptions & {
  readonly options: readonly SelectOption<T>[];
  readonly initialValue?: T;
};

export type MultiselectOptions<T> = PromptOptions & {
  readonly options: readonly SelectOption<T>[];
  readonly initialValues?: readonly T[];
  readonly required?: boolean;
};

export type ConfirmOptions = PromptOptions & {
  readonly initialValue?: boolean;
};

export type GroupOptions = {
  readonly onCancel?: () => void;
};
