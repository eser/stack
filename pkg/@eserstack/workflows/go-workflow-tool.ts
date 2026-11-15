// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * A tool that runs a workflow on the Go engine (`pkg/ajan/workflowfx`) and
 * brings its step results back (ADR 0011).
 *
 * The TypeScript engine stays the default of `workflows run`. This tool is for
 * a workflow that wants one of its steps to be a whole Go workflow: the Go
 * engine runs the steps, with its `if`, `loop`, `includes` and the Go tools
 * and functions, and the TypeScript engine sees one step with the issues,
 * mutations and counts of all of them. Go calls Go only: a Go workflow cannot
 * call a TypeScript tool.
 *
 * ```yaml
 * - go-workflow:
 *     workflow: precommit
 *     manifestFile: .eser/manifest.yml
 * ```
 *
 * @module
 */

import { runtime } from "@eserstack/standards/cross-runtime";
import type {
  WorkflowFileMutation,
  WorkflowIssue,
  WorkflowTool,
  WorkflowToolResult,
} from "./types.ts";

/** The request of the Go engine's `workflowRun`. */
export type GoWorkflowRequest = {
  /** The text of a `.eser/manifest.yml`. */
  readonly manifest: string;
  /** The id of the workflow to run. */
  readonly workflowId: string;
  readonly root: string;
  readonly fix: boolean;
  readonly dryRun: boolean;
  readonly args: readonly string[];
  /** Absent runs every file; present runs the validators on these only. */
  readonly changedFiles?: readonly string[];
  /** Runs only the steps this names. */
  readonly only?: string;
  /** The Go engine's timeout for a step that sets none, in milliseconds. */
  readonly timeoutMs: number;
};

/** One step a Go workflow ran. */
export type GoWorkflowStep = {
  readonly name: string;
  readonly passed: boolean;
  readonly issues?: readonly WorkflowIssue[];
  readonly mutations?: readonly WorkflowFileMutation[];
  readonly stats?: Readonly<Record<string, unknown>>;
  readonly durationMs?: number;
};

/** The answer of `workflowRun`: the workflows that ran, or an error. */
export type GoWorkflowAnswer = {
  readonly error?: string;
  readonly results?: ReadonlyArray<{
    readonly id: string;
    readonly passed: boolean;
    readonly steps: readonly GoWorkflowStep[];
    readonly totalDurationMs?: number;
  }>;
};

/**
 * Runs a workflow on the Go engine: the port to the native library. On a
 * loaded `@eserstack/ajan` library it is
 * `(request, signal) => lib.call("workflowRun", request, { signal })`.
 */
export type GoWorkflowRunner = (
  request: GoWorkflowRequest,
  signal: AbortSignal,
) => Promise<GoWorkflowAnswer>;

/** The name of the tool `createGoWorkflowTool` makes. */
export const GO_WORKFLOW_TOOL = "go-workflow";

const DEFAULT_MANIFEST_FILE = ".eser/manifest.yml";

const stringOption = (
  options: Readonly<Record<string, unknown>>,
  key: string,
): string | undefined => {
  const value = options[key];

  return typeof value === "string" && value !== "" ? value : undefined;
};

const stringListOption = (
  options: Readonly<Record<string, unknown>>,
  key: string,
): readonly string[] | undefined => {
  const value = options[key];

  return Array.isArray(value) &&
    value.every((item): item is string => typeof item === "string")
    ? value
    : undefined;
};

const failed = (message: string): WorkflowToolResult => ({
  name: GO_WORKFLOW_TOOL,
  passed: false,
  issues: [{ message }],
  mutations: [],
  stats: {},
});

/**
 * Turn the answer of the Go engine into the result of one step: it passes when
 * every workflow that ran passed, the issues and mutations of every step are
 * joined (an issue's message names its step), and the stats count the steps.
 *
 * ```ts
 * import * as workflows from "@eserstack/workflows/mod";
 *
 * const result = workflows.toolResultOfGoWorkflow({
 *   results: [
 *     {
 *       id: "check",
 *       passed: false,
 *       steps: [
 *         { name: "validate-eof", passed: false, issues: [{ message: "a.txt" }] },
 *       ],
 *     },
 *   ],
 * });
 * // result.issues[0].message === "[validate-eof] a.txt"
 * ```
 */
export const toolResultOfGoWorkflow = (
  answer: GoWorkflowAnswer,
): WorkflowToolResult => {
  const workflows = answer.results ?? [];
  const steps = workflows.flatMap((workflow) => workflow.steps);

  return {
    name: GO_WORKFLOW_TOOL,
    passed: workflows.every((workflow) => workflow.passed),
    issues: steps.flatMap((step) =>
      (step.issues ?? []).map((issue) => ({
        ...issue,
        message: `[${step.name}] ${issue.message}`,
      })),
    ),
    mutations: steps.flatMap((step) => step.mutations ?? []),
    stats: {
      steps: steps.length,
      failedSteps: steps.filter((step) => !step.passed).length,
      durationMs: workflows.reduce(
        (total, workflow) => total + (workflow.totalDurationMs ?? 0),
        0,
      ),
    },
  };
};

/**
 * A tool that runs a workflow on the Go engine.
 *
 * Options:
 * - `workflow` (string, required): the id of the workflow
 * - `manifest` (string): the text of the manifest; wins over `manifestFile`
 * - `manifestFile` (string): the manifest to read, relative to `root`
 *   (default `.eser/manifest.yml`)
 * - `only` (string): run only the steps this names
 * - `root`, `fix`, `dryRun`, `_args` and `_changedFiles`: from the run, and
 *   passed on to the Go engine
 *
 * The step's timeout is the Go engine's default step timeout, and the step's
 * signal stops the call. An error the Go engine answers (an unknown workflow,
 * a manifest it cannot parse) is thrown, which stops the run unless the step
 * sets `continueOnError`.
 *
 * @param run - Runs a workflow on the Go engine
 */
export const createGoWorkflowTool = (run: GoWorkflowRunner): WorkflowTool => ({
  name: GO_WORKFLOW_TOOL,
  description:
    "Run a workflow on the Go engine and bring back its step results",
  run: async (options, context) => {
    const workflowId = stringOption(options, "workflow");

    if (workflowId === undefined) {
      return failed('option "workflow" (string) is required: the workflow id');
    }

    const root = stringOption(options, "root") ?? ".";
    let manifest = stringOption(options, "manifest");

    if (manifest === undefined) {
      const file =
        stringOption(options, "manifestFile") ?? DEFAULT_MANIFEST_FILE;
      const path = runtime.path.isAbsolute(file)
        ? file
        : runtime.path.join(root, file);

      try {
        manifest = await runtime.fs.readTextFile(path);
      } catch (cause: unknown) {
        return failed(
          `cannot read the manifest ${path}: ${
            cause instanceof Error ? cause.message : String(cause)
          }`,
        );
      }
    }

    const changedFiles = stringListOption(options, "_changedFiles");
    const only = stringOption(options, "only");

    const answer = await run(
      {
        manifest,
        workflowId,
        root,
        fix: options["fix"] === true,
        dryRun: options["dryRun"] === true,
        args: stringListOption(options, "_args") ?? [],
        ...(changedFiles === undefined ? {} : { changedFiles }),
        ...(only === undefined ? {} : { only }),
        timeoutMs: context.timeoutMs,
      },
      context.signal,
    );

    if (answer.error !== undefined && answer.error !== "") {
      throw new Error(`go-workflow ${workflowId}: ${answer.error}`);
    }

    return toolResultOfGoWorkflow(answer);
  },
});
