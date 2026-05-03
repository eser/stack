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

import * as globPath from "@std/path/glob-to-regexp";
import { hasExtension } from "@eserstack/standards/patterns";

// =============================================================================
// Constants
// =============================================================================

/** Binary file extensions to skip variable substitution (bare, no dots) */
export const BINARY_EXTENSIONS = [
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
  hasExtension(filepath.toLowerCase(), BINARY_EXTENSIONS);

// =============================================================================
// Ignore-pattern matching
// =============================================================================

/**
 * Check if a relative path matches any of the ignore patterns.
 *
 * Uses @std/path/glob-to-regexp so that globstar-at-root patterns work
 * correctly:
 *   `**\/foo`   → matches "foo" at the top level AND "a/b/foo" at any depth
 *   `**\/*.md`  → matches "README.md" at any depth
 *   `src/`      → matches the directory and everything under it
 */
export const shouldIgnore = (
  relativePath: string,
  ignorePatterns: readonly string[],
): boolean => {
  for (const pattern of ignorePatterns) {
    // Use @std/path/glob-to-regexp for correct globstar-at-root behavior:
    //   **/foo  →  matches "foo" at top level AND "a/b/foo" at any depth
    //   *.md    →  matches "README.md" at any depth
    //   dir/    →  matches the directory and everything under it
    const regex = globPath.globToRegExp(pattern, {
      extended: true,
      globstar: true,
      caseInsensitive: false,
    });
    if (regex.test(relativePath)) {
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
    substituteVariables(segment, variables)
  );
  return substituted.join(sep);
};
