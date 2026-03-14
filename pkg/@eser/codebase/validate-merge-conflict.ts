// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Merge conflict checker — detects conflict markers in files.
 *
 * @module
 */

import * as standards from "@eser/standards";
import { createFileTool, type FileTool } from "./file-tool.ts";

const CONFLICT_PATTERNS = [
  /^<{7}\s/,
  /^={7}$/,
  /^>{7}\s/,
];

export const tool: FileTool = createFileTool({
  name: "validate-merge-conflict",
  description: "Detect merge conflict markers",
  canFix: false,
  stacks: [],
  defaults: {},

  checkFile(file, content) {
    if (content === undefined) {
      return [];
    }

    const issues = [];
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      for (const pattern of CONFLICT_PATTERNS) {
        if (pattern.test(lines[i]!)) {
          issues.push({
            path: file.path,
            line: i + 1,
            message: `merge conflict marker: ${lines[i]!.slice(0, 20)}`,
          });
          break;
        }
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
