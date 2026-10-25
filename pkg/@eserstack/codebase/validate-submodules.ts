// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Submodule checker — detects new git submodules.
 *
 * @module
 */

import { runtime } from "@eserstack/standards/cross-runtime";
import * as cliSupport from "./cli-support.ts";
import * as fileTool from "./file-tool.ts";
import type { FileTool } from "./file-tool.ts";

export const tool: FileTool = fileTool.withGoValidator(
  fileTool.createFileTool({
    name: "validate-submodules",
    description: "Detect new git submodules",
    canFix: false,
    stacks: [],
    defaults: {},

    checkAll: async (_files, options) => {
      const gitmodulesPath = runtime.path.join(options.root, ".gitmodules");

      const exists = await runtime.fs.exists(gitmodulesPath);
      if (!exists) {
        return [];
      }

      const content = await runtime.fs.readTextFile(gitmodulesPath);
      const submoduleCount = (content.match(/\[submodule\s/g) ?? []).length;

      if (submoduleCount > 0) {
        return [
          {
            path: gitmodulesPath,
            message: `found ${submoduleCount} submodule(s) — submodules are not allowed`,
          },
        ];
      }

      return [];
    },
  }),
  "submodules",
);

export const run: FileTool["run"] = tool.run;
export const validator: FileTool["validator"] = tool.validator;
export const main: FileTool["main"] = tool.main;

if (import.meta.main) {
  // Entry point: the await only runs when this file is executed directly.
  // deno-lint-ignore no-top-level-await
  const result = await main(runtime.process.args as string[]);
  cliSupport.runCliMain(result);
}
