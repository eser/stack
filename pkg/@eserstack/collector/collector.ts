// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// This file contains code from deno fresh (https://github.com/denoland/fresh),
// which is a web framework, licensed under the MIT license.

// Copyright (c) 2023 Eser Ozvataf and other contributors
// Copyright (c) 2021-2023 Luca Casonato

import * as logger from "@eserstack/logging/logger";
import * as patterns from "@eserstack/standards/patterns";
import * as ffiClient from "./ffi-client.ts";
import * as walkFs from "./walk-fs.ts";

const collectorLogger = logger.getLogger(["collector"]);

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

/**
 * Yields the paths, relative to `baseDir`, of the collectable source files
 * under it.
 *
 * With the native bridge loaded, the walk runs in Go (collectorfx). Without it
 * (the bridge is missing, `ESER_AJAN=disabled`, or only the WASM build loads,
 * which has no filesystem), or when the Go walk reports an error, the walk
 * runs in TypeScript on the runtime's file system with the same rules
 * ({@link walkFs.walkCollectableFiles}). A base directory that cannot be read
 * is an error either way.
 */
export async function* walkFiles(
  baseDir: string,
  globFilter: string | undefined,
  ignoreFilePattern: RegExp,
): AsyncGenerator<string> {
  const glob =
    globFilter === undefined ? undefined : simpleGlobToRegExp(globFilter);

  for (const relPath of await listFiles(baseDir, ignoreFilePattern)) {
    if (glob !== undefined && !glob.test(relPath)) {
      continue;
    }
    yield relPath;
  }
}

/** The Go walk's result, or null when it cannot serve this walk. */
const listFilesInGo = async (
  baseDir: string,
  ignoreFilePattern: RegExp,
): Promise<string[] | null> => {
  await ffiClient.ensureLib();
  const lib = ffiClient.getLib();

  if (lib === null) {
    return null;
  }

  const raw = lib.symbols.EserAjanCollectorWalkFiles(
    JSON.stringify({
      dir: baseDir,
      ignoreFilePattern: ignoreFilePattern.source,
    }),
  );
  const result = JSON.parse(raw) as {
    files?: Array<{ relPath: string; absPath: string }> | null;
    error?: string;
  };

  if (result.error !== undefined && result.error !== "") {
    // The WASM build without a preopen cannot read the directory, and Go's
    // regexp rejects some JavaScript patterns, such as lookaheads. The
    // TypeScript walk handles both, and reports a root that is really
    // unreadable itself.
    collectorLogger.debug(
      `collector walk in Go failed (${result.error}); walking in TypeScript`,
    );
    return null;
  }

  return (result.files ?? []).map((file) => file.relPath);
};

const listFiles = async (
  baseDir: string,
  ignoreFilePattern: RegExp,
): Promise<string[]> =>
  (await listFilesInGo(baseDir, ignoreFilePattern)) ??
  (await walkFs.walkCollectableFiles(baseDir, ignoreFilePattern));

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
  const ignoreFilePattern =
    options.ignoreFilePattern ?? patterns.JS_TEST_FILE_PATTERN;

  const exports: Array<ExportItem> = [];

  for await (const entry of walkFiles(
    options.baseDir,
    options.globFilter,
    ignoreFilePattern,
  )) {
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
