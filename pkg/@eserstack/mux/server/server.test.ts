// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { assert, assertEquals } from "@std/assert";
import { createInitialState } from "../engine/reducer.ts";
import { createInProcessPair } from "../ipc/transport-inprocess.ts";
import type { FrontendToServer, ServerToFrontend } from "../ipc/protocol.ts";
import type { PtyHost, PtyHostCallbacks } from "./pty-host.ts";
import { createServer } from "./server.ts";

/** A fake PTY host that records calls and lets the test drive output/exit. */
const makeFakeHost = () => {
  const spawned: string[] = [];
  const killed: string[] = [];
  const writes: Array<[string, string]> = [];
  let cb: PtyHostCallbacks;

  const factory = (callbacks: PtyHostCallbacks): PtyHost => {
    cb = callbacks;

    return {
      spawn: (req) => {
        spawned.push(req.pane);
        return Promise.resolve();
      },
      write: (pane, data) => {
        writes.push([pane, data]);
      },
      resize: () => {},
      kill: (pane) => {
        killed.push(pane);
      },
      forget: () => {},
      killAll: () => Promise.resolve(),
      has: (pane) => spawned.includes(pane) && !killed.includes(pane),
    };
  };

  return {
    factory,
    spawned,
    killed,
    writes,
    emit: (pane: string, data: string) => cb.onData(pane, data),
    exit: (pane: string, code: number) => cb.onExit(pane, code),
  };
};

const setup = () => {
  const fake = makeFakeHost();
  const server = createServer({
    initialState: createInitialState({ cols: 80, rows: 24 }),
    resolveSpawn: () => ({ command: "sh", args: [] }),
    createHost: fake.factory,
  });

  const [serverSide, frontendSide] = createInProcessPair<
    ServerToFrontend,
    FrontendToServer
  >();
  const received: ServerToFrontend[] = [];
  frontendSide.onMessage((m) => received.push(m));
  server.connect(serverSide);

  return { fake, server, frontendSide, received };
};

Deno.test("attach pushes a full scene", () => {
  const { server, frontendSide, received } = setup();
  server.dispatch({ type: "newTab" });
  received.length = 0;

  frontendSide.send({ t: "attach", viewport: { cols: 100, rows: 30 } });

  const scene = received.find((m) => m.t === "scene");
  assertEquals(scene?.t === "scene" && scene.full, true);
  assertEquals(scene?.t === "scene" ? scene.delta.viewport : null, {
    cols: 100,
    rows: 30,
  });
});

Deno.test("newTab spawns a pane and broadcasts it", () => {
  const { fake, server, received } = setup();
  server.dispatch({ type: "newTab" });

  assertEquals(fake.spawned.length, 1);
  const scene = received.find((m) => m.t === "scene");
  assertEquals(scene?.t === "scene" ? scene.delta.panes?.length : 0, 1);
});

Deno.test("pane output is forwarded to the frontend", () => {
  const { fake, server, received } = setup();
  server.dispatch({ type: "newTab" });
  const pane = fake.spawned[0]!;
  received.length = 0;

  fake.emit(pane, "hello");

  assertEquals(received, [{ t: "output", pane, data: "hello" }]);
});

Deno.test("writeInput reaches the focused pane's process", () => {
  const { fake, server } = setup();
  server.dispatch({ type: "newTab" });
  const pane = fake.spawned[0]!;

  server.dispatch({ type: "writeInput", data: "ls\r" });
  assertEquals(fake.writes, [[pane, "ls\r"]]);
});

Deno.test("writeToPane reaches a specific pane even when another is focused", () => {
  const { fake, server } = setup();
  server.dispatch({ type: "newTab" });
  server.dispatch({ type: "splitPane", direction: "vertical" });
  const [first, second] = fake.spawned;
  fake.writes.length = 0;

  // second is focused after the split; address `first` explicitly.
  server.dispatch({ type: "writeToPane", pane: first!, data: "ping\r" });
  assertEquals(fake.writes, [[first!, "ping\r"]]);

  // sanity: writeInput still hits the focused pane.
  server.dispatch({ type: "writeInput", data: "x" });
  assertEquals(fake.writes[1], [second!, "x"]);
});

Deno.test("splitPane spawns a second pane; closeFocusedPane kills it", () => {
  const { fake, server } = setup();
  server.dispatch({ type: "newTab" });
  server.dispatch({ type: "splitPane", direction: "vertical" });
  assertEquals(fake.spawned.length, 2);

  const second = fake.spawned[1]!;
  server.dispatch({ type: "closeFocusedPane" });
  assertEquals(fake.killed.includes(second), true);
});

Deno.test("setChrome rebroadcasts the scene with the new chrome", () => {
  const { server, received } = setup();
  server.dispatch({ type: "newTab" });
  received.length = 0;

  server.setChrome({ tabBarRows: 1, statusBarRows: 1, leftCols: 20 });

  const sc = received.find((m) => m.t === "scene");
  assertEquals(sc?.t === "scene" ? sc.delta.chrome?.leftCols : null, 20);
});

Deno.test("scroll forwards a sequence to the focused pane's process", () => {
  const { fake, server } = setup();
  server.dispatch({ type: "newTab" });
  const pane = fake.spawned[0]!;
  fake.writes.length = 0;

  server.dispatch({ type: "scroll", action: "up" });

  assertEquals(fake.writes.length, 1);
  assertEquals(fake.writes[0]![0], pane);
});

Deno.test("a spawn failure surfaces an error in the pane instead of being swallowed", async () => {
  const received: ServerToFrontend[] = [];
  const server = createServer({
    initialState: createInitialState({ cols: 80, rows: 24 }),
    resolveSpawn: () => ({ command: "nope", args: [] }),
    createHost: () => ({
      spawn: () => Promise.reject(new Error("command not found")),
      write: () => {},
      resize: () => {},
      kill: () => {},
      forget: () => {},
      killAll: () => Promise.resolve(),
      has: () => false,
    }),
  });

  const [serverSide, frontendSide] = createInProcessPair<
    ServerToFrontend,
    FrontendToServer
  >();
  frontendSide.onMessage((m) => received.push(m));
  server.connect(serverSide);

  server.dispatch({ type: "newTab" });
  await new Promise((r) => setTimeout(r, 0)); // let the rejected spawn settle

  const out = received.find((m) => m.t === "output");
  assert(out !== undefined && out.t === "output");
  assert(out.data.includes("failed to start"));
});

Deno.test("onPaneExit fires when a pane exits on its own", () => {
  const fake = makeFakeHost();
  const exited: string[] = [];
  const server = createServer({
    initialState: createInitialState({ cols: 80, rows: 24 }),
    resolveSpawn: () => ({ command: "sh", args: [] }),
    createHost: fake.factory,
    exitOnEmpty: false,
    onPaneExit: (pane) => exited.push(pane),
  });
  server.dispatch({ type: "newTab" });
  const pane = fake.spawned[0]!;

  fake.exit(pane, 0);
  assertEquals(exited, [pane]);
});

Deno.test("disconnect stops delivery to a closed sink", () => {
  const fake = makeFakeHost();
  const server = createServer({
    initialState: createInitialState({ cols: 80, rows: 24 }),
    resolveSpawn: () => ({ command: "sh", args: [] }),
    createHost: fake.factory,
  });
  const [serverSide, frontendSide] = createInProcessPair<
    ServerToFrontend,
    FrontendToServer
  >();
  const received: ServerToFrontend[] = [];
  frontendSide.onMessage((m) => received.push(m));
  server.connect(serverSide);

  server.dispatch({ type: "newTab" });
  server.disconnect(serverSide);
  received.length = 0;

  server.dispatch({ type: "splitPane", direction: "vertical" });
  assertEquals(received, []); // sink was cleared, nothing delivered
});

Deno.test("exitOnEmpty:false keeps the server alive when the last tab closes", () => {
  const fake = makeFakeHost();
  const server = createServer({
    initialState: createInitialState({ cols: 80, rows: 24 }),
    resolveSpawn: () => ({ command: "sh", args: [] }),
    createHost: fake.factory,
    exitOnEmpty: false,
  });
  const [serverSide, frontendSide] = createInProcessPair<
    ServerToFrontend,
    FrontendToServer
  >();
  const received: ServerToFrontend[] = [];
  frontendSide.onMessage((m) => received.push(m));
  server.connect(serverSide);

  server.dispatch({ type: "newTab" });
  server.dispatch({ type: "closeTab" }); // last tab → would normally exit

  // No exit was emitted, and the server still accepts a fresh tab afterwards.
  assertEquals(received.some((m) => m.t === "exit"), false);
  assertEquals(server.getState().tabs.length, 0);
  server.dispatch({ type: "newTab" });
  assertEquals(server.getState().tabs.length, 1);
});

Deno.test("a pane exiting on its own removes it (no kill) and emits exit on the last", () => {
  const { fake, server, received } = setup();
  server.dispatch({ type: "newTab" });
  const pane = fake.spawned[0]!;
  received.length = 0;

  fake.exit(pane, 0);

  // last pane gone → tab closes → server signals exit
  assertEquals(fake.killed.includes(pane), false);
  assertEquals(received.some((m) => m.t === "exit"), true);
});
