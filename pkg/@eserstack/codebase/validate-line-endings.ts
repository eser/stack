// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Line ending fixer — normalizes all line endings to LF.
 *
 * @module
 */

import * as standards from "@eserstack/standards";
import { createFileTool, type FileTool, withGoValidator } from "./file-tool.ts";

export const tool: FileTool = withGoValidator(createFileTool({
  name: "validate-line-endings",
  description: "Normalize line endings to LF",
  canFix: true,
  stacks: [],
  defaults: {},

  checkFile(file, content) {
    if (content === undefined) {
      return [];
    }

    if (content.includes("\r")) {
      return [{
        path: file.path,
        message: "file contains CRLF or CR line endings",
      }];
    }

    return [];
  },

  fixFile(file, content) {
    // Replace CRLF first, then standalone CR
    const fixed = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    if (fixed === content) {
      return undefined;
    }

    return { path: file.path, oldContent: content, newContent: fixed };
  },
}), "line-endings");

export const run: FileTool["run"] = tool.run;
export const validator: FileTool["validator"] = tool.validator;
export const main: FileTool["main"] = tool.main;

if (import.meta.main) {
  const { runCliMain } = await import("./cli-support.ts");
  runCliMain(
    await main(standards.crossRuntime.runtime.process.args as string[]),
  );
}
