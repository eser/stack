// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Event-driven workflow engine for running tool pipelines.
 *
 * Core library — no I/O, no file loading. Compose workflows
 * programmatically with the builder, register tools into a registry,
 * and run them through the engine.
 *
 * For file-based config loading, use `@eser/workflows/loader`.
 * For CLI execution, use `@eser/workflows/run`.
 *
 * @example
 * ```typescript
 * import * as workflows from "@eser/workflows";
 *
 * // Create a registry and register tools
 * const registry = workflows.createRegistry();
 * registry.register(myTool);
 *
 * // Build a workflow
 * const workflow = workflows.createWorkflow("ci")
 *   .on("precommit")
 *   .step("my-tool", { strict: true })
 *   .build();
 *
 * // Run it
 * const result = await workflows.runWorkflow(workflow, registry, { fix: true });
 * ```
 *
 * @module
 */

// Types
export type {
  ResolvedStep,
  RunOptions,
  ScriptConfig,
  StepResult,
  WorkflowDefinition,
  WorkflowFileMutation,
  WorkflowIssue,
  WorkflowResult,
  WorkflowsConfig,
  WorkflowStepConfig,
  WorkflowTool,
  WorkflowToolResult,
} from "./types.ts";

// Registry
export type { Registry } from "./registry.ts";
export { createRegistry } from "./registry.ts";

// Builder
export type { WorkflowBuilder } from "./builder.ts";
export { createWorkflow, defineWorkflow } from "./builder.ts";

// Engine
export {
  resolveIncludes,
  resolveStep,
  runByEvent,
  runWorkflow,
  runWorkflowWithConfig,
} from "./engine.ts";

// Built-in tools
export { shellTool } from "./shell-tool.ts";
