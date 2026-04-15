// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Trailing whitespace fixer — removes trailing spaces/tabs from lines.
 *
 * @module
 */

import * as standards from "@eserstack/standards";
import { createFileTool, type FileTool } from "./file-tool.ts";

export const tool: FileTool = createFileTool({
  name: "validate-trailing-whitespace",
  description: "Remove trailing whitespace from lines",
  canFix: true,
  stacks: [],
  defaults: {},

  checkFile(file, content) {
    if (content === undefined) {
      return [];
    }

    const issues = [];
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      if (/[ \t]+$/.test(lines[i]!)) {
        issues.push({
          path: file.path,
          line: i + 1,
          message: "trailing whitespace",
        });
      }
    }

    return issues;
  },

  fixFile(file, content) {
    const fixed = content.replace(/[ \t]+$/gm, "");

    if (fixed === content) {
      return undefined;
    }

    return { path: file.path, oldContent: content, newContent: fixed };
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
