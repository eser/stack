// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * revisit, reset, ac, task and note run as a user runs them (TASK-329).
 *
 * @module
 */

import * as bdd from "@std/testing/bdd";
import * as assert from "@eserstack/test-kit/assert";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as persistence from "../state/persistence.ts";
import * as schema from "../state/schema.ts";
import * as review from "./review.ts";

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

const SPEC = "upload";

const putSpecIn = async (root: string, phase: schema.Phase) => {
  await runtime.fs.mkdir(`${root}/${persistence.paths.specDir(SPEC)}`, {
    recursive: true,
  });
  await runtime.fs.writeTextFile(
    `${root}/${persistence.paths.specFile(SPEC)}`,
    "# Spec: upload\n\nUsers upload photos.\n",
  );
  await persistence.writeStateAndSpec(root, {
    ...schema.createInitialState(),
    phase,
    spec: SPEC,
    specDescription: "Users upload photos",
    branch: `spec/${SPEC}`,
  });
};

bdd.describe("noskills spec state commands", () => {
  let root: string;

  bdd.beforeEach(async () => {
    root = await runtime.fs.makeTempDir({ prefix: "nos_spec_states_" });
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

  // revisit wrote only the spec's own file, so state.json stayed BLOCKED.
  bdd.it("revisit moves state.json too when it names the spec", async () => {
    await putSpecIn(root, "BLOCKED");

    const { code, output } = await runNoskills(root, [
      "spec",
      SPEC,
      "revisit",
      "the API changed",
    ]);
    assert.assertEquals(code, 0, output);

    const global = await persistence.readState(root);
    assert.assertEquals(global.phase, "DISCOVERY");
    assert.assertEquals(global.revisitHistory.at(-1)?.from, "BLOCKED");
  });

  // reset in a planning phase crashed with a stack trace from resetToIdle.
  bdd.it("reset in a planning phase refuses with a message", async () => {
    await putSpecIn(root, "DISCOVERY");

    const { code, output } = await runNoskills(root, ["spec", SPEC, "reset"]);

    assert.assertEquals(code, 1, output);
    assert.assertStringIncludes(output, "Cannot reset from DISCOVERY");
    assert.assertEquals(output.includes("    at "), false, output);
    assert.assertEquals(output.includes("directory not found"), false, output);
  });

  // ac, task and note on a spec that does not exist crashed uncaught.
  bdd.it("ac, task and note on a missing spec refuse", async () => {
    for (const args of [
      ["ac", "add", "x"],
      ["ac", "list"],
      ["task", "add", "x"],
      ["task", "list"],
      ["note", "add", "x"],
      ["note", "list"],
    ]) {
      // One command at a time, so a failure names it.
      // deno-lint-ignore no-await-in-loop
      const { code, output } = await runNoskills(root, [
        "spec",
        "ghost",
        ...args,
      ]);

      assert.assertEquals(code, 1, `${args.join(" ")}: ${output}`);
      assert.assertStringIncludes(output, "ghost", args.join(" "));
      assert.assertEquals(output.includes("    at "), false, output);
    }
  });

  // free and validate printed the default command, because they never
  // loaded the manifest's before using it.
  bdd.it("free and validate name the manifest's command", async () => {
    const manifest = `${root}/.eser/manifest.yml`;
    await runtime.fs.writeTextFile(
      manifest,
      (await runtime.fs.readTextFile(manifest)).replace(
        "command: npx eser@latest noskills",
        "command: my-noskills",
      ),
    );

    for (const args of [["free"], ["validate"]]) {
      // deno-lint-ignore no-await-in-loop
      const { output } = await runNoskills(root, args);

      assert.assertStringIncludes(output, "my-noskills", args[0]);
      assert.assertEquals(output.includes("npx eser@latest"), false, output);
    }
  });

  // `spec <name>` on a spec that does not exist crashed in status.
  bdd.it("a missing spec without a subcommand refuses", async () => {
    const { code, output } = await runNoskills(root, ["spec", "ghost"]);

    assert.assertEquals(code, 1, output);
    assert.assertStringIncludes(output, "Spec 'ghost' not found");
    assert.assertEquals(output.includes("    at "), false, output);
  });
});

// parseInt accepted "--question=1x" as question 1.
bdd.describe("noskills review: the question number", () => {
  bdd.it("is a whole number or nothing", () => {
    assert.assertEquals(review.questionIndexOf("--question=2"), 1);
    for (const arg of [
      "--question=1x",
      "--question=",
      "--question=0x1",
      "--question=1.5",
    ]) {
      assert.assertEquals(review.questionIndexOf(arg), null, arg);
    }
  });
});
