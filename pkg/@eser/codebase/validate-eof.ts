// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * End-of-file fixer — ensures files end with exactly one newline.
 *
 * @module
 */

import * as standards from "@eser/standards";
import { createFileTool, type FileTool } from "./file-tool.ts";

export const tool: FileTool = createFileTool({
  name: "validate-eof",
  description: "Ensure files end with exactly one newline",
  canFix: true,
  stacks: [],
  defaults: {},

  checkFile(file, content) {
    if (content === undefined) {
      return [];
    }

    if (content.length === 0) {
      return [];
    }

    if (!content.endsWith("\n")) {
      return [{ path: file.path, message: "file does not end with a newline" }];
    }

    if (content.endsWith("\n\n")) {
      return [{
        path: file.path,
        message: "file has multiple trailing newlines",
      }];
    }

    return [];
  },

  fixFile(file, content) {
    if (content.length === 0) {
      return undefined;
    }

    const trimmed = content.replace(/\n+$/, "");
    const fixed = `${trimmed}\n`;

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
  runCliMain(await main(standards.runtime.current.process.args as string[]));
}
