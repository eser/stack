// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as task from "@eserstack/functions/task";
import * as results from "@eserstack/primitives/results";
import type { WorkflowDefinition, WorkflowTool } from "./types.ts";
import { resolveIncludes, runByEvent } from "./engine.ts";
import { createRegistry } from "./registry.ts";

// ---------------------------------------------------------------------------
// Mock tools
// ---------------------------------------------------------------------------

const dummyTool = (name: string): WorkflowTool => ({
  name,
  description: `dummy ${name}`,
  run: () =>
    Promise.resolve({
      name,
      passed: true,
      issues: [],
      mutations: [],
      stats: { filesChecked: 1 },
    }),
});

// ---------------------------------------------------------------------------
// resolveIncludes tests
// ---------------------------------------------------------------------------

Deno.test("resolveIncludes — flattens included workflow steps before own steps", () => {
  const base: WorkflowDefinition = {
    id: "base",
    on: ["precommit"],
    steps: ["step-a", "step-b"],
  };

  const child: WorkflowDefinition = {
    id: "child",
    on: ["precommit"],
    steps: ["step-c"],
    includes: ["base"],
  };

  const resolved = resolveIncludes(child, [base, child]);

  assert.assertEquals(resolved.steps, ["step-a", "step-b", "step-c"]);
  assert.assertEquals(resolved.includes, undefined);
});

Deno.test("resolveIncludes — circular includes throws", () => {
  const wfA: WorkflowDefinition = {
    id: "a",
    on: ["precommit"],
    steps: ["step-1"],
    includes: ["b"],
  };

  const wfB: WorkflowDefinition = {
    id: "b",
    on: ["precommit"],
    steps: ["step-2"],
    includes: ["a"],
  };

  assert.assertThrows(
    () => resolveIncludes(wfA, [wfA, wfB]),
    Error,
    "Circular include detected",
  );
});

Deno.test("resolveIncludes — missing include id throws", () => {
  const wf: WorkflowDefinition = {
    id: "orphan",
    on: ["precommit"],
    steps: ["step-1"],
    includes: ["nonexistent"],
  };

  assert.assertThrows(
    () => resolveIncludes(wf, [wf]),
    Error,
    "no workflow with that id exists",
  );
});

// ---------------------------------------------------------------------------
// runByEvent tests
// ---------------------------------------------------------------------------

Deno.test({
  name: "runByEvent — resolves includes before running",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const registry = createRegistry();
    registry.registerAll([dummyTool("step-a"), dummyTool("step-c")]);

    const base: WorkflowDefinition = {
      id: "base",
      on: ["ci"],
      steps: ["step-a"],
    };

    const child: WorkflowDefinition = {
      id: "child",
      on: ["ci"],
      steps: ["step-c"],
      includes: ["base"],
    };

    const taskResult = await task.runTask(
      runByEvent("ci", [base, child], registry),
    );
    assert.assert(results.isOk(taskResult));

    const eventResults = taskResult.value;

    // Both "base" and "child" match the "ci" event
    assert.assertEquals(eventResults.length, 2);

    // base runs its own step
    assert.assertEquals(eventResults[0]!.workflowId, "base");
    assert.assertEquals(eventResults[0]!.steps.length, 1);
    assert.assertEquals(eventResults[0]!.passed, true);

    // child resolves includes and runs base steps + own steps
    assert.assertEquals(eventResults[1]!.workflowId, "child");
    assert.assertEquals(eventResults[1]!.steps.length, 2);
    assert.assertEquals(eventResults[1]!.steps[0]!.name, "step-a");
    assert.assertEquals(eventResults[1]!.steps[1]!.name, "step-c");
    assert.assertEquals(eventResults[1]!.passed, true);
  },
});
