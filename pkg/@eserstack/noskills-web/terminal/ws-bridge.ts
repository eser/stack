// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * WebSocket ↔ mux bridge.
 *
 * Upgrades a browser WebSocket and wires it to the {@link MuxHost}'s server over
 * the neutral mux protocol: the server streams scene diffs + per-pane output to
 * the browser, and the browser sends attach/resize/action messages back. One
 * socket carries the whole multiplexer (every tab and pane), not a single PTY.
 *
 * @module
 */

import * as mux from "@eserstack/mux";
import type { MuxHost } from "./mux-host.ts";
import { sanitizeRemoteMessage } from "./sanitize.ts";

/**
 * Handle a WebSocket upgrade and attach it to the mux server.
 *
 * The caller is responsible for authenticating the upgrade (see `../auth.ts`);
 * by the time this runs the request has already cleared the Origin and token
 * checks.
 */
export const handleMuxWs = (request: Request, host: MuxHost): Response => {
  const { socket, response } = Deno.upgradeWebSocket(request);

  // The browser is the frontend: the server sends `ServerToFrontend`, receives
  // `FrontendToServer`. wsTransport registers its listeners synchronously and
  // guards send() on the socket being OPEN, so connect() can run immediately —
  // the onMessage handler is set before any frame can arrive (the WS spec fires
  // `open` before any `message`). onClose drops the sink so the server stops
  // addressing a dead socket; the server keeps every pane alive for reconnect.
  const raw = mux.wsTransport<mux.ServerToFrontend, mux.FrontendToServer>(
    socket,
    { onClose: () => host.server.disconnect(transport) },
  );

  // Every inbound frame crosses a trust boundary here. Sanitizing in the
  // transport wrapper (rather than at each call site downstream) means no
  // future handler can accidentally consume the unsanitized form.
  const transport: mux.Transport<mux.ServerToFrontend, mux.FrontendToServer> = {
    send: (msg) => raw.send(msg),
    onMessage: (handler) =>
      raw.onMessage((msg) => handler(sanitizeRemoteMessage(msg))),
    close: () => raw.close(),
  };

  host.server.connect(transport);

  return response;
};
