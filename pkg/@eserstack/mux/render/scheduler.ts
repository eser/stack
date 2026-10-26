// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * A single coalescing render scheduler.
 *
 * Replaces the per-PTY `setTimeout` storms of the old multiplexer: every source
 * of change calls `schedule()`, and at most one render fires per frame (~60fps).
 * `requestFull()` marks the next frame as a full repaint.
 *
 * @module
 */

export type RenderScheduler = {
  /** Request a render on the next frame (coalesced). */
  schedule(): void;
  /** Request a full repaint on the next frame. */
  requestFull(): void;
  /** Cancel any pending frame. */
  stop(): void;
};

export const createScheduler = (
  render: (fullRedraw: boolean) => void,
  frameMs = 16,
): RenderScheduler => {
  let pending = false;
  let full = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const fire = (): void => {
    pending = false;
    timer = null;
    const wasFull = full;
    full = false;
    render(wasFull);
  };

  const schedule = (): void => {
    if (pending) return;
    pending = true;
    timer = setTimeout(fire, frameMs);
  };

  return {
    schedule,
    requestFull(): void {
      full = true;
      schedule();
    },
    stop(): void {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      pending = false;
    },
  };
};
