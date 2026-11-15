// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Tools that run a function as a workflow step: a TypeScript `Handler`, or a
 * function registered in Go (ADR 0011).
 *
 * The input of the function is the options of the step, the ones the manifest
 * gives and the ones the engine adds (`root`, `fix`, `dryRun`, `_args`,
 * `_changedFiles`), the same input the Go engine gives a function step. The
 * step's signal ends the function: a TypeScript handler reads it from its
 * `Cancellable` context, and a native function stops through its Go context.
 *
 * A function that answers a `ToolOutput` (`passed`, `issues`, `mutations`,
 * `stats`, the output of a Go function that declares the workflow trigger)
 * fills the result of the step. Any other function passes its step, and its
 * output is not kept: the stats of a TypeScript step hold numbers only.
 *
 * A function that fails with a `ValidationError` or an `AdaptError` fails the
 * step with its message and the run goes on. Any other failure is thrown, which
 * stops the run unless the step sets `continueOnError`.
 *
 * @module
 */

import * as native from "@eserstack/functions/native";
import type * as handler from "@eserstack/functions/handler";
import * as task from "@eserstack/functions/task";
import * as results from "@eserstack/primitives/results";
import type {
  WorkflowFileMutation,
  WorkflowIssue,
  WorkflowTool,
  WorkflowToolResult,
} from "./types.ts";

/** The error a function step fails with: the tag and the message. */
export type FunctionStepError = {
  readonly _tag: string;
  readonly message: string;
};

/**
 * A function the workflow engine runs as a step. The input is the options of
 * the step. A handler that needs the step's signal takes a `Cancellable`
 * context; one that does not takes none. `fromNative` returns the first kind.
 */
export type StepHandler =
  | handler.Handler<
      Readonly<Record<string, unknown>>,
      unknown,
      FunctionStepError,
      task.Cancellable
    >
  | handler.Handler<
      Readonly<Record<string, unknown>>,
      unknown,
      FunctionStepError,
      void
    >;

/** What a function answers to fill the result of its step. */
export type ToolOutput = {
  readonly passed: boolean;
  readonly issues?: readonly WorkflowIssue[];
  readonly mutations?: readonly WorkflowFileMutation[];
  readonly stats?: Readonly<Record<string, unknown>>;
};

const TOOL_OUTPUT_KEYS: ReadonlySet<string> = new Set([
  "passed",
  "issues",
  "mutations",
  "stats",
]);

const isToolOutput = (value: unknown): value is ToolOutput => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const fields = value as Readonly<Record<string, unknown>>;

  return (
    typeof fields["passed"] === "boolean" &&
    Object.keys(fields).every((key) => TOOL_OUTPUT_KEYS.has(key))
  );
};

const numbersOf = (
  stats: Readonly<Record<string, unknown>> | undefined,
): Record<string, number> =>
  Object.fromEntries(
    Object.entries(stats ?? {}).filter(
      (entry): entry is [string, number] => typeof entry[1] === "number",
    ),
  );

/**
 * Read the output of a function as the result of a step. An output that is a
 * `ToolOutput` is the result; any other output passes the step.
 *
 * ```ts
 * import * as workflows from "@eserstack/workflows/mod";
 *
 * const result = workflows.toolResultOfOutput("check", {
 *   passed: false,
 *   issues: [{ message: "a.txt: file does not end with a newline" }],
 * });
 * // { name: "check", passed: false, issues: [...], mutations: [], stats: {} }
 * ```
 */
export const toolResultOfOutput = (
  name: string,
  output: unknown,
): WorkflowToolResult =>
  isToolOutput(output)
    ? {
        name,
        passed: output.passed,
        issues: output.issues ?? [],
        mutations: output.mutations ?? [],
        stats: numbersOf(output.stats),
      }
    : { name, passed: true, issues: [], mutations: [], stats: {} };

const failedStep = (name: string, message: string): WorkflowToolResult => ({
  name,
  passed: false,
  issues: [{ message }],
  mutations: [],
  stats: {},
});

const runStepHandler = async (
  name: string,
  stepHandler: StepHandler,
  options: Readonly<Record<string, unknown>>,
  signal: AbortSignal,
): Promise<WorkflowToolResult> => {
  // A task that needs no context ignores the one it is given, so both kinds of
  // handler run with the step's signal as their context.
  const started = stepHandler(options) as task.Task<
    unknown,
    FunctionStepError,
    task.Cancellable
  >;
  const result = await started.execute({ signal });

  if (results.isOk(result)) {
    return toolResultOfOutput(name, result.value);
  }

  const { error } = result;

  if (error._tag === "ValidationError" || error._tag === "AdaptError") {
    return failedStep(name, error.message);
  }

  throw new Error(`${name}: ${error.message}`, { cause: error });
};

/**
 * Run a TypeScript `Handler` as a workflow tool.
 *
 * ```ts
 * import * as functions from "@eserstack/functions";
 * import * as workflows from "@eserstack/workflows/mod";
 *
 * const countFiles = workflows.createHandlerTool(
 *   "count-files",
 *   "Count the files a step names",
 *   (options) =>
 *     functions.task.succeed({
 *       passed: true,
 *       stats: { files: String(options["root"]).length },
 *     }),
 * );
 * ```
 *
 * @param name - The name a step uses for the tool
 * @param description - What the tool does
 * @param stepHandler - The function; its input is the options of the step
 */
export const createHandlerTool = (
  name: string,
  description: string,
  stepHandler: StepHandler,
): WorkflowTool => ({
  name,
  description,
  run: (options, context) =>
    runStepHandler(name, stepHandler, options, context.signal),
});

/** The name of the tool `createNativeFunctionTool` makes. */
export const NATIVE_FUNCTION_TOOL = "native-function";

/**
 * A tool that runs a function registered in Go, chosen by the `function`
 * option of the step. The other options are its input.
 *
 * ```yaml
 * - native-function:
 *     function: validate-eof
 *     exclude: [node_modules]
 * ```
 *
 * The caller is the port to the native library, the way `fromNative` takes it:
 * `callFunction` of `@eserstack/ajan/ffi/functions` on a loaded library. A step
 * without `function` fails with a message that says so.
 *
 * @param caller - Reaches the native library
 */
export const createNativeFunctionTool = (
  caller: native.NativeCaller,
): WorkflowTool => ({
  name: NATIVE_FUNCTION_TOOL,
  description: "Run a function registered in the native library (Go)",
  run: (options, context) => {
    const { function: functionName, ...input } = options;

    if (typeof functionName !== "string" || functionName === "") {
      return Promise.resolve(
        failedStep(
          NATIVE_FUNCTION_TOOL,
          'option "function" (string) is required: the name of the native function',
        ),
      );
    }

    return runStepHandler(
      functionName,
      native.fromNative<Readonly<Record<string, unknown>>, unknown>(
        caller,
        functionName,
      ),
      input,
      context.signal,
    );
  },
});

/** What a native function says about itself; a descriptor from the bridge has it. */
export type NativeFunctionInfo = {
  readonly name: string;
  readonly description?: string;
};

/**
 * One tool per native function, each under the function's own name, so a step
 * names it directly like it names any other tool.
 *
 * ```ts
 * import * as workflows from "@eserstack/workflows/mod";
 *
 * declare const caller: workflows.NativeCaller;
 *
 * const registry = workflows.createRegistry();
 * registry.registerAll(
 *   workflows.createNativeFunctionTools(caller, [{ name: "validate-eof" }]),
 * );
 * ```
 *
 * @param caller - Reaches the native library
 * @param functions - The functions to expose, such as the list the bridge gives
 */
export const createNativeFunctionTools = (
  caller: native.NativeCaller,
  functions: readonly NativeFunctionInfo[],
): readonly WorkflowTool[] =>
  functions.map((info) =>
    createHandlerTool(
      info.name,
      info.description ?? `Native function ${info.name}`,
      native.fromNative<Readonly<Record<string, unknown>>, unknown>(
        caller,
        info.name,
      ),
    ),
  );

export type { NativeCaller } from "@eserstack/functions/native";
