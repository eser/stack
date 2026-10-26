// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { runtime } from "@eserstack/standards/cross-runtime";

/**
 * Resolves a request-derived relative path against a base directory and
 * returns it only when the result stays strictly inside that directory.
 *
 * Returns null for absolute inputs (a `//`-prefixed request target turns the
 * remainder into an absolute path, which `resolve` would adopt wholesale), for
 * `..` escapes, and for the base directory itself. The check compares path
 * segments via `relative`, so a sibling such as `dist-old` never passes as a
 * child of `dist`.
 */
export const resolveWithin = (
  baseDir: string,
  relativePath: string,
): string | null => {
  if (relativePath.includes("\0") || runtime.path.isAbsolute(relativePath)) {
    return null;
  }

  const base = runtime.path.resolve(baseDir);
  const resolved = runtime.path.resolve(base, relativePath);
  const rel = runtime.path.relative(base, resolved);

  if (
    rel === "" ||
    rel === ".." ||
    rel.startsWith(`..${runtime.path.sep}`) ||
    runtime.path.isAbsolute(rel)
  ) {
    return null;
  }

  return resolved;
};
