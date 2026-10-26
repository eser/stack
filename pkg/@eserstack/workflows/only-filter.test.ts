// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// RunOptions.only selects a shell step by its name as well as a tool by its
// name, and a filter that selects no step is an error (TASK-363). The Go
// engine's only_filter_test.go (pkg/ajan/workflowfx) checks the same cases.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as task from "@eserstack/functions/task";
import * as results from "@eserstack/primitives/results";
import type { WorkflowsConfig, WorkflowTool } from "./types.ts";
import * as engine from "./engine.ts";
import * as registry from "./registry.ts";

const config: WorkflowsConfig = {
  workflows: [
    {
      id: "ci",
      on: ["precommit"],
      steps: [
        "probe",
        { shell: { name: "first", command: "echo first" } },
        { shell: { name: "second", command: "echo second" } },
      ],
    },
  ],
};

// A probe tool and a stand-in for the shell tool; each records the name of
// every step it runs.
const recordingRegistry = (ran: string[]): registry.Registry => {
  const recorder = (name: string): WorkflowTool => ({
    name,
    description: `records ${name}`,
    run: (options) => {
      const stepName = (options["name"] as string | undefined) ?? name;
      ran.push(stepName);

      return Promise.resolve({
        name: stepName,
        passed: true,
        issues: [],
        mutations: [],
        stats: {},
      });
    },
  });

  const reg = registry.createRegistry();
  reg.registerAll([recorder("probe"), recorder("shell")]);

  return reg;
};

const cases = [
  { only: "second", want: ["second"] },
  { only: "first", want: ["first"] },
  { only: "probe", want: ["probe"] },
  { only: "shell", want: ["first", "second"] },
] as const;

for (const { only, want } of cases) {
  nodeTest.test(`--only ${only} runs ${want.join(" and ")}`, async () => {
    const ran: string[] = [];
    const taskResult = await task.runTask(
      engine.runByEvent("precommit", config.workflows, recordingRegistry(ran), {
        only,
      }),
    );

    assert.assert(results.isOk(taskResult));
    assert.assertEquals(ran, [...want]);
  });
}

nodeTest.test(
  "runByEvent fails and names the filter when --only selects no step",
  async () => {
    const ran: string[] = [];
    const taskResult = await task.runTask(
      engine.runByEvent("precommit", config.workflows, recordingRegistry(ran), {
        only: "go-lint",
      }),
    );

    assert.assert(results.isFail(taskResult));
    assert.assertStringIncludes(taskResult.error.message, "'go-lint'");
    assert.assertStringIncludes(
      taskResult.error.message,
      "probe, first, second",
    );
    assert.assertEquals(ran, []);
  },
);

nodeTest.test(
  "runWorkflowWithConfig fails and names the filter when --only selects no step",
  async () => {
    const ran: string[] = [];
    const taskResult = await task.runTask(
      engine.runWorkflowWithConfig("ci", config, recordingRegistry(ran), {
        only: "go-lint",
      }),
    );

    assert.assert(results.isFail(taskResult));
    assert.assertStringIncludes(taskResult.error.message, "'go-lint'");
    assert.assertEquals(ran, []);
  },
);

nodeTest.test(
  "runByEvent accepts a filter that only a later workflow's step matches",
  async () => {
    const ran: string[] = [];
    const workflows = [
      ...config.workflows,
      {
        id: "lint",
        on: ["precommit"],
        steps: [{ shell: { name: "go-lint", command: "echo lint" } }],
      },
    ];
    const taskResult = await task.runTask(
      engine.runByEvent("precommit", workflows, recordingRegistry(ran), {
        only: "go-lint",
      }),
    );

    assert.assert(results.isOk(taskResult));
    assert.assertEquals(ran, ["go-lint"]);
  },
);
