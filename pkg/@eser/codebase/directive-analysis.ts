// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Directive analysis utilities for scanning source files.
 *
 * Identifies files with specific directives like "use client", "use server",
 * and extracts their exports for module graph building.
 *
 * @module
 */

import * as fsWalk from "@std/fs/walk";
import * as path from "@std/path";

/**
 * Common JavaScript/TypeScript directives.
 */
export const DIRECTIVES = {
  USE_CLIENT: "use client",
  USE_SERVER: "use server",
  USE_STRICT: "use strict",
} as const;

export type DirectiveName = (typeof DIRECTIVES)[keyof typeof DIRECTIVES];

/**
 * A file that matches a directive search.
 */
export interface DirectiveMatch {
  /** Absolute file path. */
  readonly filePath: string;
  /** Relative path from project root. */
  readonly relativePath: string;
  /** The directive that was found. */
  readonly directive: string;
  /** Export names found in the file. */
  readonly exports: readonly string[];
}

/**
 * Options for directive analysis.
 */
export interface DirectiveAnalysisOptions {
  /** File extensions to scan (default: [".ts", ".tsx", ".js", ".jsx"]). */
  readonly extensions?: readonly string[];
  /** Patterns to skip (default: [/node_modules/, /\.test\./, /\.spec\./]). */
  readonly skip?: readonly RegExp[];
  /** Project root for relative paths (default: same as scanDir). */
  readonly projectRoot?: string;
}

const DEFAULT_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"] as const;
const DEFAULT_SKIP = [/node_modules/, /\.test\./, /\.spec\./] as const;

/**
 * Check if file content contains a specific directive at the top.
 * Directives must appear before any actual code.
 */
export const hasDirective = (content: string, directive: string): boolean => {
  const lines = content.split("\n");
  const normalizedDirective = directive.toLowerCase();

  // Check first few lines (directives must be at the top)
  for (let i = 0; i < Math.min(10, lines.length); i++) {
    const line = lines[i]?.trim() ?? "";

    // Skip empty lines and comments
    if (line === "" || line.startsWith("//") || line.startsWith("/*")) {
      continue;
    }

    // Check for directive with either quote style
    const doubleQuote = `"${normalizedDirective}";`;
    const singleQuote = `'${normalizedDirective}';`;
    const lineLower = line.toLowerCase();

    if (lineLower === doubleQuote || lineLower === singleQuote) {
      return true;
    }

    // If we hit actual code (import, export, const, etc.), stop looking
    if (
      line.startsWith("import") ||
      line.startsWith("export") ||
      line.startsWith("const") ||
      line.startsWith("let") ||
      line.startsWith("var") ||
      line.startsWith("function") ||
      line.startsWith("class")
    ) {
      break;
    }
  }

  return false;
};

/**
 * Extract export names from file content.
 * Finds named exports, default exports, and re-exports.
 */
export const extractExports = (content: string): readonly string[] => {
  const exports = new Set<string>();

  // Named function exports: export function Name() or export async function Name()
  const namedFunctions = content.matchAll(
    /export\s+(?:async\s+)?function\s+(\w+)/g,
  );
  for (const match of namedFunctions) {
    if (match[1] !== undefined) {
      exports.add(match[1]);
    }
  }

  // Named const/let exports: export const Name =
  const namedConsts = content.matchAll(/export\s+(?:const|let)\s+(\w+)\s*=/g);
  for (const match of namedConsts) {
    if (match[1] !== undefined) {
      exports.add(match[1]);
    }
  }

  // Named class exports: export class Name
  const namedClasses = content.matchAll(/export\s+class\s+(\w+)/g);
  for (const match of namedClasses) {
    if (match[1] !== undefined) {
      exports.add(match[1]);
    }
  }

  // Default exports
  if (/export\s+default\s+/.test(content)) {
    exports.add("default");
  }

  // Named exports from declaration: export { a, b, c }
  // Use specific character class to prevent ReDoS (avoid unbounded [^}]+)
  const namedExportBlocks = content.matchAll(/export\s*\{([\w\s,]+)\}/g);
  for (const match of namedExportBlocks) {
    if (match[1] !== undefined) {
      const names = match[1].split(",").map((n) => {
        // Handle "name as alias" syntax - take the exported name (after "as")
        // Use specific word boundary pattern instead of \s+ to prevent ReDoS
        const parts = n.trim().split(/ +as +/);
        return (parts[1] ?? parts[0])?.trim();
      });
      for (const name of names) {
        if (name !== undefined && name !== "") {
          exports.add(name);
        }
      }
    }
  }

  return [...exports];
};

/**
 * Read file content safely.
 */
const readFileContent = async (filePath: string): Promise<string | null> => {
  try {
    return await Deno.readTextFile(filePath);
  } catch {
    return null;
  }
};

/**
 * Analyze a directory for files containing a specific directive.
 *
 * @example
 * const clientComponents = await analyzeDirectives("./src", "use client");
 * for (const match of clientComponents) {
 *   console.log(`${match.relativePath}: ${match.exports.join(", ")}`);
 * }
 */
export const analyzeDirectives = async (
  scanDir: string,
  directive: string,
  options: DirectiveAnalysisOptions = {},
): Promise<readonly DirectiveMatch[]> => {
  const extensions = options.extensions ?? DEFAULT_EXTENSIONS;
  const skip = options.skip ?? DEFAULT_SKIP;
  const projectRoot = options.projectRoot ?? scanDir;

  const matches: DirectiveMatch[] = [];

  for await (
    const entry of fsWalk.walk(scanDir, {
      exts: [...extensions],
      skip: [...skip],
    })
  ) {
    if (!entry.isFile) continue;

    const content = await readFileContent(entry.path);
    if (content === null) continue;

    if (hasDirective(content, directive)) {
      const relativePath = path.relative(projectRoot, entry.path);
      const exports = extractExports(content);

      matches.push({
        filePath: entry.path,
        relativePath,
        directive,
        exports,
      });
    }
  }

  return matches;
};

/**
 * Analyze for "use client" directive specifically.
 * Convenience function for React Server Components.
 */
export const analyzeClientComponents = (
  scanDir: string,
  options: DirectiveAnalysisOptions = {},
): Promise<readonly DirectiveMatch[]> =>
  analyzeDirectives(scanDir, DIRECTIVES.USE_CLIENT, options);

/**
 * Analyze for "use server" directive specifically.
 * Convenience function for React Server Actions.
 */
export const analyzeServerActions = (
  scanDir: string,
  options: DirectiveAnalysisOptions = {},
): Promise<readonly DirectiveMatch[]> =>
  analyzeDirectives(scanDir, DIRECTIVES.USE_SERVER, options);
