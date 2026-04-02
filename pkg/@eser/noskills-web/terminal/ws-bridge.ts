// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * WebSocket ↔ PTY bridge — connects a browser terminal to a PTY process.
 *
 * @module
 */

import type { PtyManager } from "./pty-manager.ts";

/** Handle a WebSocket upgrade for a terminal tab. */
export const handleTerminalWs = (
  request: Request,
  tabId: string,
  ptyManager: PtyManager,
): Response => {
  const tab = ptyManager.getTab(tabId);
  if (tab === undefined || tab.pty === null) {
    return new Response("Tab not found or PTY not available", { status: 404 });
  }

  const { socket, response } = Deno.upgradeWebSocket(request);
  const pty = tab.pty;

  // PTY stdout → WebSocket
  pty.onData((data: string) => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(data);
    }
  });

  // WebSocket → PTY stdin
  socket.onmessage = (event: MessageEvent) => {
    if (typeof event.data === "string") {
      // Check for resize messages: {"type":"resize","cols":N,"rows":N}
      if (event.data.startsWith("{")) {
        try {
          const msg = JSON.parse(event.data) as {
            type?: string;
            cols?: number;
            rows?: number;
          };
          if (
            msg.type === "resize" && typeof msg.cols === "number" &&
            typeof msg.rows === "number"
          ) {
            pty.resize(msg.cols, msg.rows);
            return;
          }
        } catch {
          // Not JSON — pass through as terminal input
        }
      }
      pty.write(event.data);
    }
  };

  socket.onclose = () => {
    // Don't kill PTY on disconnect — allow reconnect
  };

  return response;
};
