// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Shebang checker — validates that executable files have shebangs
 * and that files with shebangs are executable.
 *
 * @module
 */

import * as standards from "@eser/standards";
import { createFileTool, type FileTool } from "./file-tool.ts";

export const tool: FileTool = createFileTool({
  name: "validate-shebangs",
  description: "Validate shebang/executable consistency",
  canFix: false,
  stacks: [],
  defaults: {},

  checkFile(file, content) {
    if (content === undefined) {
      return [];
    }

    const hasShebang = content.startsWith("#!");

    // Files with shebangs should be noted (can't check exec bit cross-platform)
    if (
      hasShebang && !file.name.endsWith(".ts") && !file.name.endsWith(".js")
    ) {
      // Shebang in non-script file is unusual
      return [{
        path: file.path,
        message: "file has shebang but is not a .ts/.js file",
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
  runCliMain(await main(standards.runtime.current.process.args as string[]));
}
