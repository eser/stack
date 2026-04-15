// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Tool registry — a container for workflow tools, looked up by name.
 *
 * @example
 * ```typescript
 * import * as workflows from "@eserstack/workflows";
 *
 * const registry = workflows.createRegistry();
 * registry.register({ name: "fix-eof", description: "...", run: async () => ({...}) });
 * registry.get("fix-eof");
 * ```
 *
 * @module
 */

import type { WorkflowTool } from "./types.ts";

/** A tool registry instance. */
export type Registry = {
  /** Register a single tool. */
  readonly register: (tool: WorkflowTool) => void;
  /** Register multiple tools at once. */
  readonly registerAll: (tools: readonly WorkflowTool[]) => void;
  /** Get a tool by name. */
  readonly get: (name: string) => WorkflowTool | undefined;
  /** Get all registered tools. */
  readonly getAll: () => readonly WorkflowTool[];
  /** Check if a tool is registered. */
  readonly has: (name: string) => boolean;
  /** Get all registered tool names. */
  readonly names: () => readonly string[];
};

/**
 * Create a new tool registry.
 *
 * @returns An empty Registry instance
 */
export const createRegistry = (): Registry => {
  const tools = new Map<string, WorkflowTool>();

  return {
    register: (tool) => {
      tools.set(tool.name, tool);
    },
    registerAll: (toolList) => {
      for (const tool of toolList) {
        tools.set(tool.name, tool);
      }
    },
    get: (name) => tools.get(name),
    getAll: () => [...tools.values()],
    has: (name) => tools.has(name),
    names: () => [...tools.keys()],
  };
};
