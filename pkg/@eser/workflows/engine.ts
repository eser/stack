// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Workflow execution engine.
 *
 * Pure functions that run workflow pipelines. The engine itself performs
 * no I/O — mutations are returned in results and the caller decides
 * whether to apply them (via the `onMutations` callback).
 *
 * Uses `@eser/functions/task` for lazy composition, timeout handling,
 * and result-based error recovery.
 *
 * ```
 * runWorkflow(workflow, registry, options)
 *   │
 *   ├─ For each step:
 *   │   ├─ resolveStep() → { name, options, continueOnError, timeout }
 *   │   ├─ Lookup tool in registry
 *   │   ├─ Merge step options + run options
 *   │   ├─ Run tool via task.withTimeout()
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

import * as task from "@eser/functions/task";
import * as results from "@eser/primitives/results";
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
  WorkflowToolResult,
} from "./types.ts";

/**
 * Create a WorkflowError value.
 */
const workflowError = (message: string): WorkflowError => ({
  _tag: "WorkflowError",
  message,
});

/**
 * Parse a step config into a resolved step with name, options, and engine directives.
 *
 * Engine directives (`continueOnError`, `timeout`) are extracted from the options
 * and placed on the ResolvedStep. They are NOT passed to the tool.
 *
 * - `"fix-eof"` → `{ name: "fix-eof", options: {}, continueOnError: false }`
 * - `{ "check-json": { exclude: ["x"], timeout: 120 } }` → timeout extracted, options clean
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
      // YAML timeout is in seconds, engine uses milliseconds
      timeout = (value as number) * 1000;
    } else {
      options[key] = value;
    }
  }

  return { name, options, continueOnError, timeout };
};

/**
 * Create a Task that runs a single tool step with timeout.
 * Returns a Task<WorkflowToolResult, WorkflowError, void>.
 */
const createStepTask = (
  toolRun: () => Promise<WorkflowToolResult>,
  timeoutMs: number,
  stepName: string,
): task.Task<WorkflowToolResult, WorkflowError> =>
  task.withTimeout(
    task.fromPromise(
      toolRun,
      (error) =>
        workflowError(
          error instanceof Error ? error.message : String(error),
        ),
    ),
    timeoutMs,
    workflowError(
      `Step '${stepName}' timed out after ${(timeoutMs / 1000).toFixed(0)}s`,
    ),
  );

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
    const defaultTimeout = options.defaultTimeout ?? 60_000;

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
              `Registered tools: ${registry.names().join(", ") || "(none)"}`,
          ),
        );
      }

      // Merge step-level options with run-level options (engine directives already stripped)
      const mergedOptions: Record<string, unknown> = {
        ...resolved.options,
        root: options.root ?? ".",
        fix: options.fix ?? false,
        _args: options.args ?? [],
      };

      // Pass changed files for incremental mode
      if (options.changedFiles !== undefined) {
        mergedOptions["_changedFiles"] = options.changedFiles;
      }

      // Notify step start
      options.onStepStart?.(resolved.name);

      const stepStart = performance.now();
      const timeoutMs = resolved.timeout ?? defaultTimeout;
      const stepTask = createStepTask(
        () => tool.run(mergedOptions),
        timeoutMs,
        resolved.name,
      );

      const stepTaskResult = await task.runTask(stepTask);

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
        toolResult.mutations.length > 0 && options.onMutations !== undefined
      ) {
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
  if (
    workflow.includes === undefined || workflow.includes.length === 0
  ) {
    return workflow;
  }

  const currentVisited = new Set(visited);
  currentVisited.add(workflow.id);

  const prependedSteps: WorkflowStepConfig[] = [];

  for (const includeId of workflow.includes) {
    if (currentVisited.has(includeId)) {
      throw new Error(
        `Circular include detected: workflow '${workflow.id}' includes '${includeId}' ` +
          `which is already in the include chain: ${
            [...currentVisited].join(" → ")
          }`,
      );
    }

    const included = allWorkflows.find((w) => w.id === includeId);
    if (included === undefined) {
      throw new Error(
        `Workflow '${workflow.id}' includes '${includeId}' but no workflow with that id exists. ` +
          `Available: ${allWorkflows.map((w) => w.id).join(", ") || "(none)"}`,
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
            `Available: ${
              config.workflows.map((w) => w.id).join(", ") || "(none)"
            }`,
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
            `Available: ${
              workflows.map((w) => `${w.id} (${w.on.join(", ")})`).join(
                "; ",
              ) || "(none)"
            }`,
        ),
      );
    }

    const workflowResults: WorkflowResult[] = [];
    for (const workflow of matching) {
      const resolved = resolveIncludes(workflow, workflows);
      const result = await task.runTask(
        runWorkflow(resolved, registry, options),
      );
      if (results.isFail(result)) return result;
      workflowResults.push(result.value);
    }

    return results.ok(workflowResults);
  });
