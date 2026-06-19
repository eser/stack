// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The autonomous driving loop FSM.
 *
 * Wires a quiescence reader → adapter state detection → events, and injects
 * queued messages when the agent is prompt-ready (gated by the safety policy).
 * It is decoupled from any concrete PTY/widget via the {@link AgentIo} seam, so
 * the consumer (mux/noskills) adapts its pane to it.
 *
 * @module
 */

import type { AgentAdapter, AgentState, TerminalView } from "../adapter.ts";
import { inject } from "./injector.ts";
import { createReader, type Reader, type ReaderIo } from "./reader.ts";
import { previewMessage, type Safety } from "./safety.ts";

/** Everything the loop needs from a pane. */
export type AgentIo = ReaderIo & {
  write(data: string): void;
  onExit(cb: (code: number) => void): () => void;
};

export type DriveEvent =
  | {
    readonly type: "state-changed";
    readonly from: AgentState;
    readonly to: AgentState;
  }
  | { readonly type: "prompt-ready" }
  | { readonly type: "awaiting-input"; readonly prompt: string | null }
  | { readonly type: "message-injected"; readonly preview: string }
  | { readonly type: "finished" }
  | { readonly type: "blocked"; readonly reason: string }
  | { readonly type: "exited"; readonly code: number };

export type DrivingLoop = {
  start(): void;
  /** Queue a message to inject when the agent is next prompt-ready. */
  send(message: string): void;
  on(handler: (ev: DriveEvent) => void): () => void;
  stop(): void;
};

export type DrivingLoopOptions = {
  readonly adapter: AgentAdapter;
  readonly io: AgentIo;
  readonly safety: Safety;
  readonly quiescenceMs?: number;
  /** Delay before retrying a temporarily-blocked (rate-limited) message. */
  readonly retryMs?: number;
  /** Optional: produce an auto-reply for an awaiting-input prompt. */
  readonly autoRespond?: (view: TerminalView) => string | null;
};

export const createDrivingLoop = (opts: DrivingLoopOptions): DrivingLoop => {
  const { adapter, io, safety } = opts;
  const handlers = new Set<(ev: DriveEvent) => void>();
  const queue: string[] = [];

  let state: AgentState = "starting";
  let reader: Reader | null = null;
  let unsubExit: (() => void) | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const emit = (ev: DriveEvent): void => {
    for (const h of handlers) h(ev);
  };

  const scheduleRetry = (): void => {
    if (retryTimer !== null || reader === null) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      tryInject();
    }, opts.retryMs ?? 5_000);
  };

  /** Drain the queue while prompt-ready: inject the first allowed message,
   *  drop permanently-rejected heads, and defer (retry) on temporary blocks. */
  const tryInject = (): void => {
    if (reader === null) return;

    while (queue.length > 0 && state === "prompt-ready") {
      const msg = queue[0]!;
      const gate = safety.gateSend(msg);

      if (gate.allowed) {
        queue.shift();
        inject(io.write, adapter, msg);
        safety.recordInjection(msg);
        emit({ type: "message-injected", preview: previewMessage(msg) });

        return; // one injection per prompt — the agent goes busy next
      }

      emit({ type: "blocked", reason: gate.reason ?? "blocked" });

      if (gate.retryable) {
        scheduleRetry(); // keep the head; retry once the window clears
        return;
      }

      queue.shift(); // permanent rejection — drop it and keep draining
    }
  };

  const handleAwaitingInput = (view: TerminalView): void => {
    const prompt = adapter.extractPrompt?.(view) ?? null;
    emit({ type: "awaiting-input", prompt });

    const reply = opts.autoRespond?.(view);
    // null/undefined = "no answer"; "" would inject a bare Enter (often a
    // default-confirm), so treat it as no answer too.
    if (reply === null || reply === undefined || reply === "") return;

    const gate = safety.gateAutoRespond(reply);
    if (!gate.allowed) {
      emit({ type: "blocked", reason: gate.reason ?? "blocked" });

      return;
    }

    inject(io.write, adapter, reply);
    safety.recordInjection(reply);
    emit({ type: "message-injected", preview: previewMessage(reply) });
  };

  const evaluate = (view: TerminalView): void => {
    const next = adapter.detectState(view, state);

    if (next === state) {
      if (next === "prompt-ready") tryInject(); // still idle — drain queue
      return;
    }

    const from = state;
    state = next;
    emit({ type: "state-changed", from, to: next });

    switch (next) {
      case "prompt-ready":
        emit({ type: "prompt-ready" });
        tryInject();
        break;
      case "awaiting-input":
        handleAwaitingInput(view);
        break;
      case "finished":
        emit({ type: "finished" });
        break;
      default:
        break;
    }
  };

  const onQuiescent = (view: TerminalView): void => {
    // A throwing matcher / extractPrompt on a malformed frame must not crash the
    // host process (this runs from a timer callback).
    try {
      evaluate(view);
    } catch {
      // swallow — one bad frame shouldn't kill the loop
    }
  };

  return {
    start(): void {
      if (reader !== null) return;
      state = "starting";
      reader = createReader(io, onQuiescent, opts.quiescenceMs ?? 250);
      unsubExit = io.onExit((code) => {
        state = "exited";
        emit({ type: "exited", code });
      });
    },
    send(message: string): void {
      queue.push(message);
      tryInject();
    },
    on(handler): () => void {
      handlers.add(handler);

      return () => handlers.delete(handler);
    },
    stop(): void {
      if (reader === null) return;
      reader.dispose();
      reader = null;
      unsubExit?.();
      unsubExit = null;
      if (retryTimer !== null) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
    },
  };
};
