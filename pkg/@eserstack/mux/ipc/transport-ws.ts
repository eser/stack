// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * WebSocket transport for the neutral mux protocol.
 *
 * Adapts a `WebSocket` (Deno's `upgradeWebSocket` result on the server, or the
 * browser's `WebSocket` on the client) to a {@link Transport}. Messages are
 * JSON; pane output rides as a string field, so no binary framing is needed.
 *
 * Because the server keeps panes alive across disconnects, a dropped socket just
 * stops delivery; a fresh socket + `server.connect` resumes with a full scene.
 *
 * @module
 */

import type { Transport } from "./protocol.ts";

export type WsTransportOptions = {
  /** Called when the socket closes (e.g. so the server can drop the sink). */
  readonly onClose?: () => void;
};

export const wsTransport = <Out, In>(
  socket: WebSocket,
  opts: WsTransportOptions = {},
): Transport<Out, In> => {
  let handler: ((msg: In) => void) | null = null;

  socket.addEventListener("message", (ev: MessageEvent) => {
    if (typeof ev.data !== "string") return;

    let msg: In;
    try {
      msg = JSON.parse(ev.data) as In;
    } catch {
      return; // ignore malformed frames
    }

    handler?.(msg);
  });

  if (opts.onClose !== undefined) {
    socket.addEventListener("close", () => opts.onClose?.());
  }

  return {
    send(msg: Out): void {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(msg));
      }
    },
    onMessage(h: (msg: In) => void): void {
      handler = h;
    },
    close(): void {
      try {
        socket.close();
      } catch {
        // already closing/closed
      }
    },
  };
};
