// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Runtime API portability checker. Library code reaches the file system, the
 * environment and the process through `runtime` from
 * `@eserstack/standards/cross-runtime` (javascript-practices: Cross-Runtime
 * APIs). The rules:
 *
 * - `deno` and `bun`: every reference to the `Deno` or the `Bun` identifier in
 *   code, including `globalThis.Deno`, an alias such as `g.Bun`, a `typeof`
 *   check and test files;
 * - `process`: any member of Node's global `process` (`process.env`,
 *   `process.exit`, `globalThis.process.argv`, ...). A file that declares its
 *   own `process` binding (a child process handle, a parameter,
 *   `const { process } = runtime`) is only checked for `process.env` and
 *   `globalThis.process.*`.
 *
 * The check runs in Go (codebasefx.ValidateRuntimeJSAPIs) on the lexer that
 * separates comments and string, template and regular expression literals
 * from code, so text such as `"deno.json"` never counts. The cross-runtime
 * layer itself (`standards/cross-runtime/`) is skipped; other exceptions go in
 * the `exclude` option of the manifest step, each with the reason. There is
 * no baseline: every violation fails. It needs the native library.
 *
 * @module
 */

import * as standards from "@eserstack/standards";
import * as patterns from "@eserstack/standards/patterns";
import * as cliSupport from "./cli-support.ts";
import * as ffiClient from "./ffi-client.ts";
import * as fileTool from "./file-tool.ts";
import type { FileTool, ToolIssue } from "./file-tool.ts";

/** The name the Go bridge knows this validator by. */
const GO_VALIDATOR_NAME = "runtime-js-apis";

const TOOL_NAME = "validate-runtime-js-apis";

type GoIssue = {
  readonly file: string;
  readonly line?: number;
  readonly message: string;
};

export const tool: FileTool = fileTool.withGoValidator(
  fileTool.createFileTool({
    name: TOOL_NAME,
    description:
      "Detect runtime globals used instead of @eserstack/standards/cross-runtime",
    canFix: false,
    stacks: ["javascript"],
    defaults: {},
    extensions: patterns.JS_FILE_EXTENSIONS,

    checkAll: async (_files, options): Promise<ToolIssue[]> => {
      await ffiClient.ensureLib();
      const lib = ffiClient.getLib();
      if (lib === null) {
        const cause = ffiClient.getLoadError();
        throw new Error(
          `${TOOL_NAME} runs in Go and needs the native library${
            cause === null ? "" : `: ${cause.message}`
          }`,
        );
      }

      const excludes = Array.isArray(options["exclude"])
        ? options["exclude"].filter((e): e is string => typeof e === "string")
        : [];
      const parsed = lib.call("codebaseValidateFiles", {
        dir: options.root,
        validators: [GO_VALIDATOR_NAME],
        exclude: excludes,
        gitAware: true,
      }) as {
        results?: Array<{ issues?: GoIssue[] }>;
        error?: string;
      };
      if (parsed.error !== undefined && parsed.error !== "") {
        throw new Error(`${TOOL_NAME}: ${parsed.error}`);
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
