// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The spec errors from persistence reach agents through `next`, `block` and
 * `done`. They name a command the agent runs next, so they must use the
 * caller's command prefix: a bare `noskills` fails wherever the CLI is not on
 * PATH.
 *
 * @module
 */

import * as bdd from "@std/testing/bdd";
import * as assert from "@eserstack/test-kit/assert";
import * as crossRuntime from "@eserstack/standards/cross-runtime";
import * as persistence from "./persistence.ts";

// Not "noskills" at the end, so a bare `noskills spec` cannot pass as it.
const CUSTOM_PREFIX = "deno run -A ./tools/nos.ts";

bdd.describe("persistence spec errors use the caller's command prefix", () => {
  let tempDir: string;

  bdd.beforeEach(async () => {
    tempDir = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "nos_persistence_prefix_",
    });
  });

  bdd.afterEach(async () => {
    await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
  });

  bdd.it("resolveState names the prefix when the spec is missing", async () => {
    const error = await assert.assertRejects(
      () => persistence.resolveState(tempDir, "missing-spec", CUSTOM_PREFIX),
      persistence.SpecNotFoundError,
    );

    assert.assertEquals(error.specName, "missing-spec");
    assert.assertStringIncludes(
      error.message,
      `\`${CUSTOM_PREFIX} spec list\``,
    );
    assert.assertEquals(error.message.includes("`noskills "), false);
  });

  bdd.it("requireSpecFlag names the prefix when no spec is given", () => {
    for (const args of [undefined, [], ["--spec="]]) {
      const result = persistence.requireSpecFlag(args, CUSTOM_PREFIX);

      assert.assertEquals(result.ok, false);
      if (result.ok) continue;
      assert.assertStringIncludes(
        result.error,
        `\`${CUSTOM_PREFIX} spec <name> <command>\``,
      );
      assert.assertEquals(result.error.includes("`noskills "), false);
    }
  });

  bdd.it("requireSpecFlag returns the spec name when it is given", () => {
    assert.assertEquals(
      persistence.requireSpecFlag(["--spec=my-spec"], CUSTOM_PREFIX),
      { ok: true, spec: "my-spec" },
    );
  });
});
