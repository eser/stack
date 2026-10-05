// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// This file contains code from deno fresh (https://github.com/denoland/fresh),
// which is a web framework, licensed under the MIT license.

// Copyright (c) 2023 Eser Ozvataf and other contributors
// Copyright (c) 2021-2023 Luca Casonato

import * as logger from "@eserstack/logging/logger";
import * as patterns from "@eserstack/standards/patterns";
import * as ffiClient from "./ffi-client.ts";

/**
 * Convert a simple glob pattern to a RegExp.
 * Supports `*` (any non-separator chars) and `**` (any chars including separators).
 */
const simpleGlobToRegExp = (glob: string): RegExp => {
  const escaped = glob
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, ".*")
    .replace(/\*/g, "[^/]*");
  return new RegExp(`^${escaped}$`);
};

export async function* walkFiles(
  baseDir: string,
  globFilter: string | undefined,
  ignoreFilePattern: RegExp,
): AsyncGenerator<string> {
  await ffiClient.ensureLib();
  const lib = ffiClient.getLib();

  if (lib === null) {
    throw new Error("native library unavailable");
  }

  const raw = lib.symbols.EserAjanCollectorWalkFiles(
    JSON.stringify({
      dir: baseDir,
      ignoreFilePattern: ignoreFilePattern.source,
    }),
  );
  const result = JSON.parse(raw) as {
    files: Array<{ relPath: string; absPath: string }>;
    error?: string;
  };

  if (result.error) {
    throw new Error(result.error);
  }

  for (const { relPath } of result.files) {
    if (
      globFilter !== undefined &&
      !simpleGlobToRegExp(globFilter).test(relPath)
    ) {
      continue;
    }
    yield relPath;
  }
}

export type CollectExportsOptions = {
  baseDir: string;
  globFilter?: string;
  exportFilter?: (entries: [string, unknown][]) => Promise<[string, unknown][]>;
  ignoreFilePattern?: RegExp;
};

export type ExportItem = [string, Array<[string, unknown]>];

export const collectExports = async (
  options: CollectExportsOptions,
): Promise<Array<ExportItem>> => {
  const ignoreFilePattern = options.ignoreFilePattern ??
    patterns.JS_TEST_FILE_PATTERN;

  const exports: Array<ExportItem> = [];

  for await (
    const entry of walkFiles(
      options.baseDir,
      options.globFilter,
      ignoreFilePattern,
    )
  ) {
    const entryUri = `${options.baseDir}/${entry}`;

    try {
      const entryModule = await import(entryUri);
      const moduleExports = Object.entries(entryModule);

      if (options.exportFilter === undefined) {
        exports.push([entry, moduleExports]);
        continue;
      }

      const selectedExports = await options.exportFilter(moduleExports);

      if (selectedExports.length === 0) {
        continue;
      }

      exports.push([entry, selectedExports]);
    } catch (err) {
      // A module that fails to import is skipped, not fatal: the remaining
      // modules are still collected, and the warning names the one left out.
      // The reason goes into the message text, since an Error passed as a log
      // argument serializes to "{}" and would lose it.
      const reason = err instanceof Error ? err.message : String(err);
      await logger.current.warn(
        `collectExports skipped ${entryUri}: importing it failed (${reason}). Fix the module or exclude it with ignoreFilePattern.`,
      );
    }
  }

  return exports;
};
