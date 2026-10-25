// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Merge conflict checker — detects conflict markers in files.
 *
 * @module
 */

import * as standards from "@eserstack/standards";
import * as cliSupport from "./cli-support.ts";
import * as fileTool from "./file-tool.ts";
import type { FileTool } from "./file-tool.ts";

const CONFLICT_PATTERNS = [/^<{7}\s/, /^={7}$/, /^>{7}\s/];

export const tool: FileTool = fileTool.withGoValidator(
  fileTool.createFileTool({
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
  }),
  "merge-conflicts",
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
