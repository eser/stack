// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Template file processing with variable substitution and ignore-pattern matching.
 *
 * Provides utilities for:
 * - Detecting binary files by extension
 * - Matching paths against glob-based ignore patterns
 * - Substituting {{.variable}} placeholders in content and path segments
 *
 * @module
 */

import * as nodePath from "node:path";
import * as patterns from "@eserstack/standards/patterns";

// =============================================================================
// Constants
// =============================================================================

/** Binary file extensions to skip variable substitution (bare, no dots) */
export const BINARY_EXTENSIONS: string[] = [
  "png",
  "jpg",
  "jpeg",
  "gif",
  "ico",
  "webp",
  "svg",
  "woff",
  "woff2",
  "ttf",
  "eot",
  "otf",
  "zip",
  "tar",
  "gz",
  "bz2",
  "xz",
  "7z",
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "exe",
  "dll",
  "so",
  "dylib",
  "mp3",
  "mp4",
  "avi",
  "mov",
  "webm",
];

/** Variable placeholder pattern for replacement (global flag) */
const VARIABLE_PATTERN = /\{\{\s*\.(\w+)\s*\}\}/g;

/** Variable placeholder pattern for detection (no global flag — stateless) */
const VARIABLE_DETECT_PATTERN = /\{\{\s*\.(\w+)\s*\}\}/;

// =============================================================================
// Binary detection
// =============================================================================

/**
 * Check if a file should be treated as binary (by extension).
 * Extension comparison uses the raw path — case-sensitive on the extension.
 */
export const isBinaryFile = (filepath: string): boolean =>
  patterns.hasExtension(filepath.toLowerCase(), BINARY_EXTENSIONS);

// =============================================================================
// Ignore-pattern matching
// =============================================================================

// Node's glob matcher lets `*` and `**` skip a path segment that starts with
// a dot unless the pattern segment starts with a dot too. Kit's ignore globs,
// and the Go port in kitfx, match such segments, so a leading dot is replaced
// with a private-use character in the path and in the pattern alike.
const DOT_MARK = "\u{E000}";

const markPathDots = (value: string): string =>
  value.replace(/(^|[\\/])\./g, `$1${DOT_MARK}`);

const markPatternDots = (pattern: string): string =>
  pattern.replace(/(^|[/{(|,])\./g, `$1${DOT_MARK}`);

const stripTrailingSlashes = (value: string): string =>
  value.replace(/[\\/]+$/, "");

/**
 * Check if a relative path matches any of the ignore patterns, with
 * `path.matchesGlob` from `node:path`:
 *   `**\/foo`   → matches "foo" at the top level AND "a/b/foo" at any depth
 *   `**\/*.md`  → matches "README.md" at any depth
 *   `*.md`      → matches "README.md" at the top level only
 *   `src/`      → matches the directory and everything under it
 * `*` and `**` match names that start with a dot, as in kitfx.
 */
export const shouldIgnore = (
  relativePath: string,
  ignorePatterns: readonly string[],
): boolean => {
  const markedPath = markPathDots(stripTrailingSlashes(relativePath));

  for (const pattern of ignorePatterns) {
    const glob = stripTrailingSlashes(pattern);
    if (
      glob !== "" &&
      nodePath.matchesGlob(markedPath, markPatternDots(glob))
    ) {
      return true;
    }
    // Also match files under a directory pattern (dir → dir/file)
    if (!pattern.includes("*") && !pattern.includes("?")) {
      if (
        relativePath === pattern ||
        relativePath.startsWith(pattern.replace(/\/$/, "") + "/")
      ) {
        return true;
      }
    }
  }
  return false;
};

// =============================================================================
// Variable substitution
// =============================================================================

/**
 * Substitute {{.var}} placeholders in a string.
 *
 * @param content - String with {{.variable}} placeholders
 * @param variables - Variable values to substitute
 * @returns Content with placeholders replaced; unresolved placeholders are kept as-is
 */
export const substituteVariables = (
  content: string,
  variables: Record<string, string>,
): string => {
  return content.replace(VARIABLE_PATTERN, (_match, varName: string) => {
    const value = variables[varName];
    if (value === undefined) {
      // Keep original placeholder if variable not found
      return `{{.${varName}}}`;
    }
    return value;
  });
};

/**
 * Check if a string contains variable placeholders.
 */
export const hasVariables = (content: string): boolean => {
  return VARIABLE_DETECT_PATTERN.test(content);
};

/**
 * Substitute {{.var}} placeholders in each path segment of a relative path.
 * Used for directory and file name substitution.
 */
export const substituteInPath = (
  relativePath: string,
  variables: Record<string, string>,
): string => {
  const sep = "/";
  const segments = relativePath.split(sep);
  const substituted = segments.map((segment) =>
    substituteVariables(segment, variables),
  );
  return substituted.join(sep);
};
