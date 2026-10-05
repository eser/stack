// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Trailing whitespace fixer — removes trailing spaces/tabs from lines.
 *
 * @module
 */

import * as standards from "@eserstack/standards";
import * as cliSupport from "./cli-support.ts";
import * as fileTool from "./file-tool.ts";
import type { FileTool } from "./file-tool.ts";

export const tool: FileTool = fileTool.withGoValidator(
  fileTool.createFileTool({
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
  }),
  "trailing",
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
