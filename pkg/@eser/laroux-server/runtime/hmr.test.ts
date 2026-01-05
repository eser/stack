// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * HMR Manager Tests
 * Tests for Hot Module Replacement WebSocket management
 */

import { assertEquals } from "@std/assert";
import { HMRManager } from "../domain/hmr-manager.ts";

/**
 * Create a mock WebSocket for testing
 */
function createMockSocket(): {
  socket: WebSocket;
  messages: string[];
  closeHandlers: (() => void)[];
  errorHandlers: ((event: Event) => void)[];
} {
  const messages: string[] = [];
  const closeHandlers: (() => void)[] = [];
  const errorHandlers: ((event: Event) => void)[] = [];

  const socket = {
    readyState: WebSocket.OPEN,
    send: (msg: string) => messages.push(msg),
    close: () => {
      closeHandlers.forEach((h) => h());
    },
    addEventListener: (
      event: string,
      handler: (() => void) | ((event: Event) => void),
    ) => {
      if (event === "close") {
        closeHandlers.push(handler as () => void);
      } else if (event === "error") {
        errorHandlers.push(handler as (event: Event) => void);
      }
    },
  } as unknown as WebSocket;

  return { socket, messages, closeHandlers, errorHandlers };
}

Deno.test("HMRManager - initial client count is zero", () => {
  const manager = new HMRManager();
  assertEquals(manager.getClientCount(), 0);
});

Deno.test("HMRManager - handleConnection increases client count", () => {
  const manager = new HMRManager();
  const { socket } = createMockSocket();

  manager.handleConnection(socket);
  assertEquals(manager.getClientCount(), 1);
});

Deno.test("HMRManager - sends connected message on connection", () => {
  const manager = new HMRManager();
  const { socket, messages } = createMockSocket();

  manager.handleConnection(socket);

  assertEquals(messages.length, 1);
  const msg = JSON.parse(messages[0]);
  assertEquals(msg.type, "connected");
});

Deno.test("HMRManager - notifyUpdate broadcasts to all clients", () => {
  const manager = new HMRManager();
  const mock1 = createMockSocket();
  const mock2 = createMockSocket();

  manager.handleConnection(mock1.socket);
  manager.handleConnection(mock2.socket);

  // Clear connected messages
  mock1.messages.length = 0;
  mock2.messages.length = 0;

  const timestamp = Date.now();
  const changedModules = ["src/app/page.tsx"];
  manager.notifyUpdate(timestamp, changedModules);

  // Both clients should receive the update
  assertEquals(mock1.messages.length, 1);
  assertEquals(mock2.messages.length, 1);

  const msg1 = JSON.parse(mock1.messages[0]);
  assertEquals(msg1.type, "update");
  assertEquals(msg1.timestamp, timestamp);
  assertEquals(msg1.changedModules, changedModules);

  const msg2 = JSON.parse(mock2.messages[0]);
  assertEquals(msg2.type, "update");
  assertEquals(msg2.changedModules, changedModules);
});

Deno.test("HMRManager - notifyError broadcasts error to all clients", () => {
  const manager = new HMRManager();
  const { socket, messages } = createMockSocket();

  manager.handleConnection(socket);
  messages.length = 0; // Clear connected message

  const errorMessage = "Build failed: syntax error";
  manager.notifyError(errorMessage);

  assertEquals(messages.length, 1);
  const msg = JSON.parse(messages[0]);
  assertEquals(msg.type, "error");
  assertEquals(msg.message, errorMessage);
});

Deno.test("HMRManager - removes client on disconnect", () => {
  const manager = new HMRManager();
  const { socket, closeHandlers } = createMockSocket();

  manager.handleConnection(socket);
  assertEquals(manager.getClientCount(), 1);

  // Simulate disconnect
  closeHandlers.forEach((h) => h());
  assertEquals(manager.getClientCount(), 0);
});

Deno.test("HMRManager - removes client on error", () => {
  const manager = new HMRManager();
  const { socket, errorHandlers } = createMockSocket();

  manager.handleConnection(socket);
  assertEquals(manager.getClientCount(), 1);

  // Simulate error
  errorHandlers.forEach((h) => h(new Event("error")));
  assertEquals(manager.getClientCount(), 0);
});

Deno.test("HMRManager - close disconnects all clients", () => {
  const manager = new HMRManager();
  const mock1 = createMockSocket();
  const mock2 = createMockSocket();

  manager.handleConnection(mock1.socket);
  manager.handleConnection(mock2.socket);
  assertEquals(manager.getClientCount(), 2);

  manager.close();
  assertEquals(manager.getClientCount(), 0);
});

Deno.test("HMRManager - skips closed sockets when sending", () => {
  const manager = new HMRManager();
  const messages: string[] = [];

  // Create a socket that is already closed
  const closedSocket = {
    readyState: WebSocket.CLOSED,
    send: (msg: string) => messages.push(msg),
    close: () => {},
    addEventListener: () => {},
  } as unknown as WebSocket;

  manager.handleConnection(closedSocket);
  manager.notifyUpdate(Date.now(), ["test.tsx"]);

  // Should not have sent the update (only connected message attempt)
  // The closed socket should be skipped
  assertEquals(messages.length, 0);
});

Deno.test("HMRManager - handles multiple simultaneous connections", () => {
  const manager = new HMRManager();
  const sockets = Array.from({ length: 10 }, () => createMockSocket());

  sockets.forEach(({ socket }) => manager.handleConnection(socket));
  assertEquals(manager.getClientCount(), 10);

  // Send update
  manager.notifyUpdate(Date.now(), ["test.tsx"]);

  // All should receive (connected + update = 2 messages each)
  sockets.forEach(({ messages }) => {
    assertEquals(messages.length, 2);
  });
});
