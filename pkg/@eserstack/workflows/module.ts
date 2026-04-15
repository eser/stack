// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Workflows module definition for @eserstack/shell integration.
 *
 * Tool injection is the caller's responsibility — pass tools via
 * createModuleDef() or let the CLI layer compose them.
 *
 * @module
 */

import { Module } from "@eserstack/shell/module";
import type * as types from "./types.ts";

export const createModuleDef = (
  tools?: readonly types.WorkflowTool[],
): Module =>
  new Module({
    description: "Workflow engine — run tool pipelines",
    modules: {
      run: {
        description: "Run workflows by event or id",
        load: async () => {
          const workflowsRun = await import("./run.ts");

          return {
            main: (args?: readonly string[]) =>
              workflowsRun.main(args, { tools: tools ?? [] }),
          };
        },
      },
      list: {
        description: "List available workflows and tools",
        load: async () => {
          const workflowsList = await import("./list.ts");

          return {
            main: (args?: readonly string[]) =>
              workflowsList.main(args, { tools: tools ?? [] }),
          };
        },
      },
    },
  });

// Default module with no pre-injected tools (standalone use)
export const moduleDef: Module = createModuleDef();
