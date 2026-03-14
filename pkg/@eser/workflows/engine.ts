// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Workflow execution engine.
 *
 * Pure functions that run workflow pipelines. The engine itself performs
 * no I/O — mutations are returned in results and the caller decides
 * whether to apply them (via the `onMutations` callback).
 *
 * ```
 * runWorkflow(workflow, registry, options)
 *   │
 *   ├─ For each step:
 *   │   ├─ resolveStep() → { name, options, continueOnError, timeout }
 *   │   ├─ Lookup tool in registry
 *   │   ├─ Merge step options + run options
 *   │   ├─ Run tool with timeout (Promise.race)
 *   │   ├─ On error: if continueOnError → failed step; else re-throw
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

import type { Registry } from "./registry.ts";
import type {
  ResolvedStep,
  RunOptions,
  StepResult,
  WorkflowDefinition,
  WorkflowResult,
  WorkflowsConfig,
  WorkflowStepConfig,
  WorkflowToolResult,
} from "./types.ts";

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
 * Run a tool with a timeout. Returns the tool result or throws on timeout.
 * Properly clears the timer to avoid resource leaks.
 */
const runWithTimeout = async (
  toolRun: Promise<WorkflowToolResult>,
  timeoutMs: number,
  stepName: string,
): Promise<WorkflowToolResult> => {
  let timerId: ReturnType<typeof setTimeout>;

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timerId = setTimeout(() => {
      reject(
        new Error(
          `Step '${stepName}' timed out after ${
            (timeoutMs / 1000).toFixed(0)
          }s`,
        ),
      );
    }, timeoutMs);
  });

  try {
    return await Promise.race([toolRun, timeoutPromise]);
  } finally {
    clearTimeout(timerId!);
  }
};

/**
 * Run a single workflow definition against a registry of tools.
 *
 * @param workflow - Workflow to run
 * @param registry - Tool registry
 * @param options - Run options
 * @returns Workflow execution result
 */
export const runWorkflow = async (
  workflow: WorkflowDefinition,
  registry: Registry,
  options: RunOptions = {},
): Promise<WorkflowResult> => {
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
      throw new Error(
        `Unknown tool '${resolved.name}' in workflow '${workflow.id}'. ` +
          `Registered tools: ${registry.names().join(", ") || "(none)"}`,
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
    let toolResult: WorkflowToolResult;

    try {
      const timeoutMs = resolved.timeout ?? defaultTimeout;
      toolResult = await runWithTimeout(
        tool.run(mergedOptions),
        timeoutMs,
        resolved.name,
      );
    } catch (error) {
      if (resolved.continueOnError) {
        // Create a failed step result from the error
        toolResult = {
          name: resolved.name,
          passed: false,
          issues: [{
            message: error instanceof Error ? error.message : String(error),
          }],
          mutations: [],
          stats: {},
        };
      } else {
        throw error;
      }
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

  return {
    workflowId: workflow.id,
    passed: stepResults.every((s) => s.passed),
    steps: stepResults,
    totalDurationMs,
  };
};

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
 * @returns Workflow execution result
 */
export const runWorkflowWithConfig = async (
  workflowId: string,
  config: WorkflowsConfig,
  registry: Registry,
  options: RunOptions = {},
): Promise<WorkflowResult> => {
  const workflow = config.workflows.find((w) => w.id === workflowId);
  if (workflow === undefined) {
    throw new Error(
      `Workflow '${workflowId}' not found. ` +
        `Available: ${
          config.workflows.map((w) => w.id).join(", ") || "(none)"
        }`,
    );
  }

  const resolved = resolveIncludes(workflow, config.workflows);
  return await runWorkflow(resolved, registry, options);
};

/**
 * Run all workflows matching a given event, resolving includes.
 *
 * @param event - Event name to match (e.g., "precommit")
 * @param workflows - Available workflow definitions
 * @param registry - Tool registry
 * @param options - Run options
 * @returns Array of workflow results
 */
export const runByEvent = async (
  event: string,
  workflows: readonly WorkflowDefinition[],
  registry: Registry,
  options: RunOptions = {},
): Promise<readonly WorkflowResult[]> => {
  const matching = workflows.filter((w) => w.on.includes(event));

  if (matching.length === 0) {
    throw new Error(
      `No workflows found for event '${event}'. ` +
        `Available: ${
          workflows.map((w) => `${w.id} (${w.on.join(", ")})`).join("; ") ||
          "(none)"
        }`,
    );
  }

  const results: WorkflowResult[] = [];
  for (const workflow of matching) {
    const resolved = resolveIncludes(workflow, workflows);
    const result = await runWorkflow(resolved, registry, options);
    results.push(result);
  }

  return results;
};
