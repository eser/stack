// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Quiescence-debounced terminal reader.
 *
 * Agent TUIs repaint with cursor moves, spinners, and partial redraws, so the
 * raw byte stream is noisy. Instead of classifying every chunk, this waits for a
 * short gap in output and then snapshots a stable {@link TerminalView} for the
 * driving loop to evaluate.
 *
 * @module
 */

import type { TerminalView } from "../adapter.ts";

export type ReaderIo = {
  /** Subscribe to output chunks; returns an unsubscribe fn. */
  onOutput(cb: (chunk: string) => void): () => void;
  /** Snapshot the current terminal grid. */
  getView(): TerminalView;
};

export type Reader = { dispose(): void };

export const createReader = (
  io: ReaderIo,
  onQuiescent: (view: TerminalView) => void,
  quiescenceMs = 250,
): Reader => {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const schedule = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      onQuiescent(io.getView());
    }, quiescenceMs);
  };

  const unsubscribe = io.onOutput(schedule);

  return {
    dispose(): void {
      if (timer !== null) clearTimeout(timer);
      unsubscribe();
    },
  };
};
