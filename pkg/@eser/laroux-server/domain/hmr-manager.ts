// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * HMR (Hot Module Replacement) Manager
 * Handles WebSocket connections and notifies clients of updates
 */

import * as logging from "@eser/logging";

const hmrLogger = logging.logger.getLogger(["laroux-server", "hmr"]);

/**
 * HMR message types
 */
export type HMRMessage =
  | { type: "connected" }
  | { type: "update"; timestamp: number; changedModules?: string[] }
  | { type: "error"; message: string };

/**
 * HMR Manager
 * Manages WebSocket connections for hot module replacement
 */
export class HMRManager {
  private clients: Set<WebSocket> = new Set();

  /**
   * Handle incoming WebSocket connection
   */
  handleConnection(socket: WebSocket): void {
    this.clients.add(socket);
    hmrLogger.debug(`HMR client connected (${this.clients.size} total)`);

    // Send connected message
    this.sendToClient(socket, { type: "connected" });

    // Handle close
    socket.addEventListener("close", () => {
      this.clients.delete(socket);
      hmrLogger.debug(
        `HMR client disconnected (${this.clients.size} remaining)`,
      );
    });

    // Handle errors
    socket.addEventListener("error", (event) => {
      hmrLogger.error("HMR WebSocket error:", { event });
      this.clients.delete(socket);
    });
  }

  /**
   * Notify all connected clients of an update
   */
  notifyUpdate(
    timestamp: number = Date.now(),
    changedModules?: string[],
  ): void {
    const message: HMRMessage = { type: "update", timestamp, changedModules };
    hmrLogger.debug(
      `Notifying ${this.clients.size} clients of update${
        changedModules ? ` (${changedModules.length} modules changed)` : ""
      }`,
    );

    for (const client of this.clients) {
      this.sendToClient(client, message);
    }
  }

  /**
   * Send error message to all clients
   */
  notifyError(errorMessage: string): void {
    const message: HMRMessage = { type: "error", message: errorMessage };
    hmrLogger.warn(`Notifying clients of error: ${errorMessage}`);

    for (const client of this.clients) {
      this.sendToClient(client, message);
    }
  }

  /**
   * Send message to specific client
   */
  private sendToClient(client: WebSocket, message: HMRMessage): void {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(JSON.stringify(message));
      } catch (error) {
        hmrLogger.error("Failed to send HMR message:", { error });
      }
    }
  }

  /**
   * Get number of connected clients
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Close all connections
   */
  close(): void {
    for (const client of this.clients) {
      client.close();
    }
    this.clients.clear();
  }
}
