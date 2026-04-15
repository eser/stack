// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * SSE event stream — pushes dashboard events to connected clients.
 *
 * @module
 */

import * as dashboard from "@eserstack/noskills/dashboard";

/** GET /events — Server-Sent Events stream. */
export const handleSSE = (root: string): Response => {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send initial keepalive
      controller.enqueue(encoder.encode(": connected\n\n"));

      // Watch for events
      const unsub = dashboard.watchEvents(root, (event) => {
        const data = JSON.stringify(event);
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      });

      // Keepalive every 30s
      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          clearInterval(keepalive);
          unsub();
        }
      }, 30000);

      // Cleanup on close
      // Note: ReadableStream cancel is called when client disconnects
    },
    cancel() {
      // Client disconnected — cleanup happens via GC of unsub/keepalive closures
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      "connection": "keep-alive",
    },
  });
};
