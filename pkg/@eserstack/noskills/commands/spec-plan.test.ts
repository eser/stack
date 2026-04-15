// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Tests for the --from-plan feature of `noskills spec new`.
 *
 * @module
 */

import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { assert, assertEquals } from "@std/assert";
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

describe("createInitialState planPath", () => {
  it("includes planPath: null by default", () => {
    const state = schema.createInitialState();

    assertEquals(state.discovery.planPath, null);
  });
});

// =============================================================================
// Spec state with planPath round-trip
// =============================================================================

describe("spec state with planPath", () => {
  beforeEach(async () => {
    tempDir = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "spec_plan_",
    });
    await crossRuntime.runtime.fs.mkdir(
      `${tempDir}/.eser/.state/progresses/specs/test-plan`,
      { recursive: true },
    );
  });

  afterEach(async () => {
    await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
  });

  it("stores planPath and reads it back", async () => {
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

    assertEquals(loaded.discovery.planPath, "/tmp/my-plan.md");
  });

  it("stores null planPath when no plan provided", async () => {
    const initial = schema.createInitialState();
    const started = machine.startSpec(
      initial,
      "test-plan",
      "spec/test-plan",
      "test desc",
    );

    await persistence.writeSpecState(tempDir, "test-plan", started);
    const loaded = await persistence.readSpecState(tempDir, "test-plan");

    assertEquals(loaded.discovery.planPath, null);
  });
});

// =============================================================================
// Plan context in compiler output
// =============================================================================

describe("planContext in compiler output", () => {
  beforeEach(async () => {
    tempDir = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "plan_ctx_",
    });
  });

  afterEach(async () => {
    await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
  });

  it("includes planContext on Q1 when planPath is set", async () => {
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

    assert(discovery.planContext !== undefined);
    assertEquals(discovery.planContext.provided, true);
    assert(discovery.planContext.content.includes("Build a widget system"));
    assert(discovery.planContext.instruction.length > 0);
  });

  it("does not include planContext on Q2", async () => {
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

    assertEquals(discovery.planContext, undefined);
  });

  it("does not include planContext when planPath is null", async () => {
    const initial = schema.createInitialState();
    const started = machine.startSpec(
      initial,
      "plan-test",
      "spec/plan-test",
      "widget system",
    );

    const output = await compiler.compile(started, [], []);
    const discovery = output as compiler.DiscoveryOutput;

    assertEquals(discovery.planContext, undefined);
  });

  it("gracefully handles nonexistent plan file", async () => {
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

    assertEquals(discovery.planContext, undefined);
  });

  it("ignores plan file larger than 50KB", async () => {
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

    assertEquals(discovery.planContext, undefined);
  });

  it("planContext.instruction contains expected guidance text", async () => {
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

    assert(discovery.planContext !== undefined);
    assert(
      discovery.planContext.instruction.includes("plan document was provided"),
    );
    assert(
      discovery.planContext.instruction.includes("Do NOT skip any question"),
    );
  });
});
