// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as task from "@eserstack/functions/task";
import * as results from "@eserstack/primitives/results";
import * as shellExec from "@eserstack/shell/exec";
import * as crossRuntime from "@eserstack/standards/cross-runtime";
import type { WorkflowToolContext } from "./types.ts";
import * as engine from "./engine.ts";
import * as registry from "./registry.ts";
import * as shellTool from "./shell-tool.ts";

const { runtime } = crossRuntime;

// The shell tool runs its command with `sh -c`.
const isWindows = crossRuntime.getPlatform() === "windows";

const contextFor = (timeoutMs: number): WorkflowToolContext => ({
  timeoutMs,
  signal: new AbortController().signal,
});

// kill -0 sends no signal: it exits 0 only while the process exists.
const isRunning = async (pid: string): Promise<boolean> =>
  await shellExec.exec`kill -0 ${pid}`.code() === 0;

// Runs `fn` with a fresh temporary directory and removes it afterwards.
const withTempDir = async (
  fn: (dir: string) => Promise<void>,
): Promise<void> => {
  const dir = await runtime.fs.makeTempDir({ prefix: "eser-shell-tool-" });

  try {
    await fn(dir);
  } finally {
    await runtime.fs.remove(dir, { recursive: true });
  }
};

// A command that writes its pid to `pidFile`, then becomes `sleep 30` under
// the same pid, so the pid in the file is the process the tool started.
const sleeperCommand = (pidFile: string): string =>
  `echo $$ > '${pidFile}'; exec sleep 30`;

// Reads the pid the sleeper wrote, and kills it if the test left it running.
const readPidAndCleanUp = async (
  pidFile: string,
): Promise<{ readonly pid: string; readonly wasRunning: boolean }> => {
  const pid = (await runtime.fs.readTextFile(pidFile)).trim();
  const wasRunning = await isRunning(pid);

  if (wasRunning) {
    await shellExec.exec`kill -9 ${pid}`.code();
  }

  return { pid, wasRunning };
};

Deno.test({
  name: "shellTool passes when the command exits 0",
  ignore: isWindows,
  fn: async () => {
    const result = await shellTool.shellTool.run(
      { command: "true", name: "noop" },
      contextFor(10_000),
    );

    assert.assertEquals(result, {
      name: "noop",
      passed: true,
      issues: [],
      mutations: [],
      stats: { exitCode: 0 },
    });
  },
});

Deno.test({
  name: "shellTool fails with the command's output when it exits non-zero",
  ignore: isWindows,
  fn: async () => {
    const result = await shellTool.shellTool.run(
      { command: "echo out; echo err >&2; exit 3" },
      contextFor(10_000),
    );

    assert.assertEquals(result.passed, false);
    assert.assertEquals(result.issues, [{ message: "out\nerr" }]);
    assert.assertEquals(result.stats, { exitCode: 3 });
  },
});

const commandChoices = [
  {
    name: "runs command without --fix",
    options: { fix: false, dryRun: false },
    ran: "check",
  },
  {
    name: "runs fixCommand with --fix",
    options: { fix: true, dryRun: false },
    ran: "fix",
  },
  {
    name: "runs command with --fix --dry-run, since fixCommand writes files",
    options: { fix: true, dryRun: true },
    ran: "check",
  },
];

for (const { name, options, ran } of commandChoices) {
  Deno.test({
    name: `shellTool ${name}`,
    ignore: isWindows,
    fn: async () => {
      const result = await shellTool.shellTool.run(
        {
          command: "echo check; exit 1",
          fixCommand: "echo fix; exit 1",
          ...options,
        },
        contextFor(10_000),
      );

      assert.assertEquals(result.issues, [{ message: ran }]);
    },
  });
}

Deno.test({
  name: "shellTool resolves workingDirectory against root",
  ignore: isWindows,
  fn: () =>
    withTempDir(async (root) => {
      await runtime.fs.mkdir(runtime.path.join(root, "sub"));
      await runtime.fs.writeTextFile(
        runtime.path.join(root, "sub", "marker"),
        "in sub",
      );

      const result = await shellTool.shellTool.run(
        { command: "cat marker; exit 1", root, workingDirectory: "sub" },
        contextFor(10_000),
      );

      assert.assertEquals(result.issues, [{ message: "in sub" }]);
    }),
});

Deno.test("shellTool rejects a step without a command", async () => {
  await assert.assertRejects(
    () => shellTool.shellTool.run({}, contextFor(10_000)),
    Error,
    "Shell tool requires a 'command' option",
  );
});

Deno.test({
  name: "shellTool stops the command at the step's time limit",
  ignore: isWindows,
  fn: () =>
    withTempDir(async (dir) => {
      const pidFile = runtime.path.join(dir, "pid");

      await assert.assertRejects(
        () =>
          shellTool.shellTool.run(
            { command: sleeperCommand(pidFile) },
            contextFor(300),
          ),
        shellExec.CommandRunError,
      );

      const { pid, wasRunning } = await readPidAndCleanUp(pidFile);
      assert.assertFalse(
        wasRunning,
        `the command (pid ${pid}) is still running after its time limit`,
      );
    }),
});

// TASK-105: a shell step that runs past its timeout used to fail while its
// `sh -c` child kept running, for the rest of the run and after it.
Deno.test({
  name: "a shell step that sleeps past its timeout fails and its command ends",
  ignore: isWindows,
  fn: () =>
    withTempDir(async (dir) => {
      const pidFile = runtime.path.join(dir, "pid");
      const toolRegistry = registry.createRegistry();
      toolRegistry.register(shellTool.shellTool);

      const taskResult = await task.runTask(
        engine.runWorkflow(
          {
            id: "sleepy",
            on: ["test"],
            steps: [{
              shell: {
                name: "sleeper",
                command: sleeperCommand(pidFile),
                timeout: 0.5,
                continueOnError: true,
              },
            }],
          },
          toolRegistry,
          { root: dir },
        ),
      );

      const { pid, wasRunning } = await readPidAndCleanUp(pidFile);

      assert.assert(results.isOk(taskResult));
      const [step] = taskResult.value.steps;
      assert.assertEquals(step?.passed, false);
      assert.assertStringIncludes(
        step?.issues[0]?.message ?? "",
        "Step 'sleeper' (shell) ran past its 0.5s timeout",
      );
      assert.assertFalse(
        wasRunning,
        `the step's command (pid ${pid}) is still running after the step ` +
          `timed out`,
      );
    }),
});
