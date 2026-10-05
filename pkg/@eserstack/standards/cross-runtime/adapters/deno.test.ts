// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as crossRuntime from "../mod.ts";
import * as httpScenario from "./testdata/http-scenario.ts";
import * as probes from "./testdata/probes.ts";

// Under `deno test` the runtime singleton is the Deno adapter.
const { runtime } = crossRuntime;

// Windows delivers only SIGINT and SIGBREAK, which a test cannot send to a
// single process there. The signal test runs a probe process because deno test
// does not deliver signals to the test itself.
const noPosixSignals = Deno.build.os === "windows";

Deno.test("Deno adapter runtime.http meets the HTTP contract", async () => {
  const result = await httpScenario.exerciseHttp(runtime.http);

  assert.assertEquals(result, httpScenario.EXPECTED_HTTP_RESULT);
});

Deno.test("Deno adapter runtime.http.serve rejects a port in use", async () => {
  const controller = new AbortController();
  const first = await runtime.http.serve(
    { port: 0, signal: controller.signal },
    () => new Response("first"),
  );

  try {
    await assert.assertRejects(() =>
      runtime.http.serve({ port: first.port }, () => new Response("second"))
    );
  } finally {
    controller.abort();
    await first.finished;
  }
});

Deno.test("Deno adapter runtime.http.serve stops at once on an aborted signal", async () => {
  const server = await runtime.http.serve(
    { port: 0, signal: AbortSignal.abort() },
    () => new Response("never"),
  );

  await server.finished;
});

Deno.test({
  name:
    "Deno adapter signal listener runs, then its removal lets the process end",
  ignore: noPosixSignals,
  fn: async () => {
    const outcome = await probes.runSignalProbe(probes.PROBE_RUNTIMES.deno);

    assert.assertEquals(outcome.timedOut, false, outcome.stderr);
    assert.assertEquals(outcome.stdout, "ready\ngot SIGTERM\n");
    assert.assertEquals(outcome.code, 0, outcome.stderr);
  },
});
