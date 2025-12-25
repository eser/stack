// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { runtime } from "./mod.ts";

/**
 * Options for file hierarchy search.
 */
export type SearchFileHierarchyOptions = {
  /** Search parent directories if file not found in startDir */
  readonly searchParents?: boolean;
};

/**
 * Searches for a file by name in a directory hierarchy.
 *
 * Starting from `startDir`, looks for any of the specified filenames.
 * If `searchParents` is true, continues searching parent directories
 * until a file is found or the root is reached.
 *
 * @param startDir - The directory to start searching from
 * @param filenames - Array of filenames to search for (in priority order)
 * @param options - Search options
 * @returns The path to the first found file, or undefined if not found
 *
 * @example
 * ```typescript
 * import { searchFileHierarchy } from "@eser/standards/runtime";
 *
 * // Find config file in current directory only
 * const configPath = await searchFileHierarchy("./src", ["deno.json", "deno.jsonc"]);
 *
 * // Find config file, searching up to root
 * const configPath = await searchFileHierarchy("./src/lib", ["deno.json"], {
 *   searchParents: true
 * });
 * ```
 */
export const searchFileHierarchy = async (
  startDir: string,
  filenames: ReadonlyArray<string>,
  options: SearchFileHierarchyOptions = {},
): Promise<string | undefined> => {
  const { searchParents = false } = options;
  let dir = startDir;

  while (true) {
    for (const name of filenames) {
      const filepath = runtime.path.join(dir, name);
      const exists = await runtime.fs.exists(filepath);

      if (exists) {
        // Verify it's a file, not a directory
        const stat = await runtime.fs.stat(filepath);
        if (stat.isFile) {
          return filepath;
        }
      }
    }

    if (!searchParents) {
      break;
    }

    const parent = runtime.path.dirname(dir);
    if (parent === dir) {
      // Reached root
      break;
    }

    dir = parent;
  }

  return undefined;
};
