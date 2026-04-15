// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as task from "@eserstack/functions/task";
import * as results from "@eserstack/primitives/results";
import type { WorkflowFileMutation, WorkflowTool } from "./types.ts";
import { resolveStep, runWorkflow } from "./engine.ts";
import { createRegistry } from "./registry.ts";

// ---------------------------------------------------------------------------
// Mock tools
// ---------------------------------------------------------------------------

const passingTool: WorkflowTool = {
  name: "pass-tool",
  description: "Always passes",
  run: () =>
    Promise.resolve({
      name: "pass-tool",
      passed: true,
      issues: [],
      mutations: [],
      stats: { filesChecked: 1 },
    }),
};

const passingTool2: WorkflowTool = {
  name: "pass-tool-2",
  description: "Also always passes",
  run: () =>
    Promise.resolve({
      name: "pass-tool-2",
      passed: true,
      issues: [],
      mutations: [],
      stats: { filesChecked: 2 },
    }),
};

const failingTool: WorkflowTool = {
  name: "fail-tool",
  description: "Returns issues",
  run: () =>
    Promise.resolve({
      name: "fail-tool",
      passed: false,
      issues: [{ message: "something is wrong", path: "foo.ts", line: 10 }],
      mutations: [],
      stats: { filesChecked: 1 },
    }),
};

const throwingTool: WorkflowTool = {
  name: "throw-tool",
  description: "Throws an error",
  run: () => Promise.reject(new Error("tool exploded")),
};

const mutatingTool: WorkflowTool = {
  name: "mutate-tool",
  description: "Produces mutations",
  run: () =>
    Promise.resolve({
      name: "mutate-tool",
      passed: true,
      issues: [],
      mutations: [
        { path: "a.txt", oldContent: "old", newContent: "new" },
      ] as readonly WorkflowFileMutation[],
      stats: { filesChecked: 1 },
    }),
};

// ---------------------------------------------------------------------------
// resolveStep tests
// ---------------------------------------------------------------------------

Deno.test("resolveStep — string step returns name with empty options", () => {
  const result = resolveStep("fix-eof");
  assert.assertEquals(result, {
    name: "fix-eof",
    options: {},
    continueOnError: false,
  });
});

Deno.test("resolveStep — record step parses name and options", () => {
  const result = resolveStep({ "check-json": { exclude: ["x"] } });
  assert.assertEquals(result.name, "check-json");
  assert.assertEquals(result.options, { exclude: ["x"] });
  assert.assertEquals(result.continueOnError, false);
  assert.assertEquals(result.timeout, undefined);
});

Deno.test("resolveStep — record with 2 keys throws", () => {
  assert.assertThrows(
    () => resolveStep({ a: {}, b: {} }),
    Error,
    "expected exactly one key, got 2",
  );
});

Deno.test("resolveStep — continueOnError extracted and stripped from options", () => {
  const result = resolveStep({
    "my-tool": { continueOnError: true, strict: true },
  });
  assert.assertEquals(result.continueOnError, true);
  assert.assertEquals(result.options, { strict: true });
});

Deno.test("resolveStep — timeout extracted as milliseconds and stripped from options", () => {
  const result = resolveStep({
    "my-tool": { timeout: 120, verbose: false },
  });
  assert.assertEquals(result.timeout, 120_000);
  assert.assertEquals(result.options, { verbose: false });
  assert.assertEquals(result.continueOnError, false);
});

// ---------------------------------------------------------------------------
// runWorkflow tests
// ---------------------------------------------------------------------------

Deno.test({
  name:
    "runWorkflow — 2 passing tools → result.passed === true, durationMs > 0",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const registry = createRegistry();
    registry.registerAll([passingTool, passingTool2]);

    const workflow = {
      id: "test-wf",
      on: ["precommit"],
      steps: ["pass-tool", "pass-tool-2"],
    } as const;

    const taskResult = await task.runTask(runWorkflow(workflow, registry));
    assert.assert(results.isOk(taskResult));

    const result = taskResult.value;
    assert.assertEquals(result.passed, true);
    assert.assertEquals(result.workflowId, "test-wf");
    assert.assertEquals(result.steps.length, 2);
    assert.assert(result.totalDurationMs > 0);
    assert.assert(result.steps[0]!.durationMs >= 0);
  },
});

Deno.test({
  name: "runWorkflow — tool that returns issues → result.passed === false",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const registry = createRegistry();
    registry.register(failingTool);

    const workflow = {
      id: "fail-wf",
      on: ["precommit"],
      steps: ["fail-tool"],
    } as const;

    const taskResult = await task.runTask(runWorkflow(workflow, registry));
    assert.assert(results.isOk(taskResult));

    const result = taskResult.value;
    assert.assertEquals(result.passed, false);
    assert.assertEquals(result.steps.length, 1);
    assert.assertEquals(result.steps[0]!.issues.length, 1);
    assert.assertEquals(
      result.steps[0]!.issues[0]!.message,
      "something is wrong",
    );
  },
});

Deno.test({
  name: "runWorkflow — unknown tool returns error result",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const registry = createRegistry();
    registry.register(passingTool);

    const workflow = {
      id: "unknown-wf",
      on: ["precommit"],
      steps: ["nonexistent-tool"],
    } as const;

    const taskResult = await task.runTask(runWorkflow(workflow, registry));
    assert.assert(results.isFail(taskResult));
    assert.assertStringIncludes(
      taskResult.error.message,
      "Unknown tool 'nonexistent-tool'",
    );
  },
});

Deno.test({
  name:
    "runWorkflow — continueOnError:true + tool throws → continues, step marked failed",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const registry = createRegistry();
    registry.registerAll([throwingTool, passingTool]);

    const workflow = {
      id: "continue-wf",
      on: ["precommit"],
      steps: [
        { "throw-tool": { continueOnError: true } },
        "pass-tool",
      ],
    } as const;

    const taskResult = await task.runTask(runWorkflow(workflow, registry));
    assert.assert(results.isOk(taskResult));

    const result = taskResult.value;
    assert.assertEquals(result.passed, false);
    assert.assertEquals(result.steps.length, 2);
    assert.assertEquals(result.steps[0]!.passed, false);
    assert.assertEquals(
      result.steps[0]!.issues[0]!.message,
      "tool exploded",
    );
    assert.assertEquals(result.steps[1]!.passed, true);
  },
});

Deno.test({
  name:
    "runWorkflow — onMutations callback invoked when tool returns mutations",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const registry = createRegistry();
    registry.register(mutatingTool);

    const workflow = {
      id: "mutate-wf",
      on: ["precommit"],
      steps: ["mutate-tool"],
    } as const;

    const capturedMutations: WorkflowFileMutation[][] = [];

    const taskResult = await task.runTask(
      runWorkflow(workflow, registry, {
        onMutations: (mutations) => {
          capturedMutations.push([...mutations]);
          return Promise.resolve();
        },
      }),
    );

    assert.assert(results.isOk(taskResult));

    const result = taskResult.value;
    assert.assertEquals(result.passed, true);
    assert.assertEquals(capturedMutations.length, 1);
    assert.assertEquals(capturedMutations[0]!.length, 1);
    assert.assertEquals(capturedMutations[0]![0]!.path, "a.txt");
    assert.assertEquals(capturedMutations[0]![0]!.newContent, "new");
  },
});
