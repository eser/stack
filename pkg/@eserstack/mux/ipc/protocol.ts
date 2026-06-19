// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The neutral wire protocol between a mux server and a frontend.
 *
 * The same messages flow whether the transport is an in-process channel, a
 * local socket / named pipe, or a WebSocket — so the server never knows or
 * cares which kind of frontend (ANSI TUI, browser xterm.js) it is feeding.
 *
 * @module
 */

import type { Action, PaneId, Viewport } from "../engine/types.ts";
import type { SceneDelta } from "../scene/diff.ts";

/** Server → frontend. */
export type ServerToFrontend =
  | { readonly t: "scene"; readonly full: boolean; readonly delta: SceneDelta }
  | { readonly t: "output"; readonly pane: PaneId; readonly data: string }
  | { readonly t: "exit"; readonly code: number };

/** Frontend → server. */
export type FrontendToServer =
  | { readonly t: "attach"; readonly viewport: Viewport }
  | { readonly t: "action"; readonly action: Action }
  | { readonly t: "resize"; readonly viewport: Viewport };

/** A bidirectional message channel. In-process or serialized — same shape. */
export type Transport<Out, In> = {
  send(msg: Out): void;
  onMessage(handler: (msg: In) => void): void;
  close(): void;
};
