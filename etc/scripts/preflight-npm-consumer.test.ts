// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
// etc/scripts belongs to no workspace package, so the cross-runtime layer
// loads by path (as in package-export-roots.ts).
import * as crossRuntime from "../../pkg/@eserstack/standards/cross-runtime/mod.ts";
import * as preflight from "./preflight-npm-consumer.ts";

// --- parseOptions ---

nodeTest.test("parseOptions: defaults to node without --require-native", () => {
  assert.assertEquals(preflight.parseOptions([]), {
    runtime: "node",
    requireNative: false,
  });
});

nodeTest.test("parseOptions: reads --runtime=node and --require-native", () => {
  assert.assertEquals(
    preflight.parseOptions(["--runtime=node", "--require-native"]),
    { runtime: "node", requireNative: true },
  );
});

nodeTest.test("parseOptions: rejects any runtime other than node", () => {
  assert.assertThrows(
    () => preflight.parseOptions(["--runtime=deno"]),
    Error,
    '--runtime must be node, got "deno"',
  );
});

// --- run ---

nodeTest.test(
  "run: returns the exit code and both output streams",
  async () => {
    const result = await preflight.run(
      [
        crossRuntime.runtime.process.execPath(),
        "-e",
        'process.stdout.write("out"); process.stderr.write("err"); process.exit(3)',
      ],
      ".",
      10_000,
    );

    assert.assertEquals(result, { code: 3, stdout: "out", stderr: "err" });
  },
);

nodeTest.test("run: throws when the timeout stops the command", async () => {
  await assert.assertRejects(
    () =>
      preflight.run(
        [
          crossRuntime.runtime.process.execPath(),
          "-e",
          "setTimeout(() => {}, 10_000)",
        ],
        ".",
        100,
      ),
    Error,
    "did not finish within 100 ms",
  );
});
