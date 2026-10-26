// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * HMR Manager Tests
 * Tests for Hot Module Replacement WebSocket management
 */

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as hmrManager from "../domain/hmr-manager.ts";

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

/** The one message a socket received, parsed; fails unless there is one. */
function onlyMessage(messages: readonly string[]): hmrManager.HMRMessage {
  const [message, ...rest] = messages;
  assert.assertExists(message, "the socket received no message");
  assert.assertEquals(rest, [], "the socket received more than one message");

  return JSON.parse(message);
}

nodeTest.test("HMRManager - initial client count is zero", () => {
  const manager = new hmrManager.HMRManager();
  assert.assertEquals(manager.getClientCount(), 0);
});

nodeTest.test("HMRManager - handleConnection increases client count", () => {
  const manager = new hmrManager.HMRManager();
  const { socket } = createMockSocket();

  manager.handleConnection(socket);
  assert.assertEquals(manager.getClientCount(), 1);
});

nodeTest.test("HMRManager - sends connected message on connection", () => {
  const manager = new hmrManager.HMRManager();
  const { socket, messages } = createMockSocket();

  manager.handleConnection(socket);

  assert.assertEquals(onlyMessage(messages), { type: "connected" });
});

nodeTest.test("HMRManager - notifyUpdate broadcasts to all clients", () => {
  const manager = new hmrManager.HMRManager();
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
  const expected: hmrManager.HMRMessage = {
    type: "update",
    timestamp,
    changedModules,
  };
  assert.assertEquals(onlyMessage(mock1.messages), expected);
  assert.assertEquals(onlyMessage(mock2.messages), expected);
});

nodeTest.test(
  "HMRManager - notifyError broadcasts error to all clients",
  () => {
    const manager = new hmrManager.HMRManager();
    const { socket, messages } = createMockSocket();

    manager.handleConnection(socket);
    messages.length = 0; // Clear connected message

    const errorMessage = "Build failed: syntax error";
    manager.notifyError(errorMessage);

    assert.assertEquals(onlyMessage(messages), {
      type: "error",
      message: errorMessage,
    });
  },
);

nodeTest.test("HMRManager - removes client on disconnect", () => {
  const manager = new hmrManager.HMRManager();
  const { socket, closeHandlers } = createMockSocket();

  manager.handleConnection(socket);
  assert.assertEquals(manager.getClientCount(), 1);

  // Simulate disconnect
  closeHandlers.forEach((h) => h());
  assert.assertEquals(manager.getClientCount(), 0);
});

nodeTest.test("HMRManager - removes client on error", () => {
  const manager = new hmrManager.HMRManager();
  const { socket, errorHandlers } = createMockSocket();

  manager.handleConnection(socket);
  assert.assertEquals(manager.getClientCount(), 1);

  // Simulate error
  errorHandlers.forEach((h) => h(new Event("error")));
  assert.assertEquals(manager.getClientCount(), 0);
});

nodeTest.test("HMRManager - close disconnects all clients", () => {
  const manager = new hmrManager.HMRManager();
  const mock1 = createMockSocket();
  const mock2 = createMockSocket();

  manager.handleConnection(mock1.socket);
  manager.handleConnection(mock2.socket);
  assert.assertEquals(manager.getClientCount(), 2);

  manager.close();
  assert.assertEquals(manager.getClientCount(), 0);
});

nodeTest.test("HMRManager - skips closed sockets when sending", () => {
  const manager = new hmrManager.HMRManager();
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
  assert.assertEquals(messages.length, 0);
});

nodeTest.test("HMRManager - handles multiple simultaneous connections", () => {
  const manager = new hmrManager.HMRManager();
  const sockets = Array.from({ length: 10 }, () => createMockSocket());

  sockets.forEach(({ socket }) => manager.handleConnection(socket));
  assert.assertEquals(manager.getClientCount(), 10);

  // Send update
  manager.notifyUpdate(Date.now(), ["test.tsx"]);

  // All should receive (connected + update = 2 messages each)
  sockets.forEach(({ messages }) => {
    assert.assertEquals(messages.length, 2);
  });
});
