// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as mock from "@eserstack/test-kit/mock";
import * as results from "@eserstack/primitives/results";
import * as streams from "@eserstack/streams";
import * as serve from "./serve.ts";

/** A server start that records its calls and starts nothing. */
const fakeStart = () =>
  mock.spy((_options: serve.ServeOptions) =>
    Promise.resolve(results.ok(undefined)),
  );

nodeTest.describe("laroux serve: help", () => {
  for (const flag of ["--help", "-h"]) {
    nodeTest.it(`${flag} prints the help and starts no server`, async () => {
      const start = fakeStart();
      const sink = streams.sinks.buffer<string>();

      const result = await serve.main([flag], { start, sink });

      assert.assert(results.isOk(result));
      mock.assertSpyCalls(start, 0);

      const printed = sink.items().join("");
      assert.assertStringIncludes(printed, "laroux serve [options]");
      for (const name of ["--port", "--log-level"]) {
        assert.assertStringIncludes(printed, name);
      }
      assert.assertEquals(printed.includes("Serving production build"), false);
    });
  }
});

nodeTest.describe("laroux serve: the server start", () => {
  nodeTest.it("starts the server with the parsed flags", async () => {
    const start = fakeStart();
    const sink = streams.sinks.buffer<string>();

    const result = await serve.main(["-p", "3000", "--log-level", "warn"], {
      start,
      sink,
    });

    assert.assert(results.isOk(result));
    mock.assertSpyCalls(start, 1);
    assert.assertEquals(start.calls[0]?.args[0], {
      port: 3000,
      logLevel: "warn",
    });
  });
});
