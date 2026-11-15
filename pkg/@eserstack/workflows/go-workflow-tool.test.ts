// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as results from "@eserstack/primitives/results";
import * as task from "@eserstack/functions/task";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as builder from "./builder.ts";
import * as engine from "./engine.ts";
import * as goWorkflow from "./go-workflow-tool.ts";
import * as registry from "./registry.ts";
import type { WorkflowToolContext } from "./types.ts";

const context = (timeoutMs = 60_000): WorkflowToolContext => ({
  timeoutMs,
  signal: new AbortController().signal,
});

const MANIFEST = "workflows:\n  - id: check\n    on: [check]\n    steps: []\n";

type Sent = { request: goWorkflow.GoWorkflowRequest; signal: AbortSignal };

const runnerAnswering = (
  answer: goWorkflow.GoWorkflowAnswer,
): { runner: goWorkflow.GoWorkflowRunner; sent: Sent[] } => {
  const sent: Sent[] = [];

  return {
    sent,
    runner: (request, signal) => {
      sent.push({ request, signal });

      return Promise.resolve(answer);
    },
  };
};

const FAILED: goWorkflow.GoWorkflowAnswer = {
  results: [
    {
      id: "check",
      passed: false,
      totalDurationMs: 12,
      steps: [
        {
          name: "validate-eof",
          passed: false,
          issues: [{ message: "a.txt: file does not end with a newline" }],
          mutations: [{ path: "a.txt", oldContent: "a", newContent: "a\n" }],
        },
        { name: "validate-json", passed: true, issues: [] },
      ],
    },
  ],
};

nodeTest.test(
  "toolResultOfGoWorkflow joins the step results of the Go engine",
  () => {
    assert.assertEquals(goWorkflow.toolResultOfGoWorkflow(FAILED), {
      name: "go-workflow",
      passed: false,
      issues: [
        { message: "[validate-eof] a.txt: file does not end with a newline" },
      ],
      mutations: [{ path: "a.txt", oldContent: "a", newContent: "a\n" }],
      stats: { steps: 2, failedSteps: 1, durationMs: 12 },
    });
  },
);

nodeTest.test(
  "toolResultOfGoWorkflow passes when every workflow passed",
  () => {
    const result = goWorkflow.toolResultOfGoWorkflow({
      results: [
        {
          id: "check",
          passed: true,
          steps: [{ name: "validate-eof", passed: true }],
        },
      ],
    });

    assert.assertEquals(result.passed, true);
    assert.assertEquals(result.issues, []);
    assert.assertEquals(result.stats, {
      steps: 1,
      failedSteps: 0,
      durationMs: 0,
    });
  },
);

nodeTest.test(
  "createGoWorkflowTool sends the workflow and the options of the run to the Go engine",
  async () => {
    const { runner, sent } = runnerAnswering(FAILED);
    const tool = goWorkflow.createGoWorkflowTool(runner);

    const result = await tool.run(
      {
        workflow: "check",
        manifest: MANIFEST,
        only: "validate-eof",
        root: "/work",
        fix: true,
        dryRun: true,
        _args: ["msg.txt"],
        _changedFiles: ["a.txt"],
      },
      context(5000),
    );

    assert.assertEquals(tool.name, "go-workflow");
    assert.assertEquals(sent.length, 1);
    assert.assertEquals(sent[0]?.request, {
      manifest: MANIFEST,
      workflowId: "check",
      root: "/work",
      fix: true,
      dryRun: true,
      args: ["msg.txt"],
      changedFiles: ["a.txt"],
      only: "validate-eof",
      timeoutMs: 5000,
    });
    assert.assertEquals(result.passed, false);
    assert.assertEquals(result.issues.length, 1);
  },
);

nodeTest.test(
  "createGoWorkflowTool defaults the options the run leaves out",
  async () => {
    const { runner, sent } = runnerAnswering({ results: [] });

    await goWorkflow
      .createGoWorkflowTool(runner)
      .run({ workflow: "check", manifest: MANIFEST }, context());

    assert.assertEquals(sent[0]?.request, {
      manifest: MANIFEST,
      workflowId: "check",
      root: ".",
      fix: false,
      dryRun: false,
      args: [],
      timeoutMs: 60_000,
    });
  },
);

nodeTest.test(
  "createGoWorkflowTool gives the Go call the signal of the step",
  async () => {
    const controller = new AbortController();
    const { runner, sent } = runnerAnswering({ results: [] });

    await goWorkflow
      .createGoWorkflowTool(runner)
      .run(
        { workflow: "check", manifest: MANIFEST },
        { timeoutMs: 1000, signal: controller.signal },
      );

    assert.assertEquals(sent[0]?.signal, controller.signal);
  },
);

nodeTest.test(
  "createGoWorkflowTool reads the manifest file relative to the root",
  async () => {
    const root = await runtime.fs.makeTempDir({ prefix: "go-workflow-" });

    try {
      await runtime.fs.mkdir(runtime.path.join(root, ".eser"));
      await runtime.fs.writeTextFile(
        runtime.path.join(root, ".eser", "manifest.yml"),
        MANIFEST,
      );
      await runtime.fs.writeTextFile(
        runtime.path.join(root, "other.yml"),
        "# other\n",
      );

      const { runner, sent } = runnerAnswering({ results: [] });
      const tool = goWorkflow.createGoWorkflowTool(runner);

      await tool.run({ workflow: "check", root }, context());
      await tool.run(
        { workflow: "check", root, manifestFile: "other.yml" },
        context(),
      );

      assert.assertEquals(sent[0]?.request.manifest, MANIFEST);
      assert.assertEquals(sent[1]?.request.manifest, "# other\n");
    } finally {
      await runtime.fs.remove(root, { recursive: true });
    }
  },
);

nodeTest.test(
  "createGoWorkflowTool fails a step it cannot set up",
  async () => {
    const { runner, sent } = runnerAnswering({ results: [] });
    const tool = goWorkflow.createGoWorkflowTool(runner);

    const noWorkflow = await tool.run({ manifest: MANIFEST }, context());
    const noManifest = await tool.run(
      { workflow: "check", root: "/no/such/root" },
      context(),
    );

    assert.assertEquals(noWorkflow.passed, false);
    assert.assertEquals(
      noWorkflow.issues[0]?.message.includes('"workflow"'),
      true,
    );
    assert.assertEquals(noManifest.passed, false);
    assert.assertEquals(
      noManifest.issues[0]?.message.startsWith("cannot read the manifest"),
      true,
    );
    assert.assertEquals(sent.length, 0);
  },
);

nodeTest.test(
  "createGoWorkflowTool throws an error of the Go engine",
  async () => {
    const { runner } = runnerAnswering({ error: "workflow 'nope' not found" });

    await assert.assertRejects(
      () =>
        goWorkflow
          .createGoWorkflowTool(runner)
          .run({ workflow: "nope", manifest: MANIFEST }, context()),
      Error,
      "workflow 'nope' not found",
    );
  },
);

nodeTest.test("a workflow runs a Go workflow as one of its steps", async () => {
  const { runner } = runnerAnswering(FAILED);
  const tools = registry.createRegistry();
  tools.register(goWorkflow.createGoWorkflowTool(runner));

  const workflow = builder
    .createWorkflow("outer")
    .on("check")
    .step("go-workflow", { workflow: "check", manifest: MANIFEST })
    .build();

  const run = await task.runTask(
    engine.runWorkflow(workflow, tools, { root: "/work" }),
  );

  assert.assertEquals(results.isOk(run), true);

  const step = results.isOk(run) ? run.value.steps[0] : undefined;

  assert.assertEquals(results.isOk(run) ? run.value.passed : undefined, false);
  assert.assertEquals(step?.name, "go-workflow");
  assert.assertEquals(
    step?.issues[0]?.message.startsWith("[validate-eof]"),
    true,
  );
  assert.assertEquals(step?.stats["failedSteps"], 1);
});
