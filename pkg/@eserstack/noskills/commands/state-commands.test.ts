// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * rule, concern, learn and ledger run as a user runs them (TASK-327).
 *
 * @module
 */

import * as bdd from "@std/testing/bdd";
import * as assert from "@eserstack/test-kit/assert";
import { runtime } from "@eserstack/standards/cross-runtime";

const REPO_ROOT = runtime.path.resolve(
  import.meta.dirname ?? ".",
  "../../../..",
);

const runNoskills = async (
  cwd: string,
  args: readonly string[],
): Promise<{ code: number; output: string }> => {
  const result = await runtime.exec.spawn(
    runtime.process.execPath(),
    [
      "run",
      "-A",
      "--config",
      `${REPO_ROOT}/deno.json`,
      `${REPO_ROOT}/pkg/@eserstack/noskills/main.ts`,
      ...args,
    ],
    { cwd, stdin: "null", stdout: "piped", stderr: "piped" },
  );

  return {
    code: result.code,
    output:
      new TextDecoder().decode(result.stdout) +
      new TextDecoder().decode(result.stderr),
  };
};

/** Rewrites the noskills section of the manifest init wrote. */
const editManifest = async (
  root: string,
  edit: (text: string) => string,
): Promise<void> => {
  const path = `${root}/.eser/manifest.yml`;
  await runtime.fs.writeTextFile(
    path,
    edit(await runtime.fs.readTextFile(path)),
  );
};

bdd.describe("noskills state commands", () => {
  let root: string;

  bdd.beforeEach(async () => {
    root = await runtime.fs.makeTempDir({ prefix: "nos_state_cmds_" });
    const init = await runNoskills(root, [
      "init",
      "--non-interactive",
      "--tools=claude-code",
    ]);
    assert.assertEquals(init.code, 0, init.output);
  });

  bdd.afterEach(async () => {
    await runtime.fs.remove(root, { recursive: true });
  });

  // The commands printed the default prefix, because they never loaded the
  // manifest's command before using it.
  bdd.it("rule and concern name the manifest's command", async () => {
    await editManifest(root, (text) =>
      text.replace("command: npx eser@latest noskills", "command: my-noskills"),
    );

    for (const command of ["rule", "concern"]) {
      // One command at a time, so a failure names it.
      // oxlint-disable-next-line no-await-in-loop
      const { output } = await runNoskills(root, [command, "nonsense"]);
      assert.assertStringIncludes(output, `my-noskills ${command}`, command);
      assert.assertEquals(
        output.includes("npx eser@latest noskills"),
        false,
        output,
      );
    }
  });

  // `config.tools.length` threw when the manifest had no tools list, after
  // the rule file was already written.
  bdd.it("rule add works with a manifest without a tools list", async () => {
    await editManifest(root, (text) =>
      text.replace("  tools:\n    - claude-code\n", ""),
    );

    const { code, output } = await runNoskills(root, [
      "rule",
      "add",
      "Use the project's logger instead of console output",
    ]);
    assert.assertEquals(code, 0, output);
  });

  // learn list put Span objects into a template string and printed
  // "[object Object]" for the icon and the type.
  bdd.it("learn list prints the type of each learning", async () => {
    const spec = await runNoskills(root, [
      "spec",
      "new",
      "--name=lessons",
      "a spec that collects a lesson",
    ]);
    assert.assertEquals(spec.code, 0, spec.output);
    const learned = await runNoskills(root, [
      "spec",
      "lessons",
      "learn",
      "Run the migrations before the seed script",
      "--type=mistake",
    ]);
    assert.assertEquals(learned.code, 0, learned.output);

    const { code, output } = await runNoskills(root, ["learn", "list"]);
    assert.assertEquals(code, 0, output);
    assert.assertEquals(output.includes("[object Object]"), false, output);
    assert.assertStringIncludes(output, "[mistake]");
  });
});
