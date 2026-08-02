// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Builder pattern for constructing workflow definitions programmatically.
 *
 * @example
 * ```typescript
 * import * as workflows from "@eserstack/workflows";
 *
 * const workflow = workflows.createWorkflow("default")
 *   .on("precommit", "prepush")
 *   .step("fix-eof")
 *   .step("check-json", { exclude: ["tsconfig.json"] })
 *   .build();
 * ```
 *
 * @module
 */

import type { WorkflowDefinition, WorkflowStepConfig } from "./types.ts";

type InternalStep = { name: string; options: Record<string, unknown> };

/** Fluent builder for workflow definitions. */
export type WorkflowBuilder = {
  /** Add events that trigger this workflow. */
  readonly on: (...events: string[]) => WorkflowBuilder;
  /** Add a step (tool name, optionally with config). */
  readonly step: (
    name: string,
    options?: Record<string, unknown>,
  ) => WorkflowBuilder;
  /** Mark the last step as bypass — skip tool execution; output = previous step's stats. */
  readonly bypass: () => WorkflowBuilder;
  /** Set a JSON Schema (draft-2020-12) that validates the last step's merged options before tool.run(). */
  readonly inputSchema: (schema: Record<string, unknown>) => WorkflowBuilder;
  /** Build the immutable WorkflowDefinition. */
  readonly build: () => WorkflowDefinition;
};

/**
 * Create a workflow builder.
 *
 * @param id - Workflow identifier
 * @returns A fluent WorkflowBuilder
 */
export const createWorkflow = (id: string): WorkflowBuilder => {
  const events: string[] = [];
  const steps: InternalStep[] = [];

  const toStepConfig = (s: InternalStep): WorkflowStepConfig =>
    Object.keys(s.options).length > 0 ? { [s.name]: s.options } : s.name;

  const builder: WorkflowBuilder = {
    on: (...newEvents) => {
      events.push(...newEvents);
      return builder;
    },
    step: (name, options) => {
      steps.push({ name, options: { ...(options ?? {}) } });
      return builder;
    },
    bypass: () => {
      const last = steps[steps.length - 1];
      if (last !== undefined) {
        last.options["bypass"] = true;
      }
      return builder;
    },
    inputSchema: (schema) => {
      const last = steps[steps.length - 1];
      if (last !== undefined) {
        last.options["inputSchema"] = schema;
      }
      return builder;
    },
    build: () => ({
      id,
      on: [...events],
      steps: steps.map(toStepConfig),
    }),
  };

  return builder;
};

/**
 * Define a workflow from a plain object.
 * Validates the definition structure.
 *
 * @param definition - Workflow definition object
 * @returns Validated WorkflowDefinition
 */
export const defineWorkflow = (
  definition: WorkflowDefinition,
): WorkflowDefinition => {
  if (definition.id === undefined || definition.id.length === 0) {
    throw new Error("Workflow id is required");
  }
  if (definition.on.length === 0) {
    throw new Error(
      `Workflow '${definition.id}' must have at least one event`,
    );
  }
  if (definition.steps.length === 0) {
    throw new Error(
      `Workflow '${definition.id}' must have at least one step`,
    );
  }

  return definition;
};
