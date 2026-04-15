// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Shebang checker — placeholder for future shebang/executable validation.
 *
 * The previous check flagged any non-.ts/.js file with a shebang, which
 * produced false positives for shell scripts and other scripting languages.
 * That check was removed. Cross-platform exec-bit checking is not currently
 * implemented.
 *
 * @module
 */

import * as standards from "@eserstack/standards";
import { createFileTool, type FileTool } from "./file-tool.ts";

export const tool: FileTool = createFileTool({
  name: "validate-shebangs",
  description: "Validate shebang/executable consistency",
  canFix: false,
  stacks: [],
  defaults: {},

  checkFile(_file, _content) {
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
