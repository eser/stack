// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Naming and to-do comment checker for JavaScript and TypeScript source, for the two
 * rules oxlint does not cover (decision-34):
 *
 * - declared names (after `const`, `let`, `var`, `function`, `class`,
 *   `interface`, `type` and `enum`) are camelCase, PascalCase or
 *   SCREAMING_SNAKE_CASE, apart from the names the `allowNames` option lists;
 * - every to-do marker in a comment carries a task tag, as in
 *   `TODO(TASK-123)` or `FIXME(TASK-123)` (decision-21).
 *
 * The check runs in Go (codebasefx.ValidateNamingAndTodos), on a lexer that
 * separates comments, string, template and regular expression literals and
 * identifiers, so text inside literals is never read. It needs the native
 * library.
 *
 * @module
 */

import * as standards from "@eserstack/standards";
import * as cliSupport from "./cli-support.ts";
import * as ffiClient from "./ffi-client.ts";
import * as fileTool from "./file-tool.ts";
import type { FileTool, ToolIssue } from "./file-tool.ts";

/** The name the Go bridge knows this validator by. */
const GO_VALIDATOR_NAME = "naming-and-todos";

export const tool: FileTool = fileTool.withGoValidator(
  fileTool.createFileTool({
    name: "validate-naming-and-todos",
    description:
      "Enforce camelCase declared names and task-tagged to-do comments",
    canFix: false,
    stacks: [],
    defaults: {},
    extensions: ["ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs"],

    checkAll: async (_files, options): Promise<ToolIssue[]> => {
      await ffiClient.ensureLib();
      const lib = ffiClient.getLib();
      if (lib === null) {
        const cause = ffiClient.getLoadError();
        throw new Error(
          `validate-naming-and-todos runs in Go and needs the native library${
            cause === null ? "" : `: ${cause.message}`
          }`,
        );
      }

      const excludes = Array.isArray(options["exclude"])
        ? options["exclude"].filter((e): e is string => typeof e === "string")
        : [];
      const raw = lib.symbols.EserAjanCodebaseValidateFiles(
        JSON.stringify({
          dir: options.root,
          validators: [GO_VALIDATOR_NAME],
          exclude: excludes,
          validatorOptions: {
            [GO_VALIDATOR_NAME]: { allowNames: options["allowNames"] ?? [] },
          },
          gitAware: true,
        }),
      );
      const parsed = JSON.parse(raw) as {
        results?: Array<{
          issues?: Array<{ file: string; line?: number; message: string }>;
        }>;
        error?: string;
      };
      if (parsed.error !== undefined && parsed.error !== "") {
        throw new Error(`validate-naming-and-todos: ${parsed.error}`);
      }

      return (parsed.results?.[0]?.issues ?? []).map((issue) => ({
        path: issue.file,
        line: issue.line,
        message: issue.message,
      }));
    },
  }),
  GO_VALIDATOR_NAME,
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
