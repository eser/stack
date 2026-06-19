// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { assert, assertEquals } from "@std/assert";
import type { AgentAdapter, AgentState, TerminalView } from "../adapter.ts";
import { type AgentIo, createDrivingLoop, type DriveEvent } from "./loop.ts";
import { createSafety, defaultSafetyPolicy } from "./safety.ts";

const delay = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

const emptyView: TerminalView = {
  cursorRow: 0,
  cursorCol: 0,
  rows: 1,
  cols: 80,
  lineText: () => "",
  recentOutput: () => "",
};

const makeIo = () => {
  let outCb: ((c: string) => void) | undefined;
  let exitCb: ((code: number) => void) | undefined;
  const written: string[] = [];

  const io: AgentIo = {
    onOutput(cb) {
      outCb = cb;

      return () => {};
    },
    getView: () => emptyView,
    write: (d) => written.push(d),
    onExit(cb) {
      exitCb = cb;

      return () => {};
    },
  };

  return {
    io,
    written,
    emit: () => outCb?.("x"),
    exit: (code: number) => exitCb?.(code),
  };
};

/** Adapter that returns a scripted state on each detectState call. */
const scriptAdapter = (states: readonly AgentState[]): AgentAdapter => {
  let i = 0;

  return {
    id: "script",
    displayName: "script",
    capabilities: {
      supportsBracketedPaste: true,
      canDetectAwaitingInput: true,
      canDetectFinished: true,
    },
    resolveCommand: () => Promise.resolve("script"),
    buildSpawnSpec: () => Promise.resolve(null),
    detectState: () => states[Math.min(i++, states.length - 1)]!,
    submitSequence: () => "\r",
  };
};

Deno.test("loop injects a queued message once prompt-ready", async () => {
  const fio = makeIo();
  const events: DriveEvent["type"][] = [];
  const loop = createDrivingLoop({
    adapter: scriptAdapter(["prompt-ready"]),
    io: fio.io,
    safety: createSafety(defaultSafetyPolicy()),
    quiescenceMs: 1,
  });
  loop.on((e) => events.push(e.type));
  loop.start();
  loop.send("hello");

  fio.emit();
  await delay(15);
  loop.stop();

  assertEquals(fio.written, ["\x1b[200~hello\x1b[201~", "\r"]);
  assert(events.includes("prompt-ready"));
  assert(events.includes("message-injected"));
});

Deno.test("loop blocks a git-write message and does not inject it", async () => {
  const fio = makeIo();
  const events: DriveEvent[] = [];
  const loop = createDrivingLoop({
    adapter: scriptAdapter(["prompt-ready"]),
    io: fio.io,
    safety: createSafety(defaultSafetyPolicy()),
    quiescenceMs: 1,
  });
  loop.on((e) => events.push(e));
  loop.start();
  loop.send("git push origin main");

  fio.emit();
  await delay(15);
  loop.stop();

  assertEquals(fio.written, []);
  assert(events.some((e) => e.type === "blocked"));
});

Deno.test("a blocked head does not wedge the queue (head-of-line fixed)", async () => {
  const fio = makeIo();
  const loop = createDrivingLoop({
    adapter: scriptAdapter(["prompt-ready"]),
    io: fio.io,
    safety: createSafety(defaultSafetyPolicy()),
    quiescenceMs: 1,
  });
  loop.start();
  loop.send("git push origin main"); // permanently blocked → dropped
  loop.send("ls"); // must still inject

  fio.emit();
  await delay(15);
  loop.stop();

  assertEquals(fio.written, ["\x1b[200~ls\x1b[201~", "\r"]);
});

Deno.test("the loop can be stopped and restarted", async () => {
  const fio = makeIo();
  const loop = createDrivingLoop({
    adapter: scriptAdapter(["prompt-ready", "prompt-ready"]),
    io: fio.io,
    safety: createSafety(defaultSafetyPolicy()),
    quiescenceMs: 1,
  });
  loop.start();
  loop.stop();
  loop.start(); // must re-arm the reader

  loop.send("hi");
  fio.emit();
  await delay(15);
  loop.stop();

  assertEquals(fio.written, ["\x1b[200~hi\x1b[201~", "\r"]);
});

Deno.test("an empty autoRespond reply is not injected", async () => {
  const fio = makeIo();
  const loop = createDrivingLoop({
    adapter: scriptAdapter(["awaiting-input"]),
    io: fio.io,
    safety: createSafety({ ...defaultSafetyPolicy(), autonomy: "full" }),
    quiescenceMs: 1,
    autoRespond: () => "",
  });
  loop.start();

  fio.emit();
  await delay(15);
  loop.stop();

  assertEquals(fio.written, []);
});

Deno.test("loop emits awaiting-input and exited", async () => {
  const fio = makeIo();
  const events: DriveEvent[] = [];
  const loop = createDrivingLoop({
    adapter: scriptAdapter(["awaiting-input"]),
    io: fio.io,
    safety: createSafety(defaultSafetyPolicy()),
    quiescenceMs: 1,
  });
  loop.on((e) => events.push(e));
  loop.start();

  fio.emit();
  await delay(15);
  fio.exit(3);

  assert(events.some((e) => e.type === "awaiting-input"));
  const exited = events.find((e) => e.type === "exited");
  assert(exited !== undefined && exited.type === "exited" && exited.code === 3);

  loop.stop();
});
