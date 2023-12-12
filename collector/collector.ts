// Copyright 2023-present the cool authors. All rights reserved. MIT license.

import * as path from "$std/path/mod.ts";
import * as walk from "$std/fs/walk.ts";
import * as patterns from "../standards/patterns.ts";

export async function* walkFiles(
  baseDir: string,
  globFilter: string | undefined,
  ignoreFilePattern: RegExp,
) {
  const routesFolder = walk.walk(baseDir, {
    includeDirs: false,
    includeFiles: true,
    exts: patterns.JS_FILE_EXTENSIONS,
    skip: [ignoreFilePattern],
  });

  for await (const entry of routesFolder) {
    const rel = path.relative(baseDir, entry.path);

    if (globFilter !== undefined && !path.globToRegExp(globFilter).test(rel)) {
      continue;
    }

    yield rel;
  }
}

export interface CollectExportsOptions {
  baseDir: string;
  globFilter?: string;
  exportFilter?: (entries: [string, unknown][]) => [string, unknown][];
  ignoreFilePattern?: RegExp;
}

export async function collectExports(options: CollectExportsOptions) {
  const ignoreFilePattern = options.ignoreFilePattern ??
    patterns.JS_TEST_FILE_PATTERN;

  const exports: Array<[string, Array<[string, unknown]>]> = [];

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

      const selectedExports = options.exportFilter(moduleExports);

      if (selectedExports.length === 0) {
        continue;
      }

      exports.push([entry, selectedExports]);
    } catch (err) {
      console.error(err);
    }
  }

  return exports;
}
