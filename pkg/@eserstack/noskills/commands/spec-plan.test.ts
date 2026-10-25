// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Tests for the --from-plan feature of `noskills spec new`.
 *
 * @module
 */

import * as bdd from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as crossRuntime from "@eserstack/standards/cross-runtime";
import * as schema from "../state/schema.ts";
import * as machine from "../state/machine.ts";
import * as persistence from "../state/persistence.ts";
import * as compiler from "../context/compiler.ts";

// =============================================================================
// Helpers
// =============================================================================

let tempDir: string;

// =============================================================================
// createInitialState planPath default
// =============================================================================

bdd.describe("createInitialState planPath", () => {
  bdd.it("includes planPath: null by default", () => {
    const state = schema.createInitialState();

    assert.assertEquals(state.discovery.planPath, null);
  });
});

// =============================================================================
// Spec state with planPath round-trip
// =============================================================================

bdd.describe("spec state with planPath", () => {
  bdd.beforeEach(async () => {
    tempDir = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "spec_plan_",
    });
    await crossRuntime.runtime.fs.mkdir(
      `${tempDir}/.eser/.state/progresses/specs/test-plan`,
      { recursive: true },
    );
  });

  bdd.afterEach(async () => {
    await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
  });

  bdd.it("stores planPath and reads it back", async () => {
    const initial = schema.createInitialState();
    const started = machine.startSpec(
      initial,
      "test-plan",
      "spec/test-plan",
      "test desc",
    );
    const withPlan: schema.StateFile = {
      ...started,
      discovery: {
        ...started.discovery,
        planPath: "/tmp/my-plan.md",
      },
    };

    await persistence.writeSpecState(tempDir, "test-plan", withPlan);
    const loaded = await persistence.readSpecState(tempDir, "test-plan");

    assert.assertEquals(loaded.discovery.planPath, "/tmp/my-plan.md");
  });

  bdd.it("stores null planPath when no plan provided", async () => {
    const initial = schema.createInitialState();
    const started = machine.startSpec(
      initial,
      "test-plan",
      "spec/test-plan",
      "test desc",
    );

    await persistence.writeSpecState(tempDir, "test-plan", started);
    const loaded = await persistence.readSpecState(tempDir, "test-plan");

    assert.assertEquals(loaded.discovery.planPath, null);
  });
});

// =============================================================================
// Plan context in compiler output
// =============================================================================

bdd.describe("planContext in compiler output", () => {
  bdd.beforeEach(async () => {
    tempDir = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "plan_ctx_",
    });
  });

  bdd.afterEach(async () => {
    await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
  });

  bdd.it("includes planContext on Q1 when planPath is set", async () => {
    const planFile = `${tempDir}/plan.md`;
    await crossRuntime.runtime.fs.writeTextFile(
      planFile,
      "# Plan\nBuild a widget system",
    );

    const initial = schema.createInitialState();
    const started = machine.startSpec(
      initial,
      "plan-test",
      "spec/plan-test",
      "widget system",
    );
    const state: schema.StateFile = {
      ...started,
      discovery: {
        ...started.discovery,
        planPath: planFile,
      },
    };

    const output = await compiler.compile(state, [], []);
    const discovery = output as compiler.DiscoveryOutput;

    assert.assert(discovery.planContext !== undefined);
    assert.assertEquals(discovery.planContext.provided, true);
    assert.assert(
      discovery.planContext.content.includes("Build a widget system"),
    );
    assert.assert(discovery.planContext.instruction.length > 0);
  });

  bdd.it("does not include planContext on Q2", async () => {
    const planFile = `${tempDir}/plan.md`;
    await crossRuntime.runtime.fs.writeTextFile(
      planFile,
      "# Plan\nBuild a widget system",
    );

    const initial = schema.createInitialState();
    const started = machine.startSpec(
      initial,
      "plan-test",
      "spec/plan-test",
      "widget system",
    );
    // Move to Q2 by adding an answer for Q1
    const withAnswer = machine.addDiscoveryAnswer(
      started,
      "status_quo",
      "currently no widgets",
    );
    const state: schema.StateFile = {
      ...withAnswer,
      discovery: {
        ...withAnswer.discovery,
        planPath: planFile,
      },
    };

    const output = await compiler.compile(state, [], []);
    const discovery = output as compiler.DiscoveryOutput;

    assert.assertEquals(discovery.planContext, undefined);
  });

  bdd.it("does not include planContext when planPath is null", async () => {
    const initial = schema.createInitialState();
    const started = machine.startSpec(
      initial,
      "plan-test",
      "spec/plan-test",
      "widget system",
    );

    const output = await compiler.compile(started, [], []);
    const discovery = output as compiler.DiscoveryOutput;

    assert.assertEquals(discovery.planContext, undefined);
  });

  bdd.it("gracefully handles nonexistent plan file", async () => {
    const initial = schema.createInitialState();
    const started = machine.startSpec(
      initial,
      "plan-test",
      "spec/plan-test",
      "widget system",
    );
    const state: schema.StateFile = {
      ...started,
      discovery: {
        ...started.discovery,
        planPath: `${tempDir}/does-not-exist.md`,
      },
    };

    const output = await compiler.compile(state, [], []);
    const discovery = output as compiler.DiscoveryOutput;

    assert.assertEquals(discovery.planContext, undefined);
  });

  bdd.it("ignores plan file larger than 50KB", async () => {
    const planFile = `${tempDir}/big-plan.md`;
    const bigContent = "x".repeat(51 * 1024);
    await crossRuntime.runtime.fs.writeTextFile(planFile, bigContent);

    const initial = schema.createInitialState();
    const started = machine.startSpec(
      initial,
      "plan-test",
      "spec/plan-test",
      "widget system",
    );
    const state: schema.StateFile = {
      ...started,
      discovery: {
        ...started.discovery,
        planPath: planFile,
      },
    };

    const output = await compiler.compile(state, [], []);
    const discovery = output as compiler.DiscoveryOutput;

    assert.assertEquals(discovery.planContext, undefined);
  });

  bdd.it(
    "planContext.instruction contains expected guidance text",
    async () => {
      const planFile = `${tempDir}/plan.md`;
      await crossRuntime.runtime.fs.writeTextFile(planFile, "# My Plan");

      const initial = schema.createInitialState();
      const started = machine.startSpec(
        initial,
        "plan-test",
        "spec/plan-test",
        "my feature",
      );
      const state: schema.StateFile = {
        ...started,
        discovery: {
          ...started.discovery,
          planPath: planFile,
        },
      };

      const output = await compiler.compile(state, [], []);
      const discovery = output as compiler.DiscoveryOutput;

      assert.assert(discovery.planContext !== undefined);
      assert.assert(
        discovery.planContext.instruction.includes(
          "plan document was provided",
        ),
      );
      assert.assert(
        discovery.planContext.instruction.includes("Do NOT skip any question"),
      );
    },
  );
});

// TASK-324: with --from-plan, spec new saved the state from before the
// IDLE -> DISCOVERY transition was recorded, so the spec had no
// transitionHistory.
bdd.describe("spec new --from-plan", () => {
  bdd.it("records the transition and the plan path", async () => {
    const repo = crossRuntime.runtime.path.resolve(
      import.meta.dirname ?? ".",
      "../../../..",
    );
    const root = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "nos_from_plan_",
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
      await crossRuntime.runtime.fs.writeTextFile(
        `${root}/plan.md`,
        "# Plan\n",
      );
      const created = await run([
        "spec",
        "new",
        "--name=planned",
        "--from-plan=plan.md",
        "a spec started from a plan",
      ]);
      assert.assertEquals(
        created.code,
        0,
        new TextDecoder().decode(created.stderr),
      );

      const state = JSON.parse(
        await crossRuntime.runtime.fs.readTextFile(
          `${root}/${persistence.paths.specStatesDir}/planned.json`,
        ),
      ) as schema.StateFile;
      assert.assertEquals(state.discovery.planPath, "plan.md");
      assert.assertEquals(
        state.transitionHistory?.map((t) => `${t.from}->${t.to}`),
        ["IDLE->DISCOVERY"],
      );
    } finally {
      await crossRuntime.runtime.fs.remove(root, { recursive: true });
    }
  });
});
