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

/** Fluent builder for workflow definitions. */
export type WorkflowBuilder = {
  /** Add events that trigger this workflow. */
  readonly on: (...events: string[]) => WorkflowBuilder;
  /** Add a step (tool name, optionally with config). */
  readonly step: (
    name: string,
    options?: Record<string, unknown>,
  ) => WorkflowBuilder;
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
  const steps: WorkflowStepConfig[] = [];

  const builder: WorkflowBuilder = {
    on: (...newEvents) => {
      events.push(...newEvents);
      return builder;
    },
    step: (name, options) => {
      if (options !== undefined && Object.keys(options).length > 0) {
        steps.push({ [name]: options });
      } else {
        steps.push(name);
      }
      return builder;
    },
    build: () => ({
      id,
      on: [...events],
      steps: [...steps],
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
