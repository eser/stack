// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// This file contains code from deno fresh (https://github.com/denoland/fresh),
// which is a web framework, licensed under the MIT license.

// Copyright (c) 2023 Eser Ozvataf and other contributors
// Copyright (c) 2021-2023 Luca Casonato

import * as posix from "@std/path/posix";
import * as walk from "@std/fs/walk";
import * as patterns from "@eser/standards/patterns";
import * as validatorIdentifier from "./validator-identifier/mod.ts";

export async function* walkFiles(
  baseDir: string,
  globFilter: string | undefined,
  ignoreFilePattern: RegExp,
): AsyncGenerator<string> {
  const routesFolder = walk.walk(baseDir, {
    includeDirs: false,
    includeFiles: true,
    exts: patterns.JS_FILE_EXTENSIONS,
    skip: [ignoreFilePattern],
  });

  for await (const entry of routesFolder) {
    const rel = posix.relative(baseDir, entry.path);

    if (globFilter !== undefined && !posix.globToRegExp(globFilter).test(rel)) {
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

export type WebExportFilter = {
  type: "route" | "island" | "layout" | "middleware" | "component";
  exportName?: string;
};

export const collectExports = async (
  options: CollectExportsOptions,
): Promise<Array<ExportItem>> => {
  // const mainModule = runtime.current.getMainModule();
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
      // Skip modules that fail to import, but in development mode
      // re-throw for better debugging experience
      if (Deno.env.get("DENO_ENV") === "development") {
        const errorMessage = err instanceof Error ? err.message : String(err);
        throw new Error(`Failed to import module ${entryUri}: ${errorMessage}`);
      }
      // In production, silently continue with other modules
    }
  }

  return exports;
};

export const createWebExportFilter = (filter: WebExportFilter) => {
  return async (entries: [string, unknown][]): Promise<[string, unknown][]> => {
    const filtered: [string, unknown][] = [];

    for (const [exportName, exportValue] of entries) {
      if (filter.exportName && exportName !== filter.exportName) {
        continue;
      }

      switch (filter.type) {
        case "route":
        case "layout":
        case "middleware":
        case "component":
          if (
            exportName === "limeModule" && typeof exportValue === "function"
          ) {
            filtered.push([exportName, exportValue]);
          }
          break;
        case "island":
          if (
            typeof exportValue === "function" &&
            (exportName.endsWith("Island") || exportName === "limeModule")
          ) {
            filtered.push([exportName, exportValue]);
          }
          break;
      }
    }

    return filtered;
  };
};

export const collectWebModules = async (
  baseDir: string,
  type: "route" | "island" | "layout" | "middleware" | "component",
  globFilter?: string,
): Promise<Array<ExportItem>> => {
  return collectExports({
    baseDir,
    globFilter,
    exportFilter: createWebExportFilter({ type }),
  });
};

export const collectRouteModules = (
  baseDir: string,
  globFilter = "**/*.{ts,tsx,js,jsx}",
) => collectWebModules(baseDir, "route", globFilter);

export const collectIslandModules = (
  baseDir: string,
  globFilter = "**/islands/**/*.{ts,tsx,js,jsx}",
) => collectWebModules(baseDir, "island", globFilter);

export const collectLayoutModules = (
  baseDir: string,
  globFilter = "**/layouts/**/*.{ts,tsx,js,jsx}",
) => collectWebModules(baseDir, "layout", globFilter);

export const collectMiddlewareModules = (
  baseDir: string,
  globFilter = "**/middleware/**/*.{ts,tsx,js,jsx}",
) => collectWebModules(baseDir, "middleware", globFilter);

export const collectComponentModules = (
  baseDir: string,
  globFilter = "**/components/**/*.{ts,tsx,js,jsx}",
) => collectWebModules(baseDir, "component", globFilter);

// Re-export the specifierToIdentifier function for use in web-manifest.ts
export const specifierToIdentifier = (
  specifier: string,
  used: Set<string>,
): string => {
  const ext = posix.extname(specifier);
  if (ext) {
    specifier = specifier.slice(0, -ext.length);
  }

  let ident = "";
  for (let i = 0; i < specifier.length; i++) {
    const char = specifier.charCodeAt(i);
    if (i === 0 && !validatorIdentifier.isIdentifierStart(char)) {
      ident += "_";
      if (validatorIdentifier.isIdentifierChar(char)) {
        ident += specifier[i];
      }
    } else if (!validatorIdentifier.isIdentifierChar(char)) {
      if (ident[ident.length - 1] !== "_") {
        ident += "_";
      }
    } else if (ident[ident.length - 1] !== "_" || specifier[i] !== "_") {
      ident += specifier[i];
    }
  }

  if (used.has(ident)) {
    let check = ident;
    let i = 1;

    while (used.has(check)) {
      check = `${ident}_${i++}`;
    }

    ident = check;
  }

  used.add(ident);
  return ident;
};
