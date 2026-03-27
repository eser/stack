// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// This file contains code from deno fresh (https://github.com/denoland/fresh),
// which is a web framework, licensed under the MIT license.

// Copyright (c) 2023 Eser Ozvataf and other contributors
// Copyright (c) 2021-2023 Luca Casonato

import * as patterns from "@eser/standards/patterns";
import { runtime } from "@eser/standards/cross-runtime";

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
  const routesFolder = runtime.fs.walk(baseDir, {
    includeDirs: false,
    includeFiles: true,
    exts: patterns.JS_FILE_EXTENSIONS,
    skip: [ignoreFilePattern],
  });

  for await (const entry of routesFolder) {
    const rel = runtime.path.relative(baseDir, entry.path);

    if (globFilter !== undefined && !simpleGlobToRegExp(globFilter).test(rel)) {
      continue;
    }

    yield rel;
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
  // const mainModule = runtime.getMainModule();
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
      // if (`file://${entryUri}` === mainModule) {
      //   continue;
      // }

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
      // Log import failure with context for debugging
      // Callers should be aware that some modules may fail to import
      console.error(`Failed to import module: ${entryUri}`, err);
    }
  }

  return exports;
};
