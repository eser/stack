// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import type * as ffiTypes from "@eserstack/ajan/ffi";
import * as ffiFake from "@eserstack/ajan/ffi/fake";
import * as execGo from "./exec-go.ts";
import * as types from "./types.ts";

/** A bridge stand-in that records each request and answers with `reply`. */
const fakeLib = (
  reply: string,
): { lib: ffiTypes.FFILibrary; requests: unknown[] } => {
  const requests: unknown[] = [];
  const lib = ffiFake.createFakeLibrary({
    calls: {
      shellExec: (request) => {
        requests.push(request);
        return JSON.parse(reply) as ffiTypes.ResponseOf<"shellExec">;
      },
    },
  });

  return { lib, requests };
};

nodeTest.test("buildExecGoRequest sends env as KEY=VALUE strings", () => {
  // The bridge's reads env as []string; a JSON object failed its unmarshal with
  // "invalid request JSON", so every goExec call that set env failed.
  const request = execGo.buildExecGoRequest("printenv", {
    env: { GREETING: "hello", EMPTY: "", WITH_EQUALS: "a=b" },
  });

  assert.assertEquals(request.env, [
    "GREETING=hello",
    "EMPTY=",
    "WITH_EQUALS=a=b",
  ]);
});

nodeTest.test("buildExecGoRequest leaves env out when none is set", () => {
  const request = execGo.buildExecGoRequest("true", {});

  assert.assertEquals(request.env, undefined);
  assert.assertEquals("env" in JSON.parse(JSON.stringify(request)), false);
});

const timeoutCases = [
  {
    name: "sends a set timeout as a Go duration",
    input: 30_000,
    wire: "30000ms",
  },
  { name: "rounds a fractional timeout up", input: 1.2, wire: "2ms" },
  {
    name: "sends the 10-minute default when none is set",
    input: undefined,
    wire: "600000ms",
  },
  {
    name: "accepts the largest timer delay",
    input: execGo.MAX_TIMEOUT_MS,
    wire: "2147483647ms",
  },
];

for (const { name, input, wire } of timeoutCases) {
  nodeTest.test(`buildExecGoRequest ${name}`, () => {
    // The bridge's reads timeout as a duration string; a JSON number failed its
    // unmarshal the same way env did.
    const request = execGo.buildExecGoRequest("true", { timeout: input });

    assert.assertEquals(request.timeout, wire);
  });
}

const invalidTimeouts = [
  { name: "zero", input: 0 },
  { name: "a negative value", input: -1 },
  { name: "NaN", input: Number.NaN },
  { name: "Infinity", input: Number.POSITIVE_INFINITY },
  { name: "a value past the largest timer delay", input: 2 ** 31 },
];

for (const { name, input } of invalidTimeouts) {
  nodeTest.test(`normalizeTimeout rejects ${name}`, () => {
    // 0 used to go out as "0ms", which the bridge rejects; past 2^31 - 1 a
    // timer fires at once and the runtime spawn would stop the command
    // immediately.
    assert.assertThrows(
      () => execGo.normalizeTimeout(input),
      RangeError,
      "is out of range",
    );
  });
}

nodeTest.test("runExecGo returns a non-zero exit as a normal reply", () => {
  const { lib, requests } = fakeLib(
    JSON.stringify({ stdout: "out", stderr: "err", code: 3 }),
  );
  const request = execGo.buildExecGoRequest("sh", {
    args: ["-c", "exit 3"],
    timeout: 5_000,
  });

  const reply = execGo.runExecGo(lib, request);

  assert.assertEquals(reply, { stdout: "out", stderr: "err", code: 3 });
  assert.assertEquals(requests, [
    {
      command: "sh",
      args: ["-c", "exit 3"],
      timeout: "5000ms",
    },
  ]);
});

nodeTest.test(
  "runExecGo fills in the output the bridge omits when empty",
  () => {
    const { lib } = fakeLib(JSON.stringify({ code: 0 }));

    const reply = execGo.runExecGo(lib, execGo.buildExecGoRequest("true", {}));

    assert.assertEquals(reply, { stdout: "", stderr: "", code: 0 });
  },
);

nodeTest.test(
  "runExecGo throws the bridge's error as a CommandRunError",
  () => {
    const { lib } = fakeLib(
      JSON.stringify({
        code: 0,
        error:
          'exec "sleep": context deadline exceeded: the command ran past ' +
          "its 100ms timeout",
      }),
    );

    const error = assert.assertThrows(
      () =>
        execGo.runExecGo(
          lib,
          execGo.buildExecGoRequest("sleep", { args: ["5"], timeout: 100 }),
        ),
      types.CommandRunError,
      'run sleep: exec "sleep": context deadline exceeded',
    );
    assert.assertEquals(error.command, "sleep");
  },
);
