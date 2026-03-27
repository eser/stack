// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * JSON syntax checker — validates .json and .jsonc files.
 *
 * @module
 */

import * as jsonc from "@std/jsonc";
import * as standards from "@eser/standards";
import { createFileTool, type FileTool } from "./file-tool.ts";

export const tool: FileTool = createFileTool({
  name: "validate-json",
  description: "Validate JSON syntax",
  canFix: false,
  stacks: [],
  defaults: {},
  extensions: ["json", "jsonc"],

  checkFile(file, content, options) {
    if (content === undefined) {
      return [];
    }

    // Check excludes from .eser/manifest.yml config
    const excludes = (options["exclude"] as string[] | undefined) ?? [];
    if (excludes.some((pattern) => file.path.includes(pattern))) {
      return [];
    }

    try {
      if (file.name.endsWith(".jsonc")) {
        jsonc.parse(content);
      } else {
        JSON.parse(content);
      }
      return [];
    } catch (error) {
      const message = error instanceof SyntaxError
        ? error.message
        : "invalid JSON";
      return [{ path: file.path, message }];
    }
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
