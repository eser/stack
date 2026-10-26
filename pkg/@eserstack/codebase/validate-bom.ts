// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * BOM fixer — removes UTF-8 byte order markers.
 *
 * @module
 */

import * as standards from "@eserstack/standards";
import * as cliSupport from "./cli-support.ts";
import * as fileTool from "./file-tool.ts";
import type { FileTool } from "./file-tool.ts";

/** UTF-8 BOM: 0xEF 0xBB 0xBF */
const BOM = "\uFEFF";

export const tool: FileTool = fileTool.withGoValidator(
  fileTool.createFileTool({
    name: "validate-bom",
    description: "Remove UTF-8 byte order markers",
    canFix: true,
    stacks: [],
    defaults: {},

    checkFile(file, content) {
      if (content === undefined) {
        return [];
      }

      if (content.startsWith(BOM)) {
        return [{ path: file.path, message: "file has UTF-8 BOM" }];
      }

      return [];
    },

    fixFile(file, content) {
      if (!content.startsWith(BOM)) {
        return undefined;
      }

      const fixed = content.slice(1);
      return { path: file.path, oldContent: content, newContent: fixed };
    },
  }),
  "bom",
);

export const run: FileTool["run"] = tool.run;
export const validator: FileTool["validator"] = tool.validator;
export const main: FileTool["main"] = tool.main;

if (import.meta.main) {
  // Entry point: the await only runs when this file is executed directly.
  // oxlint-disable-next-line node/no-top-level-await
  const result = await main(
    standards.crossRuntime.runtime.process.args as string[],
  );
  cliSupport.runCliMain(result);
}
