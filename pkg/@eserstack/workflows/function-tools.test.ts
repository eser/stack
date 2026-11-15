// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as results from "@eserstack/primitives/results";
import * as task from "@eserstack/functions/task";
import type * as native from "@eserstack/functions/native";
import * as builder from "./builder.ts";
import * as engine from "./engine.ts";
import * as functionTools from "./function-tools.ts";
import * as registry from "./registry.ts";
import type { WorkflowTool, WorkflowToolContext } from "./types.ts";

const context = (): WorkflowToolContext => ({
  timeoutMs: 60_000,
  signal: new AbortController().signal,
});

type Seen = { name: string; input: unknown; signal: AbortSignal };

const recording = (
  outcome: (call: native.NativeCall) => native.NativeOutcome,
): { caller: native.NativeCaller; seen: Seen[] } => {
  const seen: Seen[] = [];

  return {
    seen,
    caller: (call) => {
      seen.push({ name: call.name, input: call.input, signal: call.signal });

      return Promise.resolve(outcome(call));
    },
  };
};

// === toolResultOfOutput ===

nodeTest.test(
  "toolResultOfOutput reads a ToolOutput as the result of the step",
  () => {
    assert.assertEquals(
      functionTools.toolResultOfOutput("check", {
        passed: false,
        issues: [{ path: "a.txt", line: 3, message: "text is empty" }],
        mutations: [{ path: "a.txt", oldContent: "a", newContent: "b" }],
        stats: { checked: 2, label: "dropped: not a number" },
      }),
      {
        name: "check",
        passed: false,
        issues: [{ path: "a.txt", line: 3, message: "text is empty" }],
        mutations: [{ path: "a.txt", oldContent: "a", newContent: "b" }],
        stats: { checked: 2 },
      },
    );
  },
);

nodeTest.test("toolResultOfOutput passes the step for any other output", () => {
  const expected = {
    passed: true,
    issues: [],
    mutations: [],
    stats: {},
  };

  for (const output of [
    "Hello, Ada",
    42,
    null,
    [1, 2],
    { passed: "yes" },
    { passed: true, unknown: 1 },
  ]) {
    assert.assertEquals(functionTools.toolResultOfOutput("fn", output), {
      name: "fn",
      ...expected,
    });
  }
});

// === createHandlerTool: a TypeScript function ===

nodeTest.test(
  "createHandlerTool runs a TypeScript handler with the options of the step",
  async () => {
    const seen: unknown[] = [];
    const tool = functionTools.createHandlerTool(
      "greet",
      "Greets",
      (options) => {
        seen.push(options);

        return task.succeed({
          passed: true,
          stats: { length: String(options["name"]).length },
        });
      },
    );

    const result = await tool.run({ name: "Ada", root: "/work" }, context());

    assert.assertEquals(tool.name, "greet");
    assert.assertEquals(tool.description, "Greets");
    assert.assertEquals(seen, [{ name: "Ada", root: "/work" }]);
    assert.assertEquals(result, {
      name: "greet",
      passed: true,
      issues: [],
      mutations: [],
      stats: { length: 3 },
    });
  },
);

nodeTest.test(
  "createHandlerTool gives a handler the signal of the step",
  async () => {
    const controller = new AbortController();
    let received: AbortSignal | undefined;

    const tool = functionTools.createHandlerTool(
      "needs-signal",
      "Reads its signal",
      () =>
        task.task<unknown, never, task.Cancellable>(({ signal }) => {
          received = signal;

          return Promise.resolve(results.ok({ passed: true }));
        }),
    );

    await tool.run({}, { timeoutMs: 1000, signal: controller.signal });

    assert.assertEquals(received, controller.signal);
  },
);

nodeTest.test(
  "createHandlerTool fails the step on a ValidationError and an AdaptError",
  async () => {
    const outcomes = await Promise.all(
      ["ValidationError", "AdaptError"].map((tag) =>
        functionTools
          .createHandlerTool("refuses", "Refuses", () =>
            task.failTask({ _tag: tag, message: "bad options" }),
          )
          .run({}, context()),
      ),
    );

    for (const outcome of outcomes) {
      assert.assertEquals(outcome, {
        name: "refuses",
        passed: false,
        issues: [{ message: "bad options" }],
        mutations: [],
        stats: {},
      });
    }
  },
);

nodeTest.test("createHandlerTool throws any other failure", async () => {
  const tool = functionTools.createHandlerTool("breaks", "Breaks", () =>
    task.failTask({ _tag: "DiskError", message: "disk full" }),
  );

  await assert.assertRejects(
    () => tool.run({}, context()),
    Error,
    "breaks: disk full",
  );
});

// === createNativeFunctionTool: a native function ===

nodeTest.test(
  "createNativeFunctionTool runs the function the step names with the other options as its input",
  async () => {
    const { caller, seen } = recording(() => ({
      ok: true,
      output: {
        passed: false,
        issues: [{ message: "a.txt: file does not end with a newline" }],
        stats: { filesChecked: 2 },
      },
    }));
    const tool = functionTools.createNativeFunctionTool(caller);

    const result = await tool.run(
      { function: "validate-eof", root: "/work", fix: false },
      context(),
    );

    assert.assertEquals(tool.name, "native-function");
    assert.assertEquals(seen.length, 1);
    assert.assertEquals(seen[0]?.name, "validate-eof");
    assert.assertEquals(seen[0]?.input, { root: "/work", fix: false });
    assert.assertEquals(result, {
      name: "validate-eof",
      passed: false,
      issues: [{ message: "a.txt: file does not end with a newline" }],
      mutations: [],
      stats: { filesChecked: 2 },
    });
  },
);

nodeTest.test(
  "createNativeFunctionTool fails a step that names no function",
  async () => {
    const { caller, seen } = recording(() => ({ ok: true, output: null }));
    const tool = functionTools.createNativeFunctionTool(caller);

    const outcomes = await Promise.all(
      [{}, { function: "" }, { function: 3 }].map((options) =>
        tool.run(options, context()),
      ),
    );

    for (const result of outcomes) {
      assert.assertEquals(result.passed, false);
      assert.assertEquals(
        result.issues[0]?.message.includes('"function"'),
        true,
      );
    }

    assert.assertEquals(seen.length, 0);
  },
);

nodeTest.test(
  "createNativeFunctionTool maps the kinds of Go errors the way the Go engine does",
  async () => {
    const validation = functionTools.createNativeFunctionTool(
      recording(() => ({
        ok: false,
        error: "maxKb must be a number",
        kind: "ValidationError",
      })).caller,
    );

    assert.assertEquals(
      await validation.run({ function: "validate-large-files" }, context()),
      {
        name: "validate-large-files",
        passed: false,
        issues: [{ message: "maxKb must be a number" }],
        mutations: [],
        stats: {},
      },
    );

    const kinds = ["UnknownFunction", "AbortError", undefined];

    await Promise.all(
      kinds.map((kind) =>
        assert.assertRejects(() =>
          functionTools
            .createNativeFunctionTool(
              recording(() =>
                kind === undefined
                  ? { ok: false, error: "disk full" }
                  : { ok: false, error: "went wrong", kind },
              ).caller,
            )
            .run({ function: "anything" }, context()),
        ),
      ),
    );
  },
);

nodeTest.test(
  "createNativeFunctionTool passes the signal of the step to the native call",
  async () => {
    const controller = new AbortController();
    const { caller, seen } = recording(() => ({ ok: true, output: "done" }));

    await functionTools
      .createNativeFunctionTool(caller)
      .run({ function: "fn" }, { timeoutMs: 1000, signal: controller.signal });

    assert.assertEquals(seen[0]?.signal, controller.signal);
  },
);

nodeTest.test(
  "createNativeFunctionTools makes one tool per function under its own name",
  async () => {
    const { caller, seen } = recording(() => ({
      ok: true,
      output: { passed: true },
    }));

    const tools = functionTools.createNativeFunctionTools(caller, [
      { name: "validate-eof", description: "ensure a final newline" },
      { name: "validate-json" },
    ]);

    assert.assertEquals(
      tools.map((tool) => [tool.name, tool.description]),
      [
        ["validate-eof", "ensure a final newline"],
        ["validate-json", "Native function validate-json"],
      ],
    );

    await tools[1]?.run({ root: "/work" }, context());

    assert.assertEquals(seen[0]?.name, "validate-json");
    assert.assertEquals(seen[0]?.input, { root: "/work" });
  },
);

// === In the engine: a TypeScript function and a native function in one run ===

nodeTest.test(
  "a workflow calls a TypeScript function and a native function in one run",
  async () => {
    const { caller, seen } = recording((call) => ({
      ok: true,
      output: {
        passed: true,
        stats: { echoed: String(call.input).length },
      },
    }));

    const tools = registry.createRegistry();
    tools.register(
      functionTools.createHandlerTool("ts-count", "Counts in TypeScript", () =>
        task.succeed({ passed: true, stats: { counted: 7 } }),
      ),
    );
    tools.register(functionTools.createNativeFunctionTool(caller));

    const workflow = builder
      .createWorkflow("mixed")
      .on("check")
      .step("ts-count")
      .step("native-function", { function: "go-count", paths: ["a", "b"] })
      .build();

    const run = await task.runTask(
      engine.runWorkflow(workflow, tools, { root: "/work" }),
    );

    assert.assertEquals(results.isOk(run), true);

    const workflowResult = results.isOk(run) ? run.value : undefined;

    assert.assertEquals(workflowResult?.passed, true);
    assert.assertEquals(
      workflowResult?.steps.map((step) => [step.name, step.passed]),
      [
        ["ts-count", true],
        ["go-count", true],
      ],
    );
    assert.assertEquals(workflowResult?.steps[0]?.stats, { counted: 7 });
    assert.assertEquals(seen.length, 1);
    assert.assertEquals(seen[0]?.name, "go-count");
    assert.assertEquals(
      (seen[0]?.input as { root?: string; paths?: unknown }).paths,
      ["a", "b"],
    );
    assert.assertEquals((seen[0]?.input as { root?: string }).root, "/work");
  },
);

nodeTest.test(
  "a failing native step fails the run, and continueOnError keeps it going",
  async () => {
    const failing: WorkflowTool = functionTools.createNativeFunctionTool(
      recording(() => ({
        ok: false,
        error: "no such function",
        kind: "UnknownFunction",
      })).caller,
    );

    const tools = registry.createRegistry();
    tools.register(failing);

    const stops = builder
      .createWorkflow("stops")
      .on("check")
      .step("native-function", { function: "missing" })
      .build();
    const continues = builder
      .createWorkflow("continues")
      .on("check")
      .step("native-function", { function: "missing", continueOnError: true })
      .build();

    const stopped = await task.runTask(engine.runWorkflow(stops, tools, {}));
    const kept = await task.runTask(engine.runWorkflow(continues, tools, {}));

    assert.assertEquals(results.isFail(stopped), true);
    assert.assertEquals(results.isOk(kept), true);
    assert.assertEquals(
      results.isOk(kept) ? kept.value.passed : undefined,
      false,
    );
  },
);
