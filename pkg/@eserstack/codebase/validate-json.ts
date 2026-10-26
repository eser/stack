// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * JSON syntax checker — validates .json and .jsonc files.
 *
 * @module
 */

import * as jsonc from "jsonc-parser";
import * as standards from "@eserstack/standards";
import * as cliSupport from "./cli-support.ts";
import * as fileTool from "./file-tool.ts";
import type { FileTool } from "./file-tool.ts";

/**
 * Parses JSON with comments and trailing commas. jsonc-parser recovers from
 * errors and reports them in a list instead of throwing, so the first one is
 * raised here as a SyntaxError, the way JSON.parse fails.
 */
const parseJsonc = (text: string): unknown => {
  const errors: jsonc.ParseError[] = [];
  const value: unknown = jsonc.parse(text, errors, {
    allowTrailingComma: true,
    disallowComments: false,
    allowEmptyContent: false,
  });

  const first = errors[0];
  if (first !== undefined) {
    const before = text.slice(0, first.offset).split("\n");
    const line = before.length;
    const column = (before.at(-1)?.length ?? 0) + 1;
    throw new SyntaxError(
      `Cannot parse JSONC: ${jsonc.printParseErrorCode(first.error)} at line ${line}, column ${column}`,
    );
  }

  return value;
};

export const tool: FileTool = fileTool.withGoValidator(
  fileTool.createFileTool({
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
          parseJsonc(content);
        } else {
          JSON.parse(content);
        }
        return [];
      } catch (error) {
        const message =
          error instanceof SyntaxError ? error.message : "invalid JSON";
        return [{ path: file.path, message }];
      }
    },
  }),
  "json",
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
