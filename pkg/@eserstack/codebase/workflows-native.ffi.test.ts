// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * One TypeScript workflow runs a TypeScript function, a native function and a
 * Go workflow, on the real native library (ADR 0011, TASK-393).
 *
 * The TypeScript engine runs the steps. `native-function` reaches the Go
 * validator through the bridge's `functionCall`, and `go-workflow` hands a
 * whole manifest workflow to the Go engine through `workflowRun`. Both read
 * the same tree, so they find the same problem.
 */

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as ffi from "@eserstack/ajan/ffi";
import * as nativeFunctions from "@eserstack/ajan/ffi/functions";
import * as functions from "@eserstack/functions";
import * as results from "@eserstack/primitives/results";
import * as workflows from "@eserstack/workflows/mod";
import type * as workflowTypes from "@eserstack/workflows/native-functions";

let library: ffi.FFILibrary | undefined;

nodeTest.before(async () => {
  library = await ffi.loadEserAjan({ wasm: false });
});

nodeTest.after(() => {
  library?.close();
});

const lib = (): ffi.FFILibrary => {
  if (library === undefined) {
    throw new Error("the native library did not load");
  }

  return library;
};

// The ports an application wires: the caller of fromNative and the runner of
// the Go engine, both on the loaded library.
const caller: workflows.NativeCaller = (call) =>
  nativeFunctions.callFunction(lib(), call);

const runner: workflows.GoWorkflowRunner = async (request, signal) =>
  (await lib().call("workflowRun", request, {
    signal,
  })) as workflows.GoWorkflowAnswer;

const GO_MANIFEST = [
  "workflows:",
  "  - id: inner",
  "    on: [inner]",
  "    steps:",
  "      - validate-eof",
  "",
].join("\n");

const withTree = async (
  files: Readonly<Record<string, string>>,
  body: (root: string) => Promise<void>,
): Promise<void> => {
  const root = await runtime.fs.makeTempDir({ prefix: "workflows-native-" });

  try {
    for (const [name, content] of Object.entries(files)) {
      // Files are written one after another into the same tree.
      // oxlint-disable-next-line no-await-in-loop
      await runtime.fs.writeTextFile(runtime.path.join(root, name), content);
    }

    await body(root);
  } finally {
    await runtime.fs.remove(root, { recursive: true });
  }
};

nodeTest.test(
  "a workflow runs a TypeScript function, a native function and a Go workflow",
  async () => {
    await withTree(
      { "a.txt": "no newline at the end", "b.txt": "fine\n" },
      async (root) => {
        const tools = workflows.createRegistry();
        tools.register(
          workflows.createHandlerTool("ts-count", "Counts in TypeScript", () =>
            functions.task.succeed({ passed: true, stats: { counted: 3 } }),
          ),
        );
        tools.register(workflows.createNativeFunctionTool(caller));
        tools.register(workflows.createGoWorkflowTool(runner));

        const workflow = workflows
          .createWorkflow("outer")
          .on("check")
          .step("ts-count")
          .step("native-function", { function: "validate-eof" })
          .step("go-workflow", { workflow: "inner", manifest: GO_MANIFEST })
          .build();

        const run = await functions.task.runTask(
          workflows.runWorkflow(workflow, tools, { root }),
        );

        assert.assertEquals(results.isOk(run), true);

        const outcome = results.isOk(run) ? run.value : undefined;
        const [tsStep, nativeStep, goStep] = outcome?.steps ?? [];

        assert.assertEquals(outcome?.passed, false);
        assert.assertEquals(
          outcome?.steps.map((step) => step.name),
          ["ts-count", "validate-eof", "go-workflow"],
        );

        assert.assertEquals(tsStep?.passed, true);
        assert.assertEquals(tsStep?.stats, { counted: 3 });

        assert.assertEquals(nativeStep?.passed, false);
        assert.assertEquals(nativeStep?.issues.length, 1);
        assert.assertEquals(
          nativeStep?.issues[0]?.message.endsWith(
            "a.txt: file does not end with a newline",
          ),
          true,
        );

        // The Go engine found the same problem and the step brought it back.
        assert.assertEquals(goStep?.passed, false);
        assert.assertEquals(goStep?.stats["steps"], 1);
        assert.assertEquals(goStep?.stats["failedSteps"], 1);
        assert.assertEquals(
          goStep?.issues[0]?.message,
          `[validate-eof] ${nativeStep?.issues[0]?.message ?? ""}`,
        );
      },
    );
  },
);

nodeTest.test(
  "a native function runs under its own name through createNativeFunctionTools",
  async () => {
    await withTree({ "ok.txt": "fine\n" }, async (root) => {
      const tools = workflows.createRegistry();
      tools.registerAll(
        workflows.createNativeFunctionTools(
          caller,
          nativeFunctions
            .listFunctions(lib())
            .filter((descriptor) => descriptor.name === "validate-eof"),
        ),
      );

      const workflow = workflows
        .createWorkflow("named")
        .on("check")
        .step("validate-eof")
        .build();

      const run = await functions.task.runTask(
        workflows.runWorkflow(workflow, tools, { root }),
      );

      assert.assertEquals(
        results.isOk(run) ? run.value.passed : undefined,
        true,
      );
      assert.assertEquals(
        results.isOk(run) ? run.value.steps[0]?.name : undefined,
        "validate-eof",
      );
    });
  },
);

nodeTest.test(
  "a Go workflow that the Go engine cannot find fails the step",
  async () => {
    const tools = workflows.createRegistry();
    tools.register(workflows.createGoWorkflowTool(runner));

    const workflow = workflows
      .createWorkflow("outer")
      .on("check")
      .step("go-workflow", { workflow: "missing", manifest: GO_MANIFEST })
      .build();

    const run = await functions.task.runTask(
      workflows.runWorkflow(workflow, tools, {}),
    );

    assert.assertEquals(results.isFail(run), true);
  },
);

// --- workflow-steps: the first function that streams ---

// The port of fromNativeStream. That this assigns is the check that
// FunctionStreamCaller of @eserstack/ajan and NativeStreamCaller of
// @eserstack/functions have the same shape.
const streamCaller: functions.native.NativeStreamCaller = (call) =>
  nativeFunctions.streamFunction(lib(), call);

const live = (): functions.task.Cancellable => ({
  signal: new AbortController().signal,
});

const watchSteps =
  functions.native.fromNativeStreamOf<workflowTypes.NativeFunctions>(
    streamCaller,
  )("workflow-steps");

const TWO_SHELL_STEPS = [
  "workflows:",
  "  - id: check",
  "    on: [precommit]",
  "    steps:",
  "      - shell:",
  "          name: first",
  "          command: echo one",
  "      - shell:",
  "          name: second",
  "          command: echo two",
  "",
].join("\n");

nodeTest.test(
  "workflow-steps answers each step of a Go workflow as it ends",
  async () => {
    await withTree({ "a.txt": "no newline at the end" }, async (root) => {
      const items: Array<
        results.Result<workflowTypes.WorkflowStepsOutput, unknown>
      > = [];

      for await (const item of watchSteps(
        { manifest: GO_MANIFEST, workflow: "inner", root },
        live(),
      )) {
        items.push(item);
      }

      assert.assertEquals(items.length, 1);

      const step = results.isOk(items[0]!) ? items[0].value : undefined;

      assert.assertEquals(step?.name, "validate-eof");
      assert.assertEquals(step?.passed, false);
      assert.assertEquals(
        step?.issues?.[0]?.message.endsWith(
          "a.txt: file does not end with a newline",
        ),
        true,
      );
    });
  },
);

nodeTest.test(
  "workflow-steps answers the steps in the order they run",
  async () => {
    const names: string[] = [];

    for await (const item of watchSteps(
      { manifest: TWO_SHELL_STEPS, workflow: "check", root: "." },
      live(),
    )) {
      names.push(results.isOk(item) ? item.value.name : "error");
    }

    assert.assertEquals(names, ["first", "second"]);
  },
);

nodeTest.test(
  "a reader that stops after one step stops the Go run",
  async () => {
    await withTree({}, async (root) => {
      const manifest = TWO_SHELL_STEPS.replace(
        "command: echo two",
        "command: touch second-ran",
      );
      let seen = 0;

      for await (const item of watchSteps(
        { manifest, workflow: "check", root },
        live(),
      )) {
        assert.assertEquals(results.isOk(item), true);
        seen += 1;

        break;
      }

      // The close waited for the run, so nothing starts after the loop.
      await new Promise((resolve) => setTimeout(resolve, 300));

      assert.assertEquals(seen, 1);
      assert.assertEquals(
        await runtime.fs.exists(runtime.path.join(root, "second-ran")),
        false,
      );
    });
  },
);

nodeTest.test(
  "a workflow the manifest lacks is one ValidationError",
  async () => {
    const items = [];

    for await (const item of watchSteps(
      { manifest: TWO_SHELL_STEPS, workflow: "missing", root: "." },
      live(),
    )) {
      items.push(item);
    }

    assert.assertEquals(items.length, 1);
    assert.assertEquals(
      results.isFail(items[0]!) ? items[0].error._tag : undefined,
      "ValidationError",
    );
  },
);

nodeTest.test(
  "a signal that aborts ends a long step with an AbortError",
  async () => {
    const controller = new AbortController();
    const manifest = TWO_SHELL_STEPS.replace("echo one", "sleep 30");
    const started = Date.now();
    const items = [];

    setTimeout(() => controller.abort(new Error("stop")), 300);

    for await (const item of watchSteps(
      { manifest, workflow: "check", root: "." },
      { signal: controller.signal },
    )) {
      items.push(item);
    }

    assert.assertEquals(Date.now() - started < 10_000, true);

    const last = items.at(-1);

    assert.assertEquals(
      last !== undefined && results.isFail(last) ? last.error._tag : undefined,
      "AbortError",
    );
  },
);
