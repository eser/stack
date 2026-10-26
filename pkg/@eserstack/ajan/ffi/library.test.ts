// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as errors from "./errors.ts";
import * as library from "./library.ts";
import type * as offload from "./offload.ts";
import type * as types from "./types.ts";

/** A transport that records what it was sent and answers `answer`. */
const recording = (answer: types.Envelope) => {
  const sent: string[] = [];
  const transport: types.Transport = {
    call: (name, request) => {
      sent.push(`call ${name} ${request}`);
      return answer;
    },
    streamOpen: (name, request) => {
      sent.push(`open ${name} ${request}`);
      return { ok: true, result: JSON.stringify({ handle: "cbwalk-1" }) };
    },
    streamRead: (handle) => {
      sent.push(`read ${handle}`);
      return { ok: true, result: "null" };
    },
    streamClose: (handle) => {
      sent.push(`close ${handle}`);
      return { ok: true, result: "{}" };
    },
    close: () => {
      sent.push("closed");
    },
  };

  return { sent, transport };
};

const handshake: types.Handshake = {
  version: "test",
  abi: library.ABI_VERSION,
  profile: "native",
  names: [],
  streams: [],
};

nodeTest.test(
  "call sends JSON requests, bare handles and empty requests",
  () => {
    const { sent, transport } = recording({ ok: true, result: "{}" });
    const lib = library.createLibrary({
      backend: "native",
      handshake,
      transport,
    });

    lib.call("formatEncode", { format: "json", data: 1 });
    lib.call("logClose", "log-3");
    lib.call("formatList");

    assert.assertEquals(sent, [
      'call formatEncode {"format":"json","data":1}',
      "call logClose log-3",
      "call formatList ",
    ]);
  },
);

nodeTest.test("an answer with an error comes back as an answer", () => {
  const { transport } = recording({
    ok: false,
    code: "HANDLER_ERROR",
    error: "bad format",
    result: JSON.stringify({ error: "bad format" }),
  });
  const lib = library.createLibrary({
    backend: "native",
    handshake,
    transport,
  });

  assert.assertEquals(lib.call("formatEncode", { format: "x", data: 1 }), {
    error: "bad format",
  });
});

nodeTest.test("an envelope without a result throws its code", () => {
  const { transport } = recording({
    ok: false,
    code: "KIND_MISMATCH",
    error: "formatList is a call, not a stream",
  });
  const lib = library.createLibrary({
    backend: "native",
    handshake,
    transport,
  });

  const error = assert.assertThrows(
    () => lib.call("formatList"),
    errors.AjanCallError,
  );
  assert.assertEquals(error.code, "KIND_MISMATCH");
  assert.assertStringIncludes(error.message, "formatList is a call");
});

nodeTest.test(
  "the WASM backend refuses a native-only name without a round trip",
  () => {
    const { sent, transport } = recording({ ok: true, result: "{}" });
    const lib = library.createLibrary({
      backend: "wasm",
      handshake: { ...handshake, profile: "wasi" },
      transport,
    });

    const error = assert.assertThrows(
      () => lib.call("shellExec", { command: "true" }),
      errors.UnsupportedInWasmError,
    );
    assert.assertEquals(error.code, "UNSUPPORTED_IN_WASM");
    assert.assertEquals(sent, []);
  },
);

nodeTest.test("a stream opens, reads to null and closes", () => {
  const { sent, transport } = recording({ ok: true, result: "{}" });
  const lib = library.createLibrary({
    backend: "native",
    handshake,
    transport,
  });

  const walk = lib.stream("codebaseWalkFilesStream", { dir: "." });
  assert.assertEquals(walk.handle, "cbwalk-1");
  assert.assertEquals(walk.read(), null);
  assert.assertEquals(walk.close(), {});
  assert.assertEquals(sent, [
    'open codebaseWalkFilesStream {"dir":"."}',
    "read cbwalk-1",
    "close cbwalk-1",
  ]);
});

nodeTest.test("async names answer a promise on every backend", async () => {
  const { transport } = recording({
    ok: true,
    result: JSON.stringify({ status: 200 }),
  });
  const lib = library.createLibrary({
    backend: "native",
    handshake,
    transport,
  });

  const pending = lib.call("httpRequest", { handle: "http-1", url: "/" });
  assert.assert(pending instanceof Promise);
  assert.assertEquals(await pending, { status: 200 });
});

nodeTest.test("a closed library refuses every operation", () => {
  const { sent, transport } = recording({ ok: true, result: "{}" });
  const lib = library.createLibrary({
    backend: "native",
    handshake,
    transport,
  });

  lib.close();
  lib.close();

  assert.assertThrows(() => lib.call("formatList"), Error, "already closed");
  assert.assertEquals(sent, ["closed"]);
});

// ---------------------------------------------------------------------------
// Blocking names: the offload and the AbortSignal mapping (TASK-239)
// ---------------------------------------------------------------------------

/** A job the fake offload holds until the test answers it. */
interface HeldJob {
  readonly op: "call" | "open" | "read";
  readonly name: string;
  readonly request: string;
  readonly answer: (result: unknown) => void;
}

/** An offload whose jobs wait until the test answers them. */
const holdingOffload = () => {
  const held: HeldJob[] = [];
  let readers = 0;
  let ended = 0;
  let closed = false;

  const hold = (op: HeldJob["op"], name: string, request: string) =>
    new Promise<types.Envelope>((resolve) => {
      held.push({
        op,
        name,
        request,
        answer: (result) => {
          resolve({ ok: true, result: JSON.stringify(result) });
        },
      });
    });

  const offload: offload.Offload = {
    call: (name, request) => hold("call", name, request),
    reader: () => {
      readers += 1;
      return {
        open: (name, request) => hold("open", name, request),
        read: (name, handle) => hold("read", name, handle),
        end: () => {
          ended += 1;
        },
      };
    },
    stats: () => ({
      poolSize: 2,
      pool: 0,
      busy: held.length,
      queued: 0,
      peakPool: 0,
      readers: readers - ended,
      posted: held.length,
    }),
    close: () => {
      closed = true;
    },
  };

  return {
    held,
    offload,
    ended: () => ended,
    closed: () => closed,
  };
};

const blockingLibrary = () => {
  const { sent, transport } = recording({ ok: true, result: "{}" });
  const offloaded = holdingOffload();
  const lib = library.createLibrary({
    backend: "native",
    handshake,
    transport: {
      ...transport,
      streamOpen: (name, request) => {
        sent.push(`open ${name} ${request}`);
        return { ok: true, result: JSON.stringify({ handle: "pty-7" }) };
      },
      streamClose: (handle) => {
        sent.push(`close ${handle}`);
        return { ok: true, result: JSON.stringify({ code: 137 }) };
      },
    },
    offload: offloaded.offload,
  });

  return { sent, lib, ...offloaded };
};

nodeTest.test(
  "a blocking call runs in the offload and a short call stays on the calling thread",
  async () => {
    const { sent, lib, held } = blockingLibrary();

    const pending = lib.call("shellExec", { command: "true" });
    assert.assert(pending instanceof Promise, "shellExec did not answer later");
    assert.assertEquals(
      held.map((job) => `${job.op} ${job.name}`),
      ["call shellExec"],
    );

    const short = lib.call("logClose", "log-1");
    assert.assertFalse(short instanceof Promise, "logClose answered later");
    assert.assertEquals(sent, ["call logClose log-1"]);

    held[0]!.answer({ code: 0 });
    assert.assertEquals(await pending, { code: 0 });
  },
);

nodeTest.test(
  "an abort sends aiCancelRequest for the request's id and rejects with the signal's reason",
  async () => {
    const { sent, lib, held } = blockingLibrary();
    const controller = new AbortController();
    const request = {
      modelHandle: "model-1",
      options: { messages: [] },
    } as const;

    const pending = lib.call("aiGenerateText", request, {
      signal: controller.signal,
    });
    controller.abort();

    const error = await assert.assertRejects(() => pending);
    assert.assertEquals((error as Error).name, "AbortError");

    // The library added the id to the options, without changing the caller's
    // object, and cancelled that same id.
    const wire = JSON.parse(held[0]!.request) as {
      readonly options: { readonly requestId: string };
    };
    assert.assertEquals(Object.keys(request.options), ["messages"]);
    assert.assertEquals(sent, [
      `call aiCancelRequest ${JSON.stringify({ requestId: wire.options.requestId })}`,
    ]);
    held[0]!.answer({ error: "context canceled" });
  },
);

nodeTest.test(
  "an already-aborted signal rejects without sending the call",
  async () => {
    const { sent, lib, held } = blockingLibrary();

    await assert.assertRejects(() =>
      lib.call(
        "aiBatchGet",
        { modelHandle: "model-1", jobId: "job-1" },
        { signal: AbortSignal.abort() },
      ),
    );

    assert.assertEquals(held, []);
    assert.assertEquals(sent, []);
  },
);

nodeTest.test(
  "a blocking stream opens here and reads in its own worker, which ends with the stream",
  async () => {
    const { sent, lib, held, ended } = blockingLibrary();

    const exec = lib.stream("shellExecStream", { command: "cat" });
    assert.assertEquals(exec.handle, "pty-7");
    assert.assertEquals(sent, ['open shellExecStream {"command":"cat"}']);

    const reading = exec.read();
    assert.assertEquals(
      held.map((job) => `${job.op} ${job.request}`),
      ["read pty-7"],
    );
    held[0]!.answer({ stream: "stdout", chunk: "aGkK" });
    assert.assertEquals(await reading, { stream: "stdout", chunk: "aGkK" });

    assert.assertEquals(exec.close(), { code: 137 });
    assert.assertEquals(ended(), 1);
  },
);

nodeTest.test(
  "aborting a stream read runs the stream's cancel entry",
  async () => {
    const { sent, lib, held, ended } = blockingLibrary();

    // shellExecStream: the cancel entry closes the stream.
    const exec = lib.stream("shellExecStream", { command: "cat" });
    const execAbort = new AbortController();
    const execRead = exec.read({ signal: execAbort.signal });
    execAbort.abort();
    await assert.assertRejects(() => execRead);
    assert.assertEquals(sent.at(-1), "close pty-7");
    assert.assertEquals(ended(), 1);
    // The close already ran; closing again answers the same exit code.
    assert.assertEquals(exec.close(), { code: 137 });

    // shellPtyStream: the cancel entry kills the child.
    const pty = lib.stream("shellPtyStream", { command: "sh" });
    const ptyAbort = new AbortController();
    const ptyRead = pty.read({ signal: ptyAbort.signal });
    ptyAbort.abort();
    await assert.assertRejects(() => ptyRead);
    assert.assertEquals(
      sent.at(-1),
      `call shellPtyKill ${JSON.stringify({ handle: "pty-7", signal: "SIGKILL" })}`,
    );

    for (const job of held) {
      job.answer(null);
    }
  },
);

nodeTest.test(
  "close runs the cancel entry of each blocking operation in flight",
  async () => {
    const { sent, lib, held, closed } = blockingLibrary();

    const generating = lib.call("aiGenerateText", {
      modelHandle: "model-1",
      options: { messages: [] },
    });
    const pty = lib.stream("shellPtyStream", { command: "sh" });
    const reading = pty.read();

    lib.close();

    assert.assertEquals(closed(), true);
    assert.assertEquals(
      sent
        .filter((line) => line.startsWith("call "))
        .map((line) => line.split(" ").slice(0, 2).join(" ")),
      ["call aiCancelRequest", "call shellPtyKill"],
    );
    assert.assertEquals(sent.at(-1), "closed");

    for (const job of held) {
      job.answer(null);
    }
    await Promise.all([generating, reading]);
  },
);
