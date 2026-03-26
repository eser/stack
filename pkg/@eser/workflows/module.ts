// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Workflows module definition for @eser/shell integration.
 *
 * @module
 */

import { Module } from "@eser/shell/module";

export const moduleDef: Module = new Module({
  description: "Workflow engine — run tool pipelines",
  modules: {
    run: {
      description: "Run workflows by event or id",
      load: async () => {
        const [workflowsRun, codebaseValidation] = await Promise.all([
          import("./run.ts"),
          import("@eser/codebase/validation"),
        ]);

        const tools = codebaseValidation.getWorkflowTools();

        return {
          main: (args?: readonly string[]) =>
            workflowsRun.main(args, { tools }),
        };
      },
    },
    list: {
      description: "List available workflows and tools",
      load: async () => {
        const [workflowsList, codebaseValidation] = await Promise.all([
          import("./list.ts"),
          import("@eser/codebase/validation"),
        ]);

        const tools = codebaseValidation.getWorkflowTools();

        return {
          main: (args?: readonly string[]) =>
            workflowsList.main(args, { tools }),
        };
      },
    },
  },
});
