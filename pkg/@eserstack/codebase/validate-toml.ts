// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * TOML syntax checker — validates .toml files.
 *
 * @module
 */

import * as toml from "@std/toml";
import * as standards from "@eserstack/standards";
import { createFileTool, type FileTool } from "./file-tool.ts";

export const tool: FileTool = createFileTool({
  name: "validate-toml",
  description: "Validate TOML syntax",
  canFix: false,
  stacks: [],
  defaults: {},
  extensions: ["toml"],

  checkFile(file, content) {
    if (content === undefined) {
      return [];
    }

    try {
      toml.parse(content);
      return [];
    } catch (error) {
      const message = error instanceof Error ? error.message : "invalid TOML";
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
