// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Submodule checker — detects new git submodules.
 *
 * @module
 */

import * as standards from "@eser/standards";
import { runtime } from "@eser/standards/cross-runtime";
import { createFileTool, type FileTool } from "./file-tool.ts";

export const tool: FileTool = createFileTool({
  name: "validate-submodules",
  description: "Detect new git submodules",
  canFix: false,
  stacks: [],
  defaults: {},

  async checkAll(_files, options) {
    const gitmodulesPath = runtime.path.join(options.root, ".gitmodules");

    const exists = await runtime.fs.exists(gitmodulesPath);
    if (!exists) {
      return [];
    }

    const content = await runtime.fs.readTextFile(gitmodulesPath);
    const submoduleCount = (content.match(/\[submodule\s/g) ?? []).length;

    if (submoduleCount > 0) {
      return [{
        path: gitmodulesPath,
        message:
          `found ${submoduleCount} submodule(s) — submodules are not allowed`,
      }];
    }

    return [];
  },
});

export const run: FileTool["run"] = tool.run;
export const validator: FileTool["validator"] = tool.validator;
export const main: FileTool["main"] = tool.main;

if (import.meta.main) {
  const { runCliMain } = await import("./cli-support.ts");
  runCliMain(
    await main(standards.crossRuntime.runtime.process.args as string[]),
  );
}
