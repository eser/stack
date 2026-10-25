// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Workflow execution engine.
 *
 * Pure functions that run workflow pipelines. The engine itself performs
 * no I/O — mutations are returned in results and the caller decides
 * whether to apply them (via the `onMutations` callback).
 *
 * Uses `@eserstack/functions/task` for lazy composition and result-based
 * error recovery.
 *
 * ```
 * runWorkflow(workflow, registry, options)
 *   │
 *   ├─ For each step:
 *   │   ├─ resolveStep() → { name, options, continueOnError, timeout }
 *   │   ├─ Lookup tool in registry
 *   │   ├─ Merge step options + run options
 *   │   ├─ Run tool with { timeoutMs, signal }; on timeout abort the signal,
 *   │   │  give the tool STOP_GRACE_MS to stop, and fail the step
 *   │   ├─ On error: if continueOnError → failed step; else propagate error
 *   │   ├─ Call onMutations() if mutations produced
 *   │   └─ Call onStepEnd()
 *   │
 *   └─ Return aggregate WorkflowResult
 *
 * resolveIncludes(workflow, allWorkflows)
 *   ├─ For each included id, find in allWorkflows
 *   ├─ Prepend their steps to current workflow's steps
 *   ├─ Track visited ids → detect circular includes → throw
 *   └─ Return flattened WorkflowDefinition
 * ```
 *
 * @module
 */

import * as task from "@eserstack/functions/task";
import * as results from "@eserstack/primitives/results";
import type { Registry } from "./registry.ts";
import type {
  ResolvedStep,
  RunOptions,
  StepResult,
  WorkflowDefinition,
  WorkflowError,
  WorkflowResult,
  WorkflowsConfig,
  WorkflowStepConfig,
  WorkflowTool,
  WorkflowToolResult,
} from "./types.ts";

/** How long a step that sets no `timeout` may run: 60 seconds. */
const DEFAULT_STEP_TIMEOUT_MS = 60_000;

/**
 * The longest step timeout, in milliseconds (about 24.8 days): the longest
 * delay a timer holds. A larger delay fires at once.
 */
const MAX_TIMEOUT_MS = 2_147_483_647;

/** {@link MAX_TIMEOUT_MS} in whole seconds, the unit of the step option. */
const MAX_TIMEOUT_SECONDS = Math.floor(MAX_TIMEOUT_MS / 1000);

/**
 * How long the engine waits, after a step timed out, for its tool to stop the
 * work it started before the run goes on without it. Five seconds, as long as
 * the Go bridge waits for a killed command (processfx `DefaultWaitDelay`).
 */
const STOP_GRACE_MS = 5_000;

const TIMED_OUT = Symbol("timed out");

/**
 * Create a WorkflowError value.
 */
const workflowError = (message: string): WorkflowError => ({
  _tag: "WorkflowError",
  message,
});

/**
 * Join names for an error message, or "(none)" when there are none.
 */
const joinOrNone = (names: readonly string[], separator: string): string =>
  names.length > 0 ? names.join(separator) : "(none)";

/**
 * Convert a step's `timeout` option, in seconds, to milliseconds.
 *
 * @throws {Error} When the value is not a number of seconds above 0 and at
 *   most {@link MAX_TIMEOUT_SECONDS}
 */
const parseStepTimeout = (stepName: string, value: unknown): number => {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value <= 0 ||
    value > MAX_TIMEOUT_SECONDS
  ) {
    throw new Error(
      `Invalid step config for '${stepName}': timeout must be a number of ` +
        `seconds above 0 and at most ${MAX_TIMEOUT_SECONDS} (about 24.8 ` +
        `days), such as 120; got ${JSON.stringify(value)}`,
    );
  }

  return value * 1000;
};

/**
 * Name a step in a message. Every shell step runs the `shell` tool, so a step
 * with a `name` option is named by it too: `'deno-tests' (shell)`.
 */
const describeStep = (step: ResolvedStep): string => {
  const displayName = step.options["name"];

  return typeof displayName === "string" && displayName !== step.name
    ? `'${displayName}' (${step.name})`
    : `'${step.name}'`;
};

/**
 * Settle with `promise`, or with {@link TIMED_OUT} once `ms` have passed,
 * whichever comes first. The timer is cleared either way.
 */
const settleWithin = async <T>(
  promise: Promise<T>,
  ms: number,
): Promise<T | typeof TIMED_OUT> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), ms);
  });

  try {
    return await Promise.race([promise, deadline]);
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Run one step's tool within the step's time limit.
 *
 * The tool gets the limit and a signal. When the limit passes, the signal
 * aborts and the step fails with a timeout, but first the tool gets
 * {@link STOP_GRACE_MS} to stop what it started. The shell tool stops its
 * command at the same limit, so the command is gone before the next step
 * starts or the process exits. The signal also aborts when the tool returns.
 *
 * @param step - The step, named in the timeout message
 * @param startedAt - `performance.now()` when the step started
 */
const runStepTool = async (
  tool: WorkflowTool,
  toolOptions: Record<string, unknown>,
  step: ResolvedStep,
  timeoutMs: number,
  startedAt: number,
): Promise<results.Result<WorkflowToolResult, WorkflowError>> => {
  const controller = new AbortController();
  const timeoutError = workflowError(
    `Step ${describeStep(step)} ran past its ${timeoutMs / 1000}s timeout; ` +
      `raise the step's timeout option (in seconds) to give it more time`,
  );

  // fromPromise turns a throw into a failed result, so toolRun never rejects.
  const toolRun = task.runTask(
    task.fromPromise(
      () => tool.run(toolOptions, { timeoutMs, signal: controller.signal }),
      (error) =>
        workflowError(error instanceof Error ? error.message : String(error)),
    ),
  );

  try {
    // The time left until the step's deadline; none when the tool blocked the
    // event loop past it before returning its promise.
    const outcome = await settleWithin(
      toolRun,
      Math.max(0, startedAt + timeoutMs - performance.now()),
    );

    if (outcome === TIMED_OUT) {
      controller.abort();
      await settleWithin(toolRun, STOP_GRACE_MS);

      return results.fail(timeoutError);
    }

    // A tool that applies the limit itself, as the shell tool does, fails at
    // the deadline. When it blocks the event loop meanwhile (the native bridge
    // runs a command synchronously), the timer above cannot fire first, so a
    // failure at or past the limit is reported as the step's timeout too.
    if (results.isFail(outcome) && performance.now() - startedAt >= timeoutMs) {
      return results.fail(timeoutError);
    }

    return outcome;
  } finally {
    // The step is over: work the tool started and left running stops now.
    controller.abort();
  }
};

/**
 * Parse a step config into a resolved step with name, options, and engine directives.
 *
 * Engine directives (`continueOnError`, `timeout`) are extracted from the options
 * and placed on the ResolvedStep. They are NOT passed to the tool.
 *
 * - `"fix-eof"` → `{ name: "fix-eof", options: {}, continueOnError: false }`
 * - `{ "check-json": { exclude: ["x"], timeout: 120 } }` → timeout extracted, options clean
 *
 * @throws {Error} When the record has other than one key, or its `timeout` is
 *   not a number of seconds above 0
 */
export const resolveStep = (step: WorkflowStepConfig): ResolvedStep => {
  if (typeof step === "string") {
    return { name: step, options: {}, continueOnError: false };
  }

  const entries = Object.entries(step);
  if (entries.length !== 1) {
    throw new Error(
      `Invalid step config: expected exactly one key, got ${entries.length}`,
    );
  }

  const [name, rawOptions] = entries[0]!;
  const options: Record<string, unknown> = {};
  let continueOnError = false;
  let timeout: number | undefined;

  for (const [key, value] of Object.entries(rawOptions)) {
    if (key === "continueOnError") {
      continueOnError = value === true;
    } else if (key === "timeout") {
      // The config gives seconds; the engine works in milliseconds.
      timeout = parseStepTimeout(name, value);
    } else {
      options[key] = value;
    }
  }

  return { name, options, continueOnError, timeout };
};

/**
 * Run a single workflow definition against a registry of tools.
 *
 * Returns a `Task<WorkflowResult, WorkflowError>` — the computation is
 * lazy and does not execute until `task.runTask()` is called.
 *
 * @param workflow - Workflow to run
 * @param registry - Tool registry
 * @param options - Run options
 * @returns Task wrapping the workflow execution
 */
export const runWorkflow = (
  workflow: WorkflowDefinition,
  registry: Registry,
  options: RunOptions = {},
): task.Task<WorkflowResult, WorkflowError> =>
  task.task<WorkflowResult, WorkflowError>(async () => {
    const startTime = performance.now();
    const stepResults: StepResult[] = [];
    const defaultTimeout = options.defaultTimeout ?? DEFAULT_STEP_TIMEOUT_MS;

    if (
      !Number.isFinite(defaultTimeout) ||
      defaultTimeout <= 0 ||
      defaultTimeout > MAX_TIMEOUT_MS
    ) {
      return results.fail(
        workflowError(
          `defaultTimeout ${defaultTimeout} is out of range: pass ` +
            `milliseconds above 0 and at most ${MAX_TIMEOUT_MS}, such as ` +
            `60_000, or leave it unset for 60 seconds`,
        ),
      );
    }

    for (const stepConfig of workflow.steps) {
      const resolved = resolveStep(stepConfig);

      // Filter by --only flag
      if (options.only !== undefined && resolved.name !== options.only) {
        continue;
      }

      // Resolve tool from registry
      const tool = registry.get(resolved.name);
      if (tool === undefined) {
        return results.fail(
          workflowError(
            `Unknown tool '${resolved.name}' in workflow '${workflow.id}'. ` +
              `Registered tools: ${joinOrNone(registry.names(), ", ")}`,
          ),
        );
      }

      // Merge step-level options with run-level options (engine directives already stripped)
      const mergedOptions: Record<string, unknown> = {
        ...resolved.options,
        root: options.root ?? ".",
        fix: options.fix ?? false,
        dryRun: options.dryRun ?? false,
        _args: options.args ?? [],
      };

      // Pass changed files for incremental mode
      if (options.changedFiles !== undefined) {
        mergedOptions["_changedFiles"] = options.changedFiles;
      }

      // Notify step start
      options.onStepStart?.(resolved.name);

      const stepStart = performance.now();

      // Steps run one at a time on purpose: each step sees the files the
      // previous step fixed, and a failing step stops the workflow.
      // deno-lint-ignore no-await-in-loop
      const stepTaskResult = await runStepTool(
        tool,
        mergedOptions,
        resolved,
        resolved.timeout ?? defaultTimeout,
        stepStart,
      );

      let toolResult: WorkflowToolResult;

      if (results.isOk(stepTaskResult)) {
        toolResult = stepTaskResult.value;
      } else if (resolved.continueOnError) {
        // Create a failed step result from the error
        toolResult = {
          name: resolved.name,
          passed: false,
          issues: [{ message: stepTaskResult.error.message }],
          mutations: [],
          stats: {},
        };
      } else {
        return stepTaskResult;
      }

      const durationMs = performance.now() - stepStart;

      const stepResult: StepResult = {
        ...toolResult,
        durationMs,
      };

      stepResults.push(stepResult);

      // Apply mutations between steps so subsequent tools see the fixed state
      if (
        toolResult.mutations.length > 0 &&
        options.onMutations !== undefined
      ) {
        // The next step must not start before these mutations are applied.
        // deno-lint-ignore no-await-in-loop
        await options.onMutations(toolResult.mutations);
      }

      // Notify step end
      options.onStepEnd?.(stepResult);
    }

    const totalDurationMs = performance.now() - startTime;

    return results.ok({
      workflowId: workflow.id,
      passed: stepResults.every((s) => s.passed),
      steps: stepResults,
      totalDurationMs,
    });
  });

/**
 * Resolve includes by flattening included workflow steps before the current workflow's steps.
 * Detects circular includes.
 *
 * @param workflow - Workflow with potential includes
 * @param allWorkflows - All available workflow definitions
 * @param visited - Set of visited workflow ids (for cycle detection)
 * @returns A new WorkflowDefinition with includes resolved (steps flattened)
 */
export const resolveIncludes = (
  workflow: WorkflowDefinition,
  allWorkflows: readonly WorkflowDefinition[],
  visited: ReadonlySet<string> = new Set(),
): WorkflowDefinition => {
  if (workflow.includes === undefined || workflow.includes.length === 0) {
    return workflow;
  }

  const currentVisited = new Set(visited);
  currentVisited.add(workflow.id);

  const prependedSteps: WorkflowStepConfig[] = [];

  for (const includeId of workflow.includes) {
    if (currentVisited.has(includeId)) {
      throw new Error(
        `Circular include detected: workflow '${workflow.id}' includes '${includeId}' ` +
          `which is already in the include chain: ${[...currentVisited].join(
            " → ",
          )}`,
      );
    }

    const included = allWorkflows.find((w) => w.id === includeId);
    if (included === undefined) {
      throw new Error(
        `Workflow '${workflow.id}' includes '${includeId}' but no workflow with that id exists. ` +
          `Available: ${joinOrNone(
            allWorkflows.map((w) => w.id),
            ", ",
          )}`,
      );
    }

    // Recursively resolve includes of the included workflow
    const resolved = resolveIncludes(included, allWorkflows, currentVisited);
    prependedSteps.push(...resolved.steps);
  }

  return {
    ...workflow,
    steps: [...prependedSteps, ...workflow.steps],
    includes: undefined, // Resolved — no longer needed
  };
};

/**
 * Run a workflow by id from a full config, resolving includes.
 *
 * @param workflowId - Workflow id to find and run
 * @param config - Full workflow configuration
 * @param registry - Tool registry
 * @param options - Run options
 * @returns Task wrapping the workflow execution
 */
export const runWorkflowWithConfig = (
  workflowId: string,
  config: WorkflowsConfig,
  registry: Registry,
  options: RunOptions = {},
): task.Task<WorkflowResult, WorkflowError> =>
  task.task<WorkflowResult, WorkflowError>(async () => {
    const workflow = config.workflows.find((w) => w.id === workflowId);
    if (workflow === undefined) {
      return results.fail(
        workflowError(
          `Workflow '${workflowId}' not found. ` +
            `Available: ${joinOrNone(
              config.workflows.map((w) => w.id),
              ", ",
            )}`,
        ),
      );
    }

    const resolved = resolveIncludes(workflow, config.workflows);
    return await task.runTask(runWorkflow(resolved, registry, options));
  });

/**
 * Run all workflows matching a given event, resolving includes.
 *
 * @param event - Event name to match (e.g., "precommit")
 * @param workflows - Available workflow definitions
 * @param registry - Tool registry
 * @param options - Run options
 * @returns Task wrapping an array of workflow results
 */
export const runByEvent = (
  event: string,
  workflows: readonly WorkflowDefinition[],
  registry: Registry,
  options: RunOptions = {},
): task.Task<readonly WorkflowResult[], WorkflowError> =>
  task.task<readonly WorkflowResult[], WorkflowError>(async () => {
    const matching = workflows.filter((w) => w.on.includes(event));

    if (matching.length === 0) {
      return results.fail(
        workflowError(
          `No workflows found for event '${event}'. ` +
            `Available: ${joinOrNone(
              workflows.map((w) => `${w.id} (${w.on.join(", ")})`),
              "; ",
            )}`,
        ),
      );
    }

    const workflowResults: WorkflowResult[] = [];
    for (const workflow of matching) {
      const resolved = resolveIncludes(workflow, workflows);
      // Workflows run one at a time on purpose: in fix mode they change the
      // same files, and the first failing workflow stops the run.
      // deno-lint-ignore no-await-in-loop
      const result = await task.runTask(
        runWorkflow(resolved, registry, options),
      );
      if (results.isFail(result)) return result;
      workflowResults.push(result.value);
    }

    return results.ok(workflowResults);
  });
