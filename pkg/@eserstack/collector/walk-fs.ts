// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The TypeScript twin of collectorfx.WalkCollectableFiles
 * (pkg/ajan/collectorfx/walker.go), used when the native bridge is not
 * available. It keeps the Go walker's rules: the same source extensions, the
 * same skipped directory names, entries below the root that cannot be read are
 * skipped, a root that cannot be read is an error, and files come in the order
 * of a depth-first walk over directory entries sorted by name.
 *
 * @module
 */

import { runtime } from "@eserstack/standards/cross-runtime";

/** File extensions treated as collectable source files. */
const JS_EXTENSIONS: ReadonlySet<string> = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mts",
  ".cts",
  ".mjs",
  ".cjs",
]);

/** Directory names that are never walked into. */
const EXCLUDED_DIRS: ReadonlySet<string> = new Set([
  "node_modules",
  ".git",
  "dist",
  "coverage",
  ".output",
  ".cache",
]);

/** The base directory of a walk does not exist or cannot be read. */
export class UnreadableWalkRootError extends Error {
  readonly root: string;

  constructor(root: string, options?: ErrorOptions) {
    super(`walk root cannot be read: ${root}`, options);
    this.root = root;
    this.name = "UnreadableWalkRootError";
  }
}

const extensionOf = (name: string): string => {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot).toLowerCase();
};

/** Byte order on names, as Go's os.ReadDir sorts them. */
const byName = (a: { name: string }, b: { name: string }): number =>
  a.name < b.name ? -1 : a.name > b.name ? 1 : 0;

const readSortedDir = async (
  dir: string,
): Promise<Array<{ name: string; isDirectory: boolean }>> => {
  const entries: Array<{ name: string; isDirectory: boolean }> = [];
  for await (const entry of runtime.fs.readDir(dir)) {
    // A symbolic link is reported as itself and never followed, as
    // filepath.WalkDir does.
    entries.push({
      name: entry.name,
      isDirectory: entry.isDirectory && !entry.isSymlink,
    });
  }
  return entries.sort(byName);
};

/**
 * Returns the paths, relative to `baseDir` and with forward slashes, of the
 * collectable source files under it, leaving out those `ignoreFilePattern`
 * matches.
 *
 * @throws {UnreadableWalkRootError} when `baseDir` cannot be read
 */
export const walkCollectableFiles = async (
  baseDir: string,
  ignoreFilePattern: RegExp,
): Promise<string[]> => {
  const root = runtime.path.resolve(baseDir);
  const files: string[] = [];

  let rootEntries: Array<{ name: string; isDirectory: boolean }>;
  try {
    rootEntries = await readSortedDir(root);
  } catch (error) {
    throw new UnreadableWalkRootError(root, { cause: error });
  }

  const visit = async (
    entries: Array<{ name: string; isDirectory: boolean }>,
    relDir: string,
  ): Promise<void> => {
    for (const entry of entries) {
      const rel = relDir === "" ? entry.name : `${relDir}/${entry.name}`;

      if (entry.isDirectory) {
        if (EXCLUDED_DIRS.has(entry.name)) {
          continue;
        }

        let children: Array<{ name: string; isDirectory: boolean }>;
        try {
          // Depth-first and in name order, so the output order is the Go
          // walker's.
          // deno-lint-ignore no-await-in-loop
          children = await readSortedDir(runtime.path.join(root, rel));
        } catch {
          // Unreadable entries below the root are skipped, as in Go.
          continue;
        }
        // deno-lint-ignore no-await-in-loop
        await visit(children, rel);
        continue;
      }

      if (!JS_EXTENSIONS.has(extensionOf(entry.name))) {
        continue;
      }

      // A pattern with the g or y flag keeps state between test() calls.
      ignoreFilePattern.lastIndex = 0;
      if (ignoreFilePattern.test(rel)) {
        continue;
      }

      files.push(rel);
    }
  };

  await visit(rootEntries, "");

  return files;
};
