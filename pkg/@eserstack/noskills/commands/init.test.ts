// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `noskills init` run as a user runs it, in a new project.
 *
 * @module
 */

import * as bdd from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as crossRuntime from "@eserstack/standards/cross-runtime";

const REPO_ROOT = crossRuntime.runtime.path.resolve(
  import.meta.dirname ?? ".",
  "../../../..",
);

const runNoskills = async (
  cwd: string,
  args: readonly string[],
): Promise<{ code: number; output: string }> => {
  const result = await crossRuntime.runtime.exec.spawn(
    crossRuntime.runtime.process.execPath(),
    [`${REPO_ROOT}/pkg/@eserstack/noskills/main.ts`, ...args],
    { cwd, stdin: "null", stdout: "piped", stderr: "piped" },
  );

  return {
    code: result.code,
    output:
      new TextDecoder().decode(result.stdout) +
      new TextDecoder().decode(result.stderr),
  };
};

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

  // TASK-324: stripModeFlag also removed --non-interactive before init read
  // it, so outside agent mode init still prompted.
  bdd.it("asks nothing with --non-interactive", async () => {
    const { code, output } = await runNoskills(root, [
      "init",
      "--non-interactive",
      "--human",
    ]);

    assert.assertEquals(code, 0, output);
    assert.assertEquals(
      output.includes("What kind of project is this?"),
      false,
    );
  });

  // TASK-324: init read .phase from {name, state} entries, so the onboarding
  // banner showed even while a spec was in progress.
  bdd.it("points at the active spec on a re-init", async () => {
    const tools = "--tools=claude-code";
    assert.assertEquals(
      (await runNoskills(root, ["init", "--non-interactive", tools])).code,
      0,
    );
    const created = await runNoskills(root, [
      "spec",
      "new",
      "--name=active-one",
      "an active spec for the re-init test",
    ]);
    assert.assertEquals(created.code, 0, created.output);

    // --human: without a terminal init answers for an agent and prints no
    // banner at all.
    const { code, output } = await runNoskills(root, [
      "init",
      "--non-interactive",
      "--human",
      tools,
    ]);

    assert.assertEquals(code, 0, output);
    assert.assertEquals(output.includes("noskills is ready"), false, output);
    assert.assertStringIncludes(output, "Start a spec with");
  });
});
