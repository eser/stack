// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as errors from "./errors.ts";
import * as library from "./library.ts";
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
