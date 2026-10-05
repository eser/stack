// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * WebSocket ↔ mux bridge.
 *
 * Upgrades a browser WebSocket and attaches it to the {@link MuxHost}, which
 * speaks the neutral mux protocol over it: scene diffs and per-pane output go to
 * the browser, and attach/resize/action messages come back. One socket carries
 * the whole multiplexer (every tab and pane), not a single PTY.
 *
 * @module
 */

import { runtime } from "@eserstack/standards/cross-runtime";
import type { MuxHost } from "./mux-host.ts";

/**
 * Handle a WebSocket upgrade and attach it to the mux server.
 *
 * The caller is responsible for authenticating the upgrade (see `../auth.ts`);
 * by the time this runs the request has already cleared the Origin and token
 * checks.
 */
export const handleMuxWs = (request: Request, host: MuxHost): Response => {
  const { socket, response } = runtime.http.upgradeWebSocket(request);

  // attachSocket registers its listeners synchronously, before the handler
  // returns `response`, so no frame can arrive ahead of them.
  host.attachSocket(socket);

  return response;
};
