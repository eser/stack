// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as task from "@eserstack/functions/task";
import * as results from "@eserstack/primitives/results";
import type {
  RunOptions,
  WorkflowFileMutation,
  WorkflowTool,
  WorkflowToolContext,
} from "./types.ts";
import * as engine from "./engine.ts";
import * as registry from "./registry.ts";

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
  const result = engine.resolveStep("fix-eof");
  assert.assertEquals(result, {
    name: "fix-eof",
    options: {},
    continueOnError: false,
  });
});

Deno.test("resolveStep — record step parses name and options", () => {
  const result = engine.resolveStep({ "check-json": { exclude: ["x"] } });
  assert.assertEquals(result.name, "check-json");
  assert.assertEquals(result.options, { exclude: ["x"] });
  assert.assertEquals(result.continueOnError, false);
  assert.assertEquals(result.timeout, undefined);
});

Deno.test("resolveStep — record with 2 keys throws", () => {
  assert.assertThrows(
    () => engine.resolveStep({ a: {}, b: {} }),
    Error,
    "expected exactly one key, got 2",
  );
});

Deno.test("resolveStep — continueOnError extracted and stripped from options", () => {
  const result = engine.resolveStep({
    "my-tool": { continueOnError: true, strict: true },
  });
  assert.assertEquals(result.continueOnError, true);
  assert.assertEquals(result.options, { strict: true });
});

Deno.test("resolveStep — timeout extracted as milliseconds and stripped from options", () => {
  const result = engine.resolveStep({
    "my-tool": { timeout: 120, verbose: false },
  });
  assert.assertEquals(result.timeout, 120_000);
  assert.assertEquals(result.options, { verbose: false });
  assert.assertEquals(result.continueOnError, false);
});

Deno.test("resolveStep keeps the milliseconds of a fractional timeout", () => {
  const result = engine.resolveStep({ "my-tool": { timeout: 0.5 } });
  assert.assertEquals(result.timeout, 500);
});

const invalidTimeouts = [
  { name: "zero", value: 0 },
  { name: "a negative number", value: -5 },
  { name: "a string", value: "30" },
  { name: "NaN (YAML .nan)", value: Number.NaN },
  { name: "Infinity (YAML .inf)", value: Number.POSITIVE_INFINITY },
  { name: "more than a timer holds", value: 3_000_000 },
];

for (const { name, value } of invalidTimeouts) {
  Deno.test(`resolveStep rejects ${name} as a timeout`, () => {
    assert.assertThrows(
      () => engine.resolveStep({ "my-tool": { timeout: value } }),
      Error,
      "Invalid step config for 'my-tool': timeout must be a number of seconds",
    );
  });
}

// ---------------------------------------------------------------------------
// runWorkflow tests
// ---------------------------------------------------------------------------

Deno.test({
  name:
    "runWorkflow — 2 passing tools → result.passed === true, durationMs > 0",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const toolRegistry = registry.createRegistry();
    toolRegistry.registerAll([passingTool, passingTool2]);

    const workflow = {
      id: "test-wf",
      on: ["precommit"],
      steps: ["pass-tool", "pass-tool-2"],
    } as const;

    const taskResult = await task.runTask(
      engine.runWorkflow(workflow, toolRegistry),
    );
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
    const toolRegistry = registry.createRegistry();
    toolRegistry.register(failingTool);

    const workflow = {
      id: "fail-wf",
      on: ["precommit"],
      steps: ["fail-tool"],
    } as const;

    const taskResult = await task.runTask(
      engine.runWorkflow(workflow, toolRegistry),
    );
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
    const toolRegistry = registry.createRegistry();
    toolRegistry.register(passingTool);

    const workflow = {
      id: "unknown-wf",
      on: ["precommit"],
      steps: ["nonexistent-tool"],
    } as const;

    const taskResult = await task.runTask(
      engine.runWorkflow(workflow, toolRegistry),
    );
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
    const toolRegistry = registry.createRegistry();
    toolRegistry.registerAll([throwingTool, passingTool]);

    const workflow = {
      id: "continue-wf",
      on: ["precommit"],
      steps: [
        { "throw-tool": { continueOnError: true } },
        "pass-tool",
      ],
    } as const;

    const taskResult = await task.runTask(
      engine.runWorkflow(workflow, toolRegistry),
    );
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
    const toolRegistry = registry.createRegistry();
    toolRegistry.register(mutatingTool);

    const workflow = {
      id: "mutate-wf",
      on: ["precommit"],
      steps: ["mutate-tool"],
    } as const;

    const capturedMutations: WorkflowFileMutation[][] = [];

    const taskResult = await task.runTask(
      engine.runWorkflow(workflow, toolRegistry, {
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

// ---------------------------------------------------------------------------
// Step time limit (TASK-105)
// ---------------------------------------------------------------------------

const okResult = (name: string) => ({
  name,
  passed: true,
  issues: [],
  mutations: [],
  stats: {},
});

// Blocks the event loop for `ms`, as a synchronous native call does.
const blockFor = (ms: number): void => {
  const end = performance.now() + ms;
  while (performance.now() < end) {
    // busy wait
  }
};

const runOne = async (
  tool: WorkflowTool,
  step: Record<string, unknown>,
  options: RunOptions = {},
) => {
  const toolRegistry = registry.createRegistry();
  toolRegistry.register(tool);

  return await task.runTask(
    engine.runWorkflow(
      { id: "limit-wf", on: ["test"], steps: [{ [tool.name]: step }] },
      toolRegistry,
      options,
    ),
  );
};

Deno.test("runWorkflow passes the run flags to the tool next to its options", async () => {
  let seen: Record<string, unknown> | null = null;
  const tool: WorkflowTool = {
    name: "options-tool",
    description: "Records its options",
    run: (options) => {
      seen = options;
      return Promise.resolve(okResult("options-tool"));
    },
  };

  const taskResult = await runOne(tool, { strict: true }, {
    root: "project",
    fix: true,
    dryRun: true,
    args: ["msg.txt"],
  });

  assert.assert(results.isOk(taskResult));
  assert.assertEquals(seen, {
    strict: true,
    root: "project",
    fix: true,
    dryRun: true,
    _args: ["msg.txt"],
  });
});

Deno.test("runWorkflow gives the tool the step's time limit and a signal that aborts when the step ends", async () => {
  const contexts: WorkflowToolContext[] = [];
  const abortedWhileRunning: boolean[] = [];
  const tool: WorkflowTool = {
    name: "context-tool",
    description: "Records its context",
    run: (_options, context) => {
      contexts.push(context);
      abortedWhileRunning.push(context.signal.aborted);
      return Promise.resolve(okResult("context-tool"));
    },
  };

  const withStepTimeout = await runOne(tool, { timeout: 2 });
  const withDefault = await runOne(tool, {}, { defaultTimeout: 1_500 });

  assert.assert(results.isOk(withStepTimeout));
  assert.assert(results.isOk(withDefault));
  assert.assertEquals(contexts.map((c) => c.timeoutMs), [2_000, 1_500]);
  assert.assertEquals(abortedWhileRunning, [false, false]);
  assert.assertEquals(contexts.map((c) => c.signal.aborted), [true, true]);
});

const invalidDefaultTimeouts = [0, -1, Number.NaN, 3_000_000_000];

for (const defaultTimeout of invalidDefaultTimeouts) {
  Deno.test(`runWorkflow rejects defaultTimeout ${defaultTimeout} before running a step`, async () => {
    let ran = false;
    const tool: WorkflowTool = {
      name: "never-tool",
      description: "Must not run",
      run: () => {
        ran = true;
        return Promise.resolve(okResult("never-tool"));
      },
    };

    const taskResult = await runOne(tool, {}, { defaultTimeout });

    assert.assert(results.isFail(taskResult));
    assert.assertStringIncludes(
      taskResult.error.message,
      `defaultTimeout ${defaultTimeout} is out of range`,
    );
    assert.assertFalse(ran);
  });
}

Deno.test("runWorkflow aborts the signal of a step past its timeout and waits for the tool to stop", async () => {
  let stoppedAt: number | null = null;
  const tool: WorkflowTool = {
    name: "slow-tool",
    description: "Runs until its signal aborts",
    run: (_options, context) =>
      new Promise((_resolve, reject) => {
        context.signal.addEventListener("abort", () => {
          // Stopping takes a moment, like a killed process being reaped.
          setTimeout(() => {
            stoppedAt = performance.now();
            reject(new Error("stopped"));
          }, 20);
        });
      }),
  };

  const failing = await runOne(tool, { timeout: 0.05 });
  const returnedAt = performance.now();

  assert.assert(results.isFail(failing));
  assert.assertEquals(
    failing.error.message,
    "Step 'slow-tool' ran past its 0.05s timeout; raise the step's timeout " +
      "option (in seconds) to give it more time",
  );
  assert.assertNotEquals(stoppedAt, null);
  assert.assert(stoppedAt! <= returnedAt, "the step ended before its tool");

  const continuing = await runOne(tool, {
    timeout: 0.05,
    continueOnError: true,
  });

  assert.assert(results.isOk(continuing));
  assert.assertEquals(continuing.value.passed, false);
  assert.assertStringIncludes(
    continuing.value.steps[0]?.issues[0]?.message ?? "",
    "ran past its 0.05s timeout",
  );
});

Deno.test("runWorkflow reports a tool that blocks and fails at its own time limit as the step's timeout", async () => {
  const tool: WorkflowTool = {
    name: "blocking-tool",
    description: "Blocks past its limit, then fails, like a native exec",
    run: (_options, context) => {
      blockFor(context.timeoutMs + 10);
      return Promise.reject(
        new Error("run sh: the command ran past its limit"),
      );
    },
  };

  const taskResult = await runOne(tool, { timeout: 0.05 });

  assert.assert(results.isFail(taskResult));
  assert.assertStringIncludes(
    taskResult.error.message,
    "Step 'blocking-tool' ran past its 0.05s timeout",
  );
});

Deno.test("runWorkflow keeps the error of a tool that fails within its time limit", async () => {
  const taskResult = await runOne(throwingTool, { timeout: 10 });

  assert.assert(results.isFail(taskResult));
  assert.assertEquals(taskResult.error.message, "tool exploded");
});
