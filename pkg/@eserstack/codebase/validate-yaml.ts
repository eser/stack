// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * YAML syntax checker — validates .yml and .yaml files.
 *
 * @module
 */

import * as yaml from "yaml";
import * as standards from "@eserstack/standards";
import * as cliSupport from "./cli-support.ts";
import * as fileTool from "./file-tool.ts";
import type { FileTool } from "./file-tool.ts";

export const tool: FileTool = fileTool.withGoValidator(
  fileTool.createFileTool({
    name: "validate-yaml",
    description: "Validate YAML syntax",
    canFix: false,
    stacks: [],
    defaults: {},
    extensions: ["yml", "yaml"],

    checkFile(file, content) {
      if (content === undefined) {
        return [];
      }

      try {
        yaml.parse(content);
        return [];
      } catch (error) {
        const message = error instanceof Error ? error.message : "invalid YAML";
        return [{ path: file.path, message }];
      }
    },
  }),
  "yaml",
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
