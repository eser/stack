// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `noskills init` run as a user runs it, in a new project.
 *
 * @module
 */

import * as bdd from "@std/testing/bdd";
import * as assert from "@std/assert";
import * as crossRuntime from "@eserstack/standards/cross-runtime";

const REPO_ROOT = crossRuntime.runtime.path.resolve(
  import.meta.dirname ?? ".",
  "../../../..",
);

bdd.describe("noskills init", () => {
  let root: string;

  bdd.beforeEach(async () => {
    root = await crossRuntime.runtime.fs.makeTempDir({ prefix: "nos_init_" });
  });

  bdd.afterEach(async () => {
    await crossRuntime.runtime.fs.remove(root, { recursive: true });
  });

  bdd.it(
    "warns when the hooks run noskills through npx, which can wait on the network",
    async () => {
      // Run without "noskills" in the arguments, init keeps the default
      // command, `npx eser@latest noskills`.
      const result = await crossRuntime.runtime.exec.spawn(
        crossRuntime.runtime.process.execPath(),
        [
          "run",
          "-A",
          "--config",
          `${REPO_ROOT}/deno.json`,
          `${REPO_ROOT}/pkg/@eserstack/noskills/main.ts`,
          "init",
          "--non-interactive",
          "--tools=claude-code",
        ],
        { cwd: root, stdin: "null", stdout: "piped", stderr: "piped" },
      );
      const stderr = new TextDecoder().decode(result.stderr);
      // The progress lines go to stderr when init runs for an agent and to
      // stdout otherwise.
      const output = new TextDecoder().decode(result.stdout) + stderr;

      assert.assertEquals(result.code, 0, stderr);
      assert.assertStringIncludes(
        output,
        'The hooks run noskills as "npx eser@latest noskills", and npx can wait on the network',
      );
      assert.assertStringIncludes(output, "eser noskills init");
    },
  );
});
