// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * HMR Client Module
 * Connects to HMR WebSocket server and triggers Smart Refresh on updates
 */

import * as logging from "@eserstack/logging";
import type { LarouxGlobalThis } from "./globals.d.ts";

// The page-wide state the laroux client keeps on globalThis, with its types.
const larouxGlobals = globalThis as LarouxGlobalThis;

const hmrLogger = logging.logger.getLogger(["laroux-bundler", "hmr-client"]);

/**
 * Initialize HMR WebSocket connection
 * Connects to server and listens for update notifications
 */
export function initializeHMR(): void {
  if (typeof globalThis === "undefined") return;

  const protocol = globalThis.location.protocol === "https:" ? "wss:" : "ws:";
  const host = globalThis.location.host;
  const url = `${protocol}//${host}/hmr`;

  hmrLogger.with({ url }).debug("Connecting to WebSocket");

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
  let reloadTimeout: ReturnType<typeof setTimeout> | null = null;
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
            hmrLogger
              .with({
                changedModules: message.changedModules,
              })
              .debug("Update received");
            // Debounce reload to handle multiple rapid updates
            if (reloadTimeout) {
              clearTimeout(reloadTimeout);
            }
            reloadTimeout = setTimeout(() => {
              // Check if only CSS files changed
              const onlyCssChanged = message.changedModules?.every(
                (mod: string) => mod.endsWith(".css"),
              );

              if (onlyCssChanged) {
                hmrLogger.debug("CSS-only update, reloading stylesheet");
                // Reload CSS without full page refresh
                const links = globalThis.document.querySelectorAll(
                  'link[rel="stylesheet"]',
                );
                links.forEach((link) => {
                  const href = (link as HTMLLinkElement).href;
                  const url = new URL(href);
                  url.searchParams.set("t", Date.now().toString());
                  (link as HTMLLinkElement).href = url.toString();
                });
              } else if (
                larouxGlobals.__SMART_REFRESH_ENABLED__ === true &&
                larouxGlobals.__performSmartRefresh__ !== undefined
              ) {
                hmrLogger.debug("Attempting Smart Refresh");
                // Pass changed modules for targeted updates
                larouxGlobals
                  .__performSmartRefresh__(message.changedModules)
                  .catch((error: Error) => {
                    hmrLogger
                      .with({ error })
                      .error(
                        "Smart Refresh failed, falling back to full reload",
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
            hmrLogger.with({ message: message.message }).error("Build error");
            break;

          default:
            hmrLogger.with({ message }).warn("Unknown message type");
        }
      } catch (error) {
        hmrLogger.with({ error }).error("Failed to parse message");
      }
    });

    socket.addEventListener("close", () => {
      hmrLogger.debug("Disconnected");

      // Try to reconnect with exponential backoff
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        const delay = getReconnectDelay(reconnectAttempts);
        hmrLogger
          .with({
            attempt: reconnectAttempts,
            delayMs: delay,
          })
          .debug("Reconnecting...");
        setTimeout(connect, delay);
      } else {
        hmrLogger.warn(
          "Max reconnect attempts reached. Please reload manually.",
        );
      }
    });

    socket.addEventListener("error", (error) => {
      hmrLogger.with({ error }).error("WebSocket error");
    });
  }

  // Start connection
  connect();
}
