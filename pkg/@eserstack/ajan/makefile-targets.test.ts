// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as targets from "./targets.ts";

// The root Makefile builds the library (decision-40) from its own copy of the
// target table; this test keeps that copy equal to targets.ts.

const MAKEFILE = runtime.path.join(
  import.meta.dirname ?? ".",
  "..",
  "..",
  "..",
  "Makefile",
);

/** The `NAME := value` assignments of the Makefile. */
const readAssignments = async (): Promise<Map<string, string>> => {
  const text = await runtime.fs.readTextFile(MAKEFILE);
  const vars = new Map<string, string>();
  for (const line of text.split("\n")) {
    const match = /^([A-Za-z0-9_-]+) :?= ?(.*)$/.exec(line);
    if (match !== null) {
      vars.set(match[1]!, match[2]!.trim());
    }
  }
  return vars;
};

nodeTest.test(
  "the Makefile lists the native targets of targets.ts",
  async () => {
    const vars = await readAssignments();

    assert.assertEquals(
      vars.get("AJAN_TARGETS")?.split(/\s+/).sort(),
      targets.NATIVE_TARGETS.map((t) => t.id).sort(),
    );

    for (const t of targets.NATIVE_TARGETS) {
      assert.assertEquals(vars.get(`GOOS_${t.id}`), t.goos, t.id);
      assert.assertEquals(vars.get(`GOARCH_${t.id}`), t.goarch, t.id);
      assert.assertEquals(vars.get(`CC_${t.id}`), t.cc, t.id);
      assert.assertEquals(vars.get(`LIB_${t.id}`), t.libFile, t.id);
      assert.assertEquals(vars.get(`NPM_${t.id}`), t.npmSuffix, t.id);
    }
  },
);

nodeTest.test("the Makefile lists the WASM targets of targets.ts", async () => {
  const vars = await readAssignments();

  assert.assertEquals(
    vars.get("AJAN_WASM")?.split(/\s+/).sort(),
    targets.WASM_TARGETS.map(
      (t) => `${t.id}:${t.outputFile}:${t.tags ?? ""}`,
    ).sort(),
  );
});
