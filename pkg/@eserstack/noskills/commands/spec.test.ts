// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * End-to-end tests for the two split paths as the CLI runs them:
 * `spec <name> split --into ...` (spec.ts) and `spec <name> next
 * --answer="split"` (next.ts). Both create the children through
 * state/split.ts, whose own tests cover the helper directly.
 *
 * @module
 */

import * as bdd from "@std/testing/bdd";
import * as assert from "@eserstack/test-kit/assert";
import * as crossRuntime from "@eserstack/standards/cross-runtime";
import * as machine from "../state/machine.ts";
import * as persistence from "../state/persistence.ts";
import * as schema from "../state/schema.ts";
import * as splitDetector from "../context/split-detector.ts";

const PREFIX = "deno run -A ./tools/nos.ts";

const REPO_ROOT = crossRuntime.runtime.path.resolve(
  import.meta.dirname ?? ".",
  "../../../..",
);

const ANSWERS: readonly (readonly [string, string])[] = [
  [
    "status_quo",
    "(1) Log messages are too verbose and flood stdout (2) Bot chat responses use wrong gender pronouns",
  ],
  ["ambition", "fix log levels AND restore bot gender detection"],
  ["reversibility", "all reversible, safe to undo at any point"],
  ["user_impact", "positive only, users will benefit from this change"],
  ["verification", "test without developer 1, verify no rchat errors"],
  ["scope_boundary", "no rchat.c rewrite allowed in this scope"],
];

/** A parent spec whose discovery answers cover two areas, under review. */
const parentUnderReview = (): schema.StateFile => {
  let state = machine.startSpec(
    schema.createInitialState(),
    "parent",
    "spec/parent",
  );
  for (const [questionId, answer] of ANSWERS) {
    state = machine.addDiscoveryAnswer(state, questionId, answer);
  }

  return machine.approveDiscoveryAnswers(machine.completeDiscovery(state));
};

const writeSpec = async (
  root: string,
  name: string,
  state: schema.StateFile,
): Promise<void> => {
  await crossRuntime.runtime.fs.mkdir(
    `${root}/${persistence.paths.specDir(name)}`,
    { recursive: true },
  );
  await persistence.writeSpecState(root, name, state);
};

/** An initialized project with the parent spec in it. */
const createProject = async (): Promise<string> => {
  const root = await crossRuntime.runtime.fs.makeTempDir({
    prefix: "nos_spec_split_",
  });
  await persistence.scaffoldEserDir(root);
  await persistence.writeManifest(root, {
    ...schema.createInitialManifest([], ["claude-code"], ["anthropic"], {
      languages: ["typescript"],
      frameworks: [],
      ci: [],
      testRunner: "deno",
    }),
    command: PREFIX,
  });
  await writeSpec(root, "parent", parentUnderReview());

  return root;
};

type CliResult = {
  readonly code: number;
  readonly stdout: string;
};

const runNoskills = async (
  root: string,
  args: readonly string[],
): Promise<CliResult> => {
  const result = await crossRuntime.runtime.exec.spawn(
    crossRuntime.runtime.process.execPath(),
    [
      "run",
      "-A",
      "--config",
      `${REPO_ROOT}/deno.json`,
      `${REPO_ROOT}/pkg/@eserstack/noskills/main.ts`,
      ...args,
    ],
    {
      cwd: root,
      env: { NOSKILLS_PROJECT_ROOT: root, NO_COLOR: "1" },
      stdin: "null",
      stdout: "piped",
      stderr: "piped",
    },
  );
  const stderr = new TextDecoder().decode(result.stderr);
  assert.assertEquals(stderr.includes("error: Uncaught"), false, stderr);

  return {
    code: result.code,
    stdout: new TextDecoder().decode(result.stdout),
  };
};

bdd.describe("splitting a spec through the CLI", () => {
  let root: string;

  bdd.beforeEach(async () => {
    root = await createProject();
  });

  bdd.afterEach(async () => {
    await crossRuntime.runtime.fs.remove(root, { recursive: true });
  });

  bdd.it(
    "spec split --into creates each child with every parent answer",
    async () => {
      const result = await runNoskills(root, [
        "spec",
        "parent",
        "split",
        "--into",
        "log-levels",
        "Fix the log levels",
        "--into",
        "bot-pronouns",
        "Restore the bot's pronouns",
      ]);

      assert.assertEquals(result.code, 0, result.stdout);
      const parent = await persistence.readSpecState(root, "parent");
      assert.assertEquals(parent.completionReason, "cancelled");
      assert.assertEquals(
        parent.completionNote,
        "Split into: log-levels, bot-pronouns",
      );
      const children = await Promise.all(
        ["log-levels", "bot-pronouns"].map((name) =>
          persistence.readSpecState(root, name),
        ),
      );
      assert.assertEquals(
        children.map((child) => [
          child.phase,
          child.specDescription,
          child.discovery.answers.length,
        ]),
        [
          ["DISCOVERY_REFINEMENT", "Fix the log levels", ANSWERS.length],
          [
            "DISCOVERY_REFINEMENT",
            "Restore the bot's pronouns",
            ANSWERS.length,
          ],
        ],
      );
    },
  );

  bdd.it(
    "spec split --into refuses a name that is already a spec",
    async () => {
      const taken = machine.startSpec(
        schema.createInitialState(),
        "bot-pronouns",
        "spec/bot-pronouns",
      );
      await writeSpec(root, "bot-pronouns", taken);

      const result = await runNoskills(root, [
        "spec",
        "parent",
        "split",
        "--into",
        "log-levels",
        "Fix the log levels",
        "--into",
        "bot-pronouns",
        "Restore the bot's pronouns",
      ]);

      assert.assertEquals(result.code, 1);
      assert.assertStringIncludes(
        result.stdout,
        `already exist: "bot-pronouns"`,
      );
      assert.assertStringIncludes(result.stdout, `${PREFIX} spec parent split`);
      assert.assertEquals(
        (await persistence.readSpecState(root, "parent")).phase,
        "DISCOVERY_REFINEMENT",
      );
      assert.assertEquals(
        await crossRuntime.runtime.fs.exists(
          `${root}/${persistence.paths.specDir("log-levels")}`,
        ),
        false,
      );
    },
  );

  bdd.it(
    "next --answer=split reports a taken child name instead of throwing",
    async () => {
      const [first] = splitDetector.analyzeForSplit(
        parentUnderReview().discovery.answers,
      ).proposals;
      if (first === undefined) throw new Error("the fixture has no split");
      const taken = machine.startSpec(
        schema.createInitialState(),
        first.name,
        `spec/${first.name}`,
      );
      await writeSpec(root, first.name, taken);

      const result = await runNoskills(root, [
        "spec",
        "parent",
        "next",
        "--answer=split",
      ]);

      assert.assertEquals(result.code, 1);
      const output = JSON.parse(result.stdout) as { error?: unknown };
      assert.assertEquals(typeof output.error, "string");
      assert.assertStringIncludes(
        String(output.error),
        `already exist: "${first.name}"`,
      );
      assert.assertEquals(
        (await persistence.readSpecState(root, "parent")).phase,
        "DISCOVERY_REFINEMENT",
      );
    },
  );
});

// TASK-324: `noskills spec --help` took --help for a spec name and crashed
// looking for .eser/specs/--help.
bdd.describe("noskills spec --help", () => {
  bdd.it("prints the usage", async () => {
    const repo = crossRuntime.runtime.path.resolve(
      import.meta.dirname ?? ".",
      "../../../..",
    );
    const root = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "nos_spec_help_",
    });
    const run = (args: readonly string[]) =>
      crossRuntime.runtime.exec.spawn(
        crossRuntime.runtime.process.execPath(),
        [
          "run",
          "-A",
          "--config",
          `${repo}/deno.json`,
          `${repo}/pkg/@eserstack/noskills/main.ts`,
          ...args,
        ],
        { cwd: root, stdin: "null", stdout: "piped", stderr: "piped" },
      );

    try {
      await run(["init", "--non-interactive", "--tools=claude-code"]);

      for (const flag of ["--help", "-h"]) {
        // One flag at a time, so a failure names it.
        // oxlint-disable-next-line no-await-in-loop
        const result = await run(["spec", flag]);
        const stdout = new TextDecoder().decode(result.stdout);
        assert.assertEquals(
          result.code,
          0,
          new TextDecoder().decode(result.stderr),
        );
        assert.assertStringIncludes(stdout, "Usage:");
      }
    } finally {
      await crossRuntime.runtime.fs.remove(root, { recursive: true });
    }
  });
});
