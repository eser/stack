// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The tools that reach Go, for the steps of `eser workflows run` (ADR 0011).
 *
 * `native-function` runs a function registered in `pkg/ajan/functionsfx`, and
 * `go-workflow` runs a workflow of a manifest on the Go engine. The CLI is where
 * they are wired: `@eserstack/workflows` defines the tools and takes the port
 * to the native library as an argument, so it imports no library, and this
 * module is the place that says which library answers.
 *
 * Nothing here loads the library when the tools are made. Each call loads it
 * once, through the shared client, so a run whose steps never name these tools
 * never pays for it.
 *
 * @module
 */

import * as workflows from "@eserstack/workflows/mod";

/** The tools of the two names, with their ports on the shared native library. */
export const createNativeTools = (): readonly workflows.WorkflowTool[] => {
  const caller: workflows.NativeCaller = async (call) => {
    const nativeFunctions = await import("@eserstack/ajan/ffi/functions");

    return nativeFunctions.functionCaller()(call);
  };

  const runner: workflows.GoWorkflowRunner = async (request, signal) => {
    const client = await import("@eserstack/ajan/ffi/client");
    const lib = await client.requireLib();

    return (await lib.call("workflowRun", request, {
      signal,
    })) as workflows.GoWorkflowAnswer;
  };

  return [
    workflows.createNativeFunctionTool(caller),
    workflows.createGoWorkflowTool(runner),
  ];
};
