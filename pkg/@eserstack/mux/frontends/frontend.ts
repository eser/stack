// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * A frontend consumes the neutral server feed (scene + output) and produces
 * input actions. The TUI and web frontends both implement this contract.
 *
 * @module
 */

import type { ServerToFrontend } from "../ipc/protocol.ts";

export type Frontend = {
  /** Apply a message from the server (scene delta / output / exit). */
  handle(msg: ServerToFrontend): void;
  /** Enter raw mode, attach, and pump input until stopped. Resolves on exit. */
  run(): Promise<void>;
  /** Restore the terminal and tear down. */
  stop(): void;
  /** Request a re-render (e.g. after decoration data changed). */
  refresh(): void;
};
