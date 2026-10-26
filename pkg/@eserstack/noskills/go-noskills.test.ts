// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The Go-backed noskills client against the native bridge
 * (pkg/@eserstack/ajan/bridge_noskills.go). TASK-324: the client sent
 * `configDir` and read `sessionId` and `name`, which the bridge never used
 * or sent, so every call answered undefined fields.
 *
 * @module
 */

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as ffiClient from "./ffi-client.ts";
import * as goNoskills from "./go-noskills.ts";

// oxlint-disable-next-line node/no-top-level-await
await ffiClient.ensureLib();

nodeTest.test(
  "the Go noskills client runs init, spec new and next on a project",
  { skip: ffiClient.getLib() === null },
  async () => {
    const root = await runtime.fs.makeTempDir({ prefix: "nos_go_client_" });
    try {
      const init = await goNoskills.initNoskills({ root });
      assert.assertEquals(init.root, root);

      const spec = await goNoskills.newNoskillsSpec({
        root,
        description: "a spec created through the Go client",
        specName: "go-client",
      });
      assert.assertEquals(spec.specName, "go-client");
      assert.assertStringIncludes(spec.specFile, "go-client");

      const next = await goNoskills.nextNoskillsStep({
        root,
        specName: "go-client",
      });
      assert.assertEquals(next.phase, "DISCOVERY");
    } finally {
      await runtime.fs.remove(root, { recursive: true });
    }
  },
);
