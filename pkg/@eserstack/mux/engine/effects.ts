// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Effect descriptors emitted by the reducer.
 *
 * The reducer stays pure: instead of performing I/O it returns a list of
 * effects that the (impure) server interprets — spawning/killing PTYs, writing
 * input, requesting a render, or exiting. Pane resizing is NOT an effect: the
 * server recomputes geometry after each reduce and resizes any pane whose rect
 * changed, so layout changes need no explicit effect.
 *
 * @module
 */

import type { PaneId, ScrollAction } from "./types.ts";

export type Effect =
  /** Spawn the process for a newly-created pane (server reads the descriptor). */
  | { readonly type: "spawnPty"; readonly pane: PaneId }
  /** Write raw bytes to a pane's process (focused-terminal passthrough). */
  | { readonly type: "writePty"; readonly pane: PaneId; readonly data: string }
  /** Kill a pane's process (pane/tab closed). */
  | { readonly type: "killPty"; readonly pane: PaneId }
  /** Scroll a pane's scrollback viewport. */
  | {
    readonly type: "scrollPane";
    readonly pane: PaneId;
    readonly action: ScrollAction;
  }
  /** Ask the scheduler to composite and broadcast a frame. */
  | { readonly type: "render" }
  /** Detach the current client(s) but keep the session alive. */
  | { readonly type: "detach" }
  /** Tear down the session and exit. */
  | { readonly type: "exit" };

/** Result of a single reduce step: the next state plus effects to run. */
export type ReducerResult = {
  readonly state: import("./types.ts").MuxState;
  readonly effects: readonly Effect[];
};
