// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as offload from "./offload.ts";
import type * as types from "./types.ts";

/** A transport that answers every operation with what it was asked. */
const echoing = (): { sent: string[]; transport: types.Transport } => {
  const sent: string[] = [];
  const answer = (line: string): types.Envelope => {
    sent.push(line);
    return { ok: true, result: JSON.stringify(line) };
  };

  return {
    sent,
    transport: {
      call: (name, request) => answer(`call ${name} ${request}`),
      streamOpen: (name, request) => answer(`open ${name} ${request}`),
      streamRead: (handle) => answer(`read ${handle}`),
      streamClose: (handle) => answer(`close ${handle}`),
      close: () => {},
    },
  };
};

nodeTest.test(
  "when no worker can start, the jobs run on the calling thread",
  async () => {
    const { sent, transport } = echoing();
    let attempts = 0;
    const workers = offload.createOffload({
      libraryPath: "/nowhere",
      poolSize: 2,
      inline: transport,
      // What `new Worker` throws under --permission without --allow-worker.
      spawn: () => {
        attempts += 1;
        throw new Error("Access to this API has been restricted");
      },
    });

    const answered = await workers.call("shellExec", "{}");
    const lane = workers.reader();
    const opened = await lane.open("shellExecStream", "{}");
    const read = await lane.read("shellExecStream", "exec-1");
    lane.end();

    assert.assertEquals(
      [answered, opened, read].map((envelope) => envelope.result),
      [
        JSON.stringify("call shellExec {}"),
        JSON.stringify("open shellExecStream {}"),
        JSON.stringify("read exec-1"),
      ],
    );
    assert.assertEquals(sent.length, 3);
    // The first failure is remembered, not retried for every job.
    assert.assertEquals(attempts, 1);
    assert.assertEquals(workers.stats().pool, 0);
    workers.close();
  },
);

nodeTest.test("a closed offload refuses new calls", async () => {
  const { transport } = echoing();
  const workers = offload.createOffload({
    libraryPath: "/nowhere",
    poolSize: 1,
    inline: transport,
  });

  workers.close();

  await assert.assertRejects(
    () => workers.call("shellExec", "{}"),
    Error,
    "already closed",
  );
  assert.assertThrows(() => workers.reader(), Error, "already closed");
});
