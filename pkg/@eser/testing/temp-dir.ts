// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { current, type MakeTempOptions } from "@eser/standards/runtime";

/**
 * A temporary directory handle with async disposable support.
 */
export interface TempDir extends AsyncDisposable {
  /**
   * The path to the temporary directory.
   */
  readonly dir: string;
}

/**
 * Creates a temporary directory with automatic cleanup support.
 * Uses the AsyncDisposable pattern for automatic cleanup when used with `await using`.
 *
 * In CI environments, cleanup is skipped for performance.
 *
 * @param options - Optional configuration for the temp directory
 * @returns A TempDir instance with the directory path and cleanup support
 *
 * @example
 * ```typescript
 * import { current } from "@eser/standards/runtime";
 *
 * // Automatic cleanup with await using
 * await using temp = await withTmpDir();
 * await current.fs.writeTextFile(`${temp.dir}/test.txt`, "hello");
 * // Directory is automatically cleaned up when scope exits
 *
 * // Manual cleanup
 * const temp = await withTmpDir({ prefix: "my-test-" });
 * try {
 *   // ... use temp.dir
 * } finally {
 *   await temp[Symbol.asyncDispose]();
 * }
 * ```
 */
export const withTmpDir = async (
  options?: MakeTempOptions,
): Promise<TempDir> => {
  const dir = await current.fs.makeTempDir(options);

  return {
    dir,
    async [Symbol.asyncDispose](): Promise<void> {
      // Skip cleanup in CI for performance
      if (current.env.get("CI")) {
        return;
      }

      try {
        await current.fs.remove(dir, { recursive: true });
      } catch {
        // Ignore cleanup errors - directory may already be removed
      }
    },
  };
};

/**
 * Delays execution for a specified number of milliseconds.
 *
 * @param ms - The number of milliseconds to delay
 * @returns A promise that resolves after the delay
 *
 * @example
 * ```typescript
 * await delay(100); // Wait 100ms
 * ```
 */
export const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Writes multiple files to disk, creating directories as needed.
 *
 * @param files - A record mapping file paths to their contents
 *
 * @example
 * ```typescript
 * await writeFiles({
 *   "/tmp/test/a.txt": "content a",
 *   "/tmp/test/b.txt": "content b",
 * });
 * ```
 */
export const writeFiles = async (
  files: Record<string, string>,
): Promise<void> => {
  for (const [path, content] of Object.entries(files)) {
    // Ensure directory exists
    const dir = path.substring(0, path.lastIndexOf("/"));
    if (dir) {
      // mkdir with recursive: true will not throw if directory exists
      await current.fs.mkdir(dir, { recursive: true });
    }

    await current.fs.writeTextFile(path, content);
  }
};
