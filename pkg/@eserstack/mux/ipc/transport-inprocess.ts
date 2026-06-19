// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * In-process transport: a pair of directly-wired channels with no
 * serialization, for running the server and a frontend in one process.
 *
 * @module
 */

import type { Transport } from "./protocol.ts";

/** Create a connected [a, b] transport pair; a.send is delivered to b's handler. */
export const createInProcessPair = <A, B>(): readonly [
  Transport<A, B>,
  Transport<B, A>,
] => {
  let aHandler: ((msg: B) => void) | null = null;
  let bHandler: ((msg: A) => void) | null = null;
  // Per-endpoint close: closing one side stops delivery TO that side only, so a
  // frontend that closes doesn't also silence the other direction.
  let aClosed = false;
  let bClosed = false;

  const a: Transport<A, B> = {
    send(msg) {
      if (!bClosed) bHandler?.(msg);
    },
    onMessage(handler) {
      aHandler = handler;
    },
    close() {
      aClosed = true;
    },
  };

  const b: Transport<B, A> = {
    send(msg) {
      if (!aClosed) aHandler?.(msg);
    },
    onMessage(handler) {
      bHandler = handler;
    },
    close() {
      bClosed = true;
    },
  };

  return [a, b];
};
