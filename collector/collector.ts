// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// This file contains code from deno fresh (https://github.com/denoland/fresh),
// which is a web framework, licensed under the MIT license.

// Copyright (c) 2023 Eser Ozvataf and other contributors
// Copyright (c) 2021-2023 Luca Casonato

import { path, walk } from "./deps.ts";
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
