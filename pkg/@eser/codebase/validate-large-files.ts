// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Large file checker — fails if any file exceeds a size limit.
 *
 * @module
 */

import * as standards from "@eser/standards";
import { createFileTool, type FileTool } from "./file-tool.ts";

const DEFAULT_MAX_KB = 1024;

export const tool: FileTool = createFileTool({
  name: "validate-large-files",
  description: "Detect files exceeding size limit",
  canFix: false,
  stacks: [],
  defaults: { maxKb: DEFAULT_MAX_KB },

  checkAll(files, options) {
    const maxKb = (options["maxKb"] as number | undefined) ?? DEFAULT_MAX_KB;
    const maxBytes = maxKb * 1024;

    const issues = [];
    for (const file of files) {
      if (file.size > maxBytes) {
        const sizeKb = Math.round(file.size / 1024);
        issues.push({
          path: file.path,
          message: `file is ${sizeKb}KB (max: ${maxKb}KB)`,
        });
      }
    }

    return issues;
  },
});

export const run: FileTool["run"] = tool.run;
export const validator: FileTool["validator"] = tool.validator;
export const main: FileTool["main"] = tool.main;

if (import.meta.main) {
  const { runCliMain } = await import("./cli-support.ts");
  runCliMain(await main(standards.runtime.current.process.args as string[]));
}
