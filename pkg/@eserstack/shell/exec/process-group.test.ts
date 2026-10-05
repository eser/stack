// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";

import type * as pty from "./pty.ts";
import * as processGroup from "./process-group.ts";

/**
 * A fake PTY process. `signals` records every kill signal it received, and
 * `exitOnKill` decides whether a kill makes it exit.
 */
const fakeProcess = (
  exitOnKill: boolean,
): { process: pty.PtyProcess; signals: string[] } => {
  const signals: string[] = [];
  let resolveExit!: (code: number) => void;
  const exitCode = new Promise<number>((resolve) => {
    resolveExit = resolve;
  });

  const process: pty.PtyProcess = {
    onData: () => {},
    write: () => {},
    resize: () => {},
    kill: (signal?: string) => {
      signals.push(signal ?? "SIGTERM");
      if (exitOnKill) {
        resolveExit(0);
      }
    },
    pid: 1,
    exitCode,
  };

  return { process, signals };
};

Deno.test("killAll signals every active process and waits for them to exit", async () => {
  const group = new processGroup.ProcessGroup();
  const first = fakeProcess(true);
  const second = fakeProcess(true);

  group.add("first", first.process);
  group.add("second", second.process);

  await group.killAll("SIGINT");

  assert.assertEquals(first.signals, ["SIGINT"]);
  assert.assertEquals(second.signals, ["SIGINT"]);
  assert.assertEquals(group.list().every((managed) => !managed.active), true);
});

Deno.test("killAll skips processes that already exited", async () => {
  const group = new processGroup.ProcessGroup();
  const exited = fakeProcess(true);

  const managed = group.add("exited", exited.process);
  managed.active = false;

  await group.killAll();

  assert.assertEquals(exited.signals, []);
});
