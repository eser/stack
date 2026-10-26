// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Run by wasm-gitignore.test.ts, once on the native library and once under
 * `node --no-experimental-ffi`, where the loader falls back to the WASM
 * reactor. It enumerates the git repository named by its argument through
 * every bridge entry point that walks files git-aware and prints one JSON
 * line with the files each one saw, relative to the root and sorted.
 *
 * @module
 */

import { runtime } from "@eserstack/standards/cross-runtime";
import * as ffiClient from "./ffi-client.ts";
import * as fileToolsShared from "./file-tools-shared.ts";
import * as validateLargeFiles from "./validate-large-files.ts";
import * as validation from "./validation/mod.ts";
import * as validateStream from "./validate-stream.ts";
import * as walkStream from "./walk-stream.ts";
import type { ValidatorIssue } from "./validation/types.ts";

const root = runtime.process.args[0] ?? ".";

const relative = (path: string): string =>
  path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path;

const sorted = (paths: readonly string[]): string[] =>
  paths.map(relative).toSorted();

const main = async (): Promise<void> => {
  await ffiClient.ensureLib();
  const backend = ffiClient.getLib()?.backend ?? null;

  const walked = await fileToolsShared.walkSourceFiles({ root });

  const streamed: string[] = [];
  await using walk = await walkStream.walkFilesStream({
    dir: root,
    gitAware: true,
  });
  for await (const file of walk) {
    streamed.push(file.path);
  }

  // maxKb 1 flags the gitignored 2 KB file whenever a walk lets it through.
  const largeFiles = await validateLargeFiles.validator.validate({
    root,
    options: { maxKb: 1 },
  });

  const builtin = await validation.runBuiltinValidators({
    dir: root,
    validators: ["large-file"],
  });

  const validated: string[] = [];
  await using validating = await validateStream.validateFilesStream({
    dir: root,
    validators: ["large-file"],
    validatorOptions: { "large-file": { maxKb: 1 } },
    gitAware: true,
  });
  for await (const result of validating) {
    // Go leaves `issues` out of a result that has none.
    const issues = (result.issues as ValidatorIssue[] | undefined) ?? [];
    validated.push(...issues.map((issue) => issue.file ?? ""));
  }

  // oxlint-disable-next-line no-console
  console.log(
    JSON.stringify({
      backend,
      walked: sorted(walked.map((file) => file.path)),
      streamed: sorted(streamed),
      largeFiles: sorted(largeFiles.issues.map((issue) => issue.file ?? "")),
      // The bridge answers with Go's result shape, filesChecked at the top.
      builtinChecked:
        (builtin[0] as { filesChecked?: number } | undefined)?.filesChecked ??
        null,
      validated: sorted(validated),
    }),
  );
};

// The await runs only when this file is the program.
// oxlint-disable-next-line node/no-top-level-await
await main();
