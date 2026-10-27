// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as mock from "@eserstack/test-kit/mock";
import * as results from "@eserstack/primitives/results";
import * as streams from "@eserstack/streams";
import * as dev from "./dev.ts";

/** A server start that records its calls and starts nothing. */
const fakeStart = () =>
  mock.spy((_options: dev.DevServerOptions) =>
    Promise.resolve(results.ok(undefined)),
  );

nodeTest.describe("laroux dev: help", () => {
  for (const flag of ["--help", "-h"]) {
    nodeTest.it(`${flag} prints the help and starts no server`, async () => {
      const start = fakeStart();
      const sink = streams.sinks.buffer<string>();

      const result = await dev.main([flag], { start, sink });

      assert.assert(results.isOk(result));
      mock.assertSpyCalls(start, 0);

      const printed = sink.items().join("");
      assert.assertStringIncludes(printed, "laroux dev [options]");
      for (const name of ["--port", "--no-hmr", "--log-level", "--open"]) {
        assert.assertStringIncludes(printed, name);
      }
      assert.assertEquals(
        printed.includes("Starting development server"),
        false,
      );
    });
  }
});

nodeTest.describe("laroux dev: the server start", () => {
  nodeTest.it("starts the server with the parsed flags", async () => {
    const start = fakeStart();
    const sink = streams.sinks.buffer<string>();

    const result = await dev.main(
      ["--port", "3000", "--no-hmr", "--log-level", "DEBUG"],
      { start, sink },
    );

    assert.assert(results.isOk(result));
    mock.assertSpyCalls(start, 1);
    assert.assertEquals(start.calls[0]?.args[0], {
      port: 3000,
      logLevel: "debug",
      hmr: false,
      open: false,
    });
  });
});
