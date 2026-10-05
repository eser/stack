// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import type * as mux from "@eserstack/mux";
import * as worker from "./worker.ts";

const START_CWD = "/start";

type FakeOptions = {
  readonly killAllError?: Error;
};

/** A PTY host that records spawn requests instead of starting processes. */
const createFakePtyHost = (fakeOptions: FakeOptions = {}) => {
  const spawned: mux.SpawnRequest[] = [];
  const live = new Set<string>();
  let killAllCalls = 0;

  const createHost = (_callbacks: mux.PtyHostCallbacks): mux.PtyHost => ({
    spawn: (request) => {
      spawned.push(request);
      live.add(request.pane);
      return Promise.resolve();
    },
    write: () => {},
    resize: () => {},
    kill: (pane) => {
      live.delete(pane);
    },
    forget: (pane) => {
      live.delete(pane);
    },
    killAll: () => {
      killAllCalls++;
      live.clear();
      if (fakeOptions.killAllError !== undefined) {
        return Promise.reject(fakeOptions.killAllError);
      }
      return Promise.resolve();
    },
    has: (pane) => live.has(pane),
  });

  return {
    createHost,
    spawned,
    killAllCalls: () => killAllCalls,
  };
};

/** A worker wired to a recording host and a fake PTY host. */
const setup = (fakeOptions: FakeOptions = {}) => {
  const sent: Array<Readonly<Record<string, unknown>>> = [];
  const errors: string[] = [];
  const exits: number[] = [];
  const ptyHost = createFakePtyHost(fakeOptions);

  const muxWorker = worker.createMuxWorker({
    cwd: START_CWD,
    host: {
      send: (message) => sent.push(message),
      reportError: (message) => errors.push(message),
      exit: (code) => exits.push(code),
    },
    createPtyHost: ptyHost.createHost,
  });

  const encoder = new TextEncoder();
  const receiveLine = (message: unknown): void =>
    muxWorker.receive(encoder.encode(`${JSON.stringify(message)}\n`));

  return { muxWorker, sent, errors, exits, ptyHost, receiveLine };
};

const muxFrames = (
  sent: ReadonlyArray<Readonly<Record<string, unknown>>>,
): Array<Record<string, unknown>> =>
  sent
    .filter((message) => message["type"] === "mux")
    .map((message) => message["frame"] as Record<string, unknown>);

Deno.test("start sends the ready handshake the daemon waits for", () => {
  const { muxWorker, sent } = setup();

  muxWorker.start();

  assert.assertEquals(sent, [
    { type: "spawn_progress", stage: "starting" },
    { type: "ready" },
    { type: "spawn_progress", stage: "ready" },
  ]);
});

Deno.test("query_start opens a claude tab in the session's directory", () => {
  const { sent, ptyHost, receiveLine } = setup();

  receiveLine({ type: "query_start", cwd: "/work/app", sessionId: "s-1" });

  assert.assertEquals(ptyHost.spawned.length, 1);
  const request = ptyHost.spawned[0]!;
  assert.assertEquals(request.command, "claude");
  assert.assertEquals(request.cwd, "/work/app");
  assert.assertEquals(request.env?.["NOSKILLS_SESSION"], "s-1");
  assert.assertEquals(request.env?.["NOSKILLS_PROJECT_ROOT"], "/work/app");

  const frames = muxFrames(sent);
  assert.assertEquals(frames.length, 1);
  assert.assertEquals(frames[0]?.["t"], "scene");
  assert.assertEquals(sent[0]?.["v"], 1);
});

Deno.test("query_start keeps the starting directory when cwd is empty", () => {
  const { ptyHost, receiveLine } = setup();

  receiveLine({ type: "query_start", cwd: "", sessionId: "" });

  const request = ptyHost.spawned[0]!;
  assert.assertEquals(request.cwd, START_CWD);
  assert.assertEquals(request.env?.["NOSKILLS_PROJECT_ROOT"], START_CWD);
  assert.assertEquals(request.env?.["NOSKILLS_SESSION"], "");
});

Deno.test("an attach frame from the daemon gets a full scene back", () => {
  const { sent, receiveLine } = setup();

  receiveLine({
    type: "mux",
    frame: { t: "attach", viewport: { cols: 80, rows: 24 } },
  });

  const frames = muxFrames(sent);
  assert.assertEquals(frames.length, 1);
  assert.assertEquals(frames[0]?.["t"], "scene");
  assert.assertEquals(frames[0]?.["full"], true);
});

Deno.test("a remote newTab cannot choose the command, arguments or directory", () => {
  const { ptyHost, receiveLine } = setup();

  receiveLine({
    type: "mux",
    frame: {
      t: "action",
      action: {
        type: "newTab",
        command: "rm",
        args: ["-rf", "/"],
        cwd: "/etc",
        title: "remote",
      },
    },
  });

  assert.assertEquals(ptyHost.spawned.length, 1);
  const request = ptyHost.spawned[0]!;
  assert.assertNotEquals(request.command, "rm");
  assert.assertEquals(request.args, []);
  assert.assertEquals(request.cwd, START_CWD);
});

Deno.test("a line split across reads, even inside a character, is handled once complete", () => {
  const { ptyHost, muxWorker } = setup();
  const bytes = new TextEncoder().encode(
    `${JSON.stringify({ type: "query_start", cwd: "/çalışma" })}\n`,
  );
  // The first "ç" is two bytes; cut between them.
  const cut = bytes.indexOf(0xc3) + 1;

  muxWorker.receive(bytes.slice(0, cut));
  assert.assertEquals(ptyHost.spawned.length, 0);

  muxWorker.receive(bytes.slice(cut));
  assert.assertEquals(ptyHost.spawned[0]?.cwd, "/çalışma");
});

Deno.test("every line in one read is handled, and blank lines are skipped", () => {
  const { sent, errors, muxWorker } = setup();
  const attach = JSON.stringify({
    type: "mux",
    frame: { t: "attach", viewport: { cols: 80, rows: 24 } },
  });

  muxWorker.receive(new TextEncoder().encode(`${attach}\n\n   \n${attach}\n`));

  assert.assertEquals(muxFrames(sent).length, 2);
  assert.assertEquals(errors, []);
});

Deno.test("a line that is not JSON is reported without its content", () => {
  const { sent, errors, muxWorker, receiveLine } = setup();

  muxWorker.receive(new TextEncoder().encode("password=hunter2\n"));
  receiveLine({
    type: "mux",
    frame: { t: "attach", viewport: { cols: 80, rows: 24 } },
  });

  assert.assertEquals(errors, [
    "skip a daemon line of 16 characters that is not JSON",
  ]);
  // The worker keeps going after the bad line.
  assert.assertEquals(muxFrames(sent).length, 1);
});

const invalidMessages = [
  {
    name: "a JSON value that is not an object",
    message: 42,
    error: "skip a daemon line that is not a JSON object",
  },
  {
    name: "a JSON array",
    message: [{ type: "shutdown" }],
    error: "skip a daemon line that is not a JSON object",
  },
  {
    name: "a message with no type",
    message: { frame: {} },
    error: `skip a daemon message with no "type" field`,
  },
  {
    name: "a message whose type is not a string",
    message: { type: 7 },
    error: `skip a daemon message with no "type" field`,
  },
  {
    name: "a mux message with a null frame",
    message: { type: "mux", frame: null },
    error: `skip a "mux" message whose "frame" is not an object`,
  },
  {
    name: "a mux message with a string frame",
    message: { type: "mux", frame: "attach" },
    error: `skip a "mux" message whose "frame" is not an object`,
  },
];

for (const { name, message, error } of invalidMessages) {
  Deno.test(`reports and skips ${name}`, () => {
    const { sent, errors, exits, receiveLine } = setup();

    receiveLine(message);

    assert.assertEquals(errors, [error]);
    assert.assertEquals(sent, []);
    assert.assertEquals(exits, []);
  });
}

Deno.test("a message the mux server fails on is reported, and the worker keeps going", () => {
  const { sent, errors, receiveLine } = setup();

  receiveLine({ type: "mux", frame: { t: "action", action: null } });
  receiveLine({
    type: "mux",
    frame: { t: "attach", viewport: { cols: 80, rows: 24 } },
  });

  assert.assertEquals(errors.length, 1);
  assert.assertStringIncludes(errors[0] ?? "", `handle a "mux" message: `);
  assert.assertEquals(muxFrames(sent).length, 1);
});

Deno.test("messages meant for agent workers are ignored", () => {
  const { sent, errors, exits, ptyHost, receiveLine } = setup();

  receiveLine({ type: "push_message", content: "hello" });
  receiveLine({ type: "set_mode", mode: "plan" });
  receiveLine({ type: "permission_response", requestId: "r-1" });

  assert.assertEquals(sent, []);
  assert.assertEquals(errors, []);
  assert.assertEquals(exits, []);
  assert.assertEquals(ptyHost.spawned, []);
});

for (const type of ["shutdown", "stop_task", "abort"]) {
  Deno.test(`${type} disposes the mux server and exits with 0`, async () => {
    const { muxWorker, exits, ptyHost, receiveLine } = setup();

    receiveLine({ type });
    // stop() hands back the run the message started.
    await muxWorker.stop();

    assert.assertEquals(exits, [0]);
    assert.assertEquals(ptyHost.killAllCalls(), 1);
  });
}

Deno.test("stop runs once however often it is called", async () => {
  const { muxWorker, exits, ptyHost, receiveLine } = setup();

  const first = muxWorker.stop();
  receiveLine({ type: "shutdown" });
  const second = muxWorker.stop();
  await Promise.all([first, second]);

  assert.assertStrictEquals(first, second);
  assert.assertEquals(exits, [0]);
  assert.assertEquals(ptyHost.killAllCalls(), 1);
});

Deno.test("a failed disposal is reported and exits with 1", async () => {
  const { muxWorker, errors, exits } = setup({
    killAllError: new Error("pane 3 did not exit"),
  });

  await muxWorker.stop();

  assert.assertEquals(errors, ["dispose the mux server: pane 3 did not exit"]);
  assert.assertEquals(exits, [1]);
});
