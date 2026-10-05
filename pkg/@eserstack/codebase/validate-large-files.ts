// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Large file checker — fails if any file exceeds a size limit.
 *
 * @module
 */

import * as standards from "@eserstack/standards";
import * as cliSupport from "./cli-support.ts";
import * as fileTool from "./file-tool.ts";
import type { FileTool } from "./file-tool.ts";

const DEFAULT_MAX_KB = 1024;

export const tool: FileTool = fileTool.withGoValidator(
  fileTool.createFileTool({
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
  }),
  "large-file",
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
