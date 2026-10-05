// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as hmrManager from "./hmr-manager.ts";
import * as rebuildHandler from "./rebuild-handler.ts";

/** An open WebSocket stand-in that records the messages sent to it. */
function createRecordingSocket(): { socket: WebSocket; messages: unknown[] } {
  const messages: unknown[] = [];
  const socket = {
    readyState: WebSocket.OPEN,
    send: (message: string) => messages.push(JSON.parse(message)),
    addEventListener: () => {},
  } as unknown as WebSocket;

  return { socket, messages };
}

type LogEntry = {
  readonly level: "info" | "error";
  readonly message: string;
  readonly attributes: Record<string, unknown>;
};

/** A logger that records its entries, with the attributes of with(). */
function createRecordingLogger(
  entries: LogEntry[],
  attributes: Record<string, unknown> = {},
): rebuildHandler.RebuildLogger {
  return {
    info: (message) => entries.push({ level: "info", message, attributes }),
    error: (message) => entries.push({ level: "error", message, attributes }),
    with: (more) => createRecordingLogger(entries, { ...attributes, ...more }),
  };
}

/**
 * A dev server's HMR side with one connected client, and what it records.
 * loadModules stands in for loading the rebuilt server modules.
 */
function createDevServer(
  loadModules: (buildId: string) => Promise<void> = () => Promise.resolve(),
) {
  const hmr = new hmrManager.HMRManager();
  const client = createRecordingSocket();
  hmr.handleConnection(client.socket);
  // Drop the "connected" message the client gets on connection
  client.messages.length = 0;

  const logs: LogEntry[] = [];
  const loads: { buildId: string; clientMessagesBefore: number }[] = [];

  const onRebuild = rebuildHandler.createRebuildHandler({
    hmr,
    onRebuilt: async (buildId) => {
      loads.push({ buildId, clientMessagesBefore: client.messages.length });
      await loadModules(buildId);
    },
    logger: createRecordingLogger(logs),
  });

  return { onRebuild, clientMessages: client.messages, logs, loads };
}

const SUCCESSFUL_REBUILD: rebuildHandler.RebuildOutcome = {
  success: true,
  buildId: "01J9REBUILT",
  duration: 42,
  timestamp: 1_700_000_000_000,
  changedFiles: ["src/app/routes/home/page.tsx"],
};

Deno.test("a failed rebuild is logged as an error, loads nothing and sends no HMR update", async () => {
  const server = createDevServer();

  await server.onRebuild({ ...SUCCESSFUL_REBUILD, success: false });

  assert.assertEquals(server.clientMessages, [
    { type: "error", message: rebuildHandler.REBUILD_FAILED_MESSAGE },
  ]);
  assert.assertEquals(server.logs.map((log) => log.level), ["error"]);
  assert.assertStringIncludes(server.logs[0]?.message ?? "", "Rebuild failed");
  assert.assertEquals(server.loads, []);
});

Deno.test("a successful rebuild loads the rebuilt modules, then sends the HMR update", async () => {
  const server = createDevServer();

  await server.onRebuild(SUCCESSFUL_REBUILD);

  // The modules load with the rebuild's id before any client hears of it
  assert.assertEquals(server.loads, [
    { buildId: "01J9REBUILT", clientMessagesBefore: 0 },
  ]);
  assert.assertEquals(server.clientMessages, [{
    type: "update",
    timestamp: 1_700_000_000_000,
    changedModules: ["src/app/routes/home/page.tsx"],
  }]);
  assert.assertEquals(server.logs, [
    { level: "info", message: "✓ Compiled in 42ms", attributes: {} },
  ]);
});

Deno.test("rebuilt modules that fail to load are logged with the error and send the clients an error", async () => {
  const failure = new Error("import page.js: SyntaxError");
  const server = createDevServer(() => Promise.reject(failure));

  await server.onRebuild(SUCCESSFUL_REBUILD);

  assert.assertEquals(server.clientMessages, [
    { type: "error", message: rebuildHandler.RELOAD_FAILED_MESSAGE },
  ]);
  assert.assertEquals(server.logs.length, 1);
  assert.assertEquals(server.logs[0]?.level, "error");
  assert.assertEquals(server.logs[0]?.attributes, {
    buildId: "01J9REBUILT",
    error: failure,
  });
});

Deno.test("a rebuild without HMR only loads the modules and logs its outcome", async () => {
  const logs: LogEntry[] = [];
  const loadedBuildIds: string[] = [];
  const onRebuild = rebuildHandler.createRebuildHandler({
    hmr: null,
    onRebuilt: (buildId) => {
      loadedBuildIds.push(buildId);
      return Promise.resolve();
    },
    logger: createRecordingLogger(logs),
  });

  await onRebuild({ ...SUCCESSFUL_REBUILD, duration: 7 });
  await onRebuild({ ...SUCCESSFUL_REBUILD, success: false });

  assert.assertEquals(loadedBuildIds, ["01J9REBUILT"]);
  assert.assertEquals(logs.map((log) => log.message.slice(0, 16)), [
    "✓ Compiled in 7m",
    "✗ Rebuild failed",
  ]);
});
