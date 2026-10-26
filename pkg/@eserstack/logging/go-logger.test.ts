// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as ffiClient from "./ffi-client.ts";
import * as goLogger from "./go-logger.ts";

// Opened before the tests register, so the `skip` flag knows whether the
// bridge loaded.
// oxlint-disable-next-line node/no-top-level-await
await ffiClient.ensureLib();
const ffiLib = ffiClient.getLib();

nodeTest.test(
  "createGoLogger closes its handle with the bare handle logClose takes",
  { skip: ffiLib === null },
  async () => {
    // logClose takes the handle itself; a JSON object around it named no
    // handle, so the Go logger behind it was never released.
    const lib = ffiLib as unknown as {
      call: (name: string, request?: unknown) => unknown;
    };
    const original = lib.call;
    const seen: Array<[string, unknown, unknown]> = [];
    lib.call = (name, request) => {
      const answer = original(name, request);
      seen.push([name, request, answer]);
      return answer;
    };

    try {
      const logger = await goLogger.createGoLogger({ scopeName: "close-test" });
      logger.close();
    } finally {
      lib.call = original;
    }

    const created = seen.find(([name]) => name === "logCreate");
    const closed = seen.find(([name]) => name === "logClose");
    const handle = (created?.[2] as { handle?: string } | undefined)?.handle;

    assert.assertMatch(handle ?? "", /^log-\d+$/);
    assert.assertEquals(closed?.[1], handle);

    // The handle is gone: a write on it now answers the Go error.
    const late = original("logWrite", {
      handle,
      level: "INFO",
      message: "late",
    }) as { error?: string };
    assert.assertStringIncludes(late.error ?? "", "log handle not found");
  },
);
