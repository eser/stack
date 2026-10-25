// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * SSE event stream — pushes dashboard events to connected clients.
 *
 * @module
 */

import * as dashboard from "@eserstack/noskills/dashboard";

/** A comment frame every 30 s keeps proxies from closing an idle stream. */
const KEEPALIVE_INTERVAL_MS = 30_000;

/** Subscribes to dashboard events and returns the function that unsubscribes. */
export type WatchEvents = typeof dashboard.watchEvents;

/**
 * GET /events: the Server-Sent Events stream of dashboard events.
 *
 * `watchEvents` defaults to the dashboard's event-file watcher; tests pass a
 * fake to observe the subscription without polling the file system.
 */
export const handleSSE = (
  root: string,
  watchEvents: WatchEvents = dashboard.watchEvents,
): Response => {
  const encoder = new TextEncoder();

  // The watcher and the keepalive timer belong to this stream: start() creates
  // them, and cancel() (the client disconnected) or a failed enqueue releases
  // them, so a closed tab leaves no polling behind.
  let unsubscribe: (() => void) | null = null;
  let keepalive: ReturnType<typeof setInterval> | null = null;

  const release = (): void => {
    if (keepalive !== null) {
      clearInterval(keepalive);
      keepalive = null;
    }
    if (unsubscribe !== null) {
      unsubscribe();
      unsubscribe = null;
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (chunk: string): void => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // The stream is already closed; stop producing for it.
          release();
        }
      };

      send(": connected\n\n");

      unsubscribe = watchEvents(root, (event) => {
        send(`data: ${JSON.stringify(event)}\n\n`);
      });

      keepalive = setInterval(
        () => send(": keepalive\n\n"),
        KEEPALIVE_INTERVAL_MS,
      );
    },
    cancel() {
      release();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
  });
};
