// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * HMR Client Module
 * Connects to HMR WebSocket server and triggers Smart Refresh on updates
 */

/// <reference path="./globals.d.ts" />
import * as logging from "@eserstack/logging";

const hmrLogger = logging.logger.getLogger([
  "laroux-bundler",
  "hmr-client",
]);

/**
 * Initialize HMR WebSocket connection
 * Connects to server and listens for update notifications
 */
export function initializeHMR(): void {
  if (typeof globalThis === "undefined") return;

  const protocol = globalThis.location.protocol === "https:" ? "wss:" : "ws:";
  const host = globalThis.location.host;
  const url = `${protocol}//${host}/hmr`;

  hmrLogger.debug("Connecting to WebSocket", { url });

  let socket: WebSocket;
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 10;
  const BASE_RECONNECT_DELAY = 500;
  const MAX_RECONNECT_DELAY = 5000;

  /**
   * Calculate reconnection delay with exponential backoff
   * Starts at 500ms and increases by 1.5x each attempt, capped at 5 seconds
   */
  function getReconnectDelay(attempt: number): number {
    return Math.min(
      BASE_RECONNECT_DELAY * Math.pow(1.5, attempt),
      MAX_RECONNECT_DELAY,
    );
  }

  // Debouncing for reload
  let reloadTimeout: number | null = null;
  const RELOAD_DEBOUNCE_MS = 100; // Wait 100ms for multiple updates

  function connect() {
    socket = new WebSocket(url);

    socket.addEventListener("open", () => {
      hmrLogger.debug("Connected");
      reconnectAttempts = 0;
    });

    socket.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(event.data);

        switch (message.type) {
          case "connected":
            hmrLogger.debug("Ready for updates");
            break;

          case "update":
            hmrLogger.debug("Update received", {
              changedModules: message.changedModules,
            });
            // Debounce reload to handle multiple rapid updates
            if (reloadTimeout) {
              clearTimeout(reloadTimeout);
            }
            reloadTimeout = setTimeout(() => {
              // Check if only CSS files changed
              const onlyCssChanged = message.changedModules?.every((
                mod: string,
              ) => mod.endsWith(".css"));

              if (onlyCssChanged) {
                hmrLogger.debug("CSS-only update, reloading stylesheet");
                // Reload CSS without full page refresh
                const links = document.querySelectorAll(
                  'link[rel="stylesheet"]',
                );
                links.forEach((link) => {
                  const href = (link as HTMLLinkElement).href;
                  const url = new URL(href);
                  url.searchParams.set("t", Date.now().toString());
                  (link as HTMLLinkElement).href = url.toString();
                });
              } else if (
                globalThis.__SMART_REFRESH_ENABLED__ &&
                globalThis.__performSmartRefresh__
              ) {
                hmrLogger.debug("Attempting Smart Refresh");
                // Pass changed modules for targeted updates
                globalThis.__performSmartRefresh__(
                  message.changedModules,
                )
                  .catch((error: Error) => {
                    hmrLogger.error(
                      "Smart Refresh failed, falling back to full reload",
                      { error },
                    );
                    globalThis.location.reload();
                  });
              } else {
                hmrLogger.warn("Smart Refresh not available, reloading");
                globalThis.location.reload();
              }
            }, RELOAD_DEBOUNCE_MS);
            break;

          case "error":
            hmrLogger.error("Build error", { message: message.message });
            break;

          default:
            hmrLogger.warn("Unknown message type", { message });
        }
      } catch (error) {
        hmrLogger.error("Failed to parse message", { error });
      }
    });

    socket.addEventListener("close", () => {
      hmrLogger.debug("Disconnected");

      // Try to reconnect with exponential backoff
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        const delay = getReconnectDelay(reconnectAttempts);
        hmrLogger.debug("Reconnecting...", {
          attempt: reconnectAttempts,
          delayMs: delay,
        });
        setTimeout(connect, delay);
      } else {
        hmrLogger.warn(
          "Max reconnect attempts reached. Please reload manually.",
        );
      }
    });

    socket.addEventListener("error", (error) => {
      hmrLogger.error("WebSocket error", { error });
    });
  }

  // Start connection
  connect();
}
