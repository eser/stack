// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Pure JavaScript path utilities polyfill.
 * Works on any runtime without native dependencies.
 * Implements POSIX-style paths (forward slashes).
 *
 * @module
 */

import type { ParsedPath, RuntimePath } from "../types.ts";

// POSIX constants
const POSIX_SEP = "/";
const POSIX_DELIMITER = ":";

/**
 * Normalizes path separators and removes redundant slashes.
 */
const normalizeSlashes = (path: string): string => {
  // Convert backslashes to forward slashes for consistency
  return path.replace(/\\/g, "/").replace(/\/+/g, "/");
};

/**
 * Join path segments with the POSIX separator.
 */
const join = (...paths: string[]): string => {
  if (paths.length === 0) return ".";

  const joined = paths
    .filter((p) => p.length > 0)
    .join(POSIX_SEP);

  if (joined.length === 0) return ".";

  return normalize(joined);
};

/**
 * Resolve a sequence of paths to an absolute path.
 * Note: Without access to cwd(), this returns a normalized relative path
 * unless an absolute path is provided.
 */
const resolve = (...paths: string[]): string => {
  let resolvedPath = "";
  let resolvedAbsolute = false;

  // Process from right to left, stopping when we hit an absolute path
  for (let i = paths.length - 1; i >= 0 && !resolvedAbsolute; i--) {
    const segment = paths[i];
    if (segment === undefined || segment.length === 0) continue;

    resolvedPath = `${segment}/${resolvedPath}`;
    resolvedAbsolute = isAbsolute(segment);
  }

  // Normalize the path
  resolvedPath = normalizeSlashes(resolvedPath);

  // Remove trailing slash (unless it's the root)
  if (resolvedPath.length > 1 && resolvedPath.endsWith("/")) {
    resolvedPath = resolvedPath.slice(0, -1);
  }

  return normalize(resolvedPath) ?? ".";
};

/**
 * Get the directory name of a path.
 */
const dirname = (path: string): string => {
  if (path.length === 0) return ".";

  path = normalizeSlashes(path);

  // Remove trailing slashes
  while (path.length > 1 && path.endsWith("/")) {
    path = path.slice(0, -1);
  }

  const lastSlash = path.lastIndexOf("/");

  if (lastSlash === -1) return ".";
  if (lastSlash === 0) return "/";

  return path.slice(0, lastSlash);
};

/**
 * Get the last portion of a path.
 */
const basename = (path: string, suffix?: string): string => {
  if (path.length === 0) return "";

  path = normalizeSlashes(path);

  // Remove trailing slashes
  while (path.length > 1 && path.endsWith("/")) {
    path = path.slice(0, -1);
  }

  const lastSlash = path.lastIndexOf("/");
  let base = lastSlash === -1 ? path : path.slice(lastSlash + 1);

  // Remove suffix if provided
  if (suffix && base.endsWith(suffix)) {
    base = base.slice(0, -suffix.length);
  }

  return base;
};

/**
 * Get the extension of a path.
 */
const extname = (path: string): string => {
  const base = basename(path);
  const lastDot = base.lastIndexOf(".");

  // No dot, or dot at the start (hidden file), or dot at the end
  if (lastDot <= 0 || lastDot === base.length - 1) {
    return "";
  }

  return base.slice(lastDot);
};

/**
 * Normalize a path, resolving '..' and '.' segments.
 */
const normalize = (path: string): string => {
  if (path.length === 0) return ".";

  path = normalizeSlashes(path);

  const isAbs = path.startsWith("/");
  const trailingSlash = path.endsWith("/");

  // Split into segments and process
  const segments = path.split("/").filter((s) => s.length > 0);
  const result: string[] = [];

  for (const segment of segments) {
    if (segment === ".") {
      // Current directory - skip
      continue;
    }

    if (segment === "..") {
      // Parent directory
      if (result.length > 0 && result[result.length - 1] !== "..") {
        result.pop();
      } else if (!isAbs) {
        result.push("..");
      }
    } else {
      result.push(segment);
    }
  }

  let normalized = result.join("/");

  if (isAbs) {
    normalized = `/${normalized}`;
  }

  if (trailingSlash && normalized.length > 1) {
    normalized += "/";
  }

  return normalized ?? ".";
};

/**
 * Check if a path is absolute.
 */
const isAbsolute = (path: string): boolean => {
  if (path.length === 0) return false;

  // POSIX absolute path starts with /
  if (path.startsWith("/")) return true;

  // Windows absolute path (C:\ or C:/)
  if (
    path.length >= 3 &&
    /^[a-zA-Z]:[/\\]/.test(path)
  ) {
    return true;
  }

  return false;
};

/**
 * Get the relative path from one path to another.
 */
const relative = (from: string, to: string): string => {
  if (from === to) return "";

  from = resolve(from);
  to = resolve(to);

  if (from === to) return "";

  const fromParts = from.split("/").filter((p) => p.length > 0);
  const toParts = to.split("/").filter((p) => p.length > 0);

  // Find common prefix
  let commonLength = 0;
  const minLength = Math.min(fromParts.length, toParts.length);

  for (let i = 0; i < minLength; i++) {
    if (fromParts[i] !== toParts[i]) break;
    commonLength++;
  }

  // Build relative path
  const upCount = fromParts.length - commonLength;
  const remaining = toParts.slice(commonLength);

  const result = [
    ...Array(upCount).fill(".."),
    ...remaining,
  ];

  return result.join("/") ?? ".";
};

/**
 * Parse a path into its components.
 */
const parse = (path: string): ParsedPath => {
  if (path.length === 0) {
    return { root: "", dir: "", base: "", ext: "", name: "" };
  }

  path = normalizeSlashes(path);

  let root = "";
  let dir = "";
  const base = basename(path);
  const ext = extname(path);
  const name = ext ? base.slice(0, -ext.length) : base;

  // Determine root
  if (path.startsWith("/")) {
    root = "/";
  } else if (/^[a-zA-Z]:[/\\]/.test(path)) {
    root = path.slice(0, 3);
  }

  // Determine dir
  dir = dirname(path);
  if (dir === ".") {
    dir = "";
  }

  return { root, dir, base, ext, name };
};

/**
 * Format path components into a path string.
 */
const format = (pathObject: Partial<ParsedPath>): string => {
  const { root = "", dir, base, ext = "", name = "" } = pathObject;

  // If base is provided, use it directly
  const finalBase = base ?? (name + ext);

  // If dir is provided, join with base
  if (dir) {
    if (dir === root) {
      return `${dir}${finalBase}`;
    }
    return `${dir}/${finalBase}`;
  }

  // Just root + base
  return `${root}${finalBase}`;
};

/**
 * POSIX path implementation.
 * Pure JavaScript, works on any runtime.
 */
export const posixPath: RuntimePath = {
  join,
  resolve,
  dirname,
  basename,
  extname,
  normalize,
  isAbsolute,
  relative,
  parse,
  format,
  sep: POSIX_SEP,
  delimiter: POSIX_DELIMITER,
};
