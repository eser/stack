// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Case conflict checker — detects filenames that differ only by case.
 *
 * @module
 */

import * as standards from "@eser/standards";
import { createFileTool, type FileTool } from "./file-tool.ts";

export const tool: FileTool = createFileTool({
  name: "validate-case-conflict",
  description: "Detect filenames that differ only by case",
  canFix: false,
  stacks: [],
  defaults: {},

  checkAll(files) {
    const seen = new Map<string, string>();
    const issues = [];

    for (const file of files) {
      const lower = file.path.toLowerCase();
      const existing = seen.get(lower);

      if (existing !== undefined) {
        issues.push({
          path: file.path,
          message: `case conflict with "${existing}"`,
        });
      } else {
        seen.set(lower, file.path);
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
