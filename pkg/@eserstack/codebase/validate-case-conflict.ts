// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Case conflict checker — detects filenames that differ only by case.
 *
 * @module
 */

import * as standards from "@eserstack/standards";
import * as cliSupport from "./cli-support.ts";
import * as fileTool from "./file-tool.ts";
import type { FileTool } from "./file-tool.ts";

export const tool: FileTool = fileTool.withGoValidator(
  fileTool.createFileTool({
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
  }),
  "case-conflict",
);

export const run: FileTool["run"] = tool.run;
export const validator: FileTool["validator"] = tool.validator;
export const main: FileTool["main"] = tool.main;

if (import.meta.main) {
  // Entry point: the await only runs when this file is executed directly.
  // deno-lint-ignore no-top-level-await
  const result = await main(
    standards.crossRuntime.runtime.process.args as string[],
  );
  cliSupport.runCliMain(result);
}
