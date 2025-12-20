// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Entry in a fake filesystem walk operation.
 */
export interface WalkEntry {
  path: string;
  isDirectory: boolean;
  isFile: boolean;
  name: string;
}

/**
 * Interface for a mock filesystem.
 */
export interface FakeFs {
  /**
   * Reads the content of a file as text.
   *
   * @param path - The file path to read
   * @returns The file content
   * @throws {Deno.errors.NotFound} If the file doesn't exist
   */
  readTextFile(path: string): Promise<string>;

  /**
   * Reads the content of a file as bytes.
   *
   * @param path - The file path to read
   * @returns The file content as Uint8Array
   * @throws {Deno.errors.NotFound} If the file doesn't exist
   */
  readFile(path: string): Promise<Uint8Array>;

  /**
   * Walks through the filesystem starting from a root directory.
   *
   * @param root - The root directory to start walking from
   * @yields WalkEntry objects for each file/directory
   */
  walk(root: string): AsyncIterable<WalkEntry>;

  /**
   * Checks if a path is a directory.
   *
   * @param path - The path to check
   * @returns True if the path is a directory
   */
  isDirectory(path: string): boolean;

  /**
   * Checks if a path exists in the filesystem.
   *
   * @param path - The path to check
   * @returns True if the path exists
   */
  exists(path: string): boolean;
}

/**
 * Creates a mock filesystem from a record of file paths and contents.
 *
 * @param files - A record mapping file paths to their contents
 * @returns A FakeFs instance
 *
 * @example
 * ```typescript
 * const fs = createFakeFs({
 *   "/app/config.json": '{"port": 3000}',
 *   "/app/src/main.ts": 'console.log("hello")',
 *   "/app/src/utils.ts": 'export const add = (a, b) => a + b',
 * });
 *
 * const config = await fs.readTextFile("/app/config.json");
 * // config = '{"port": 3000}'
 *
 * for await (const entry of fs.walk("/app/src")) {
 *   console.log(entry.path); // "/app/src/main.ts", "/app/src/utils.ts"
 * }
 * ```
 */
export const createFakeFs = (files: Record<string, string>): FakeFs => {
  const paths = Object.keys(files);
  const encoder = new TextEncoder();

  // Compute all directories implicitly from file paths
  const directories = new Set<string>();
  for (const filePath of paths) {
    const parts = filePath.split("/");
    let current = "";
    for (let i = 0; i < parts.length - 1; i++) {
      current += (i > 0 ? "/" : "") + parts[i];
      if (current) {
        directories.add(current);
      }
    }
  }

  return {
    // deno-lint-ignore require-await
    async readTextFile(path: string): Promise<string> {
      const content = files[path];
      if (content !== undefined) {
        return content;
      }

      throw new Deno.errors.NotFound(`File not found: ${path}`);
    },

    // deno-lint-ignore require-await
    async readFile(path: string): Promise<Uint8Array> {
      const content = files[path];
      if (content !== undefined) {
        return encoder.encode(content);
      }

      throw new Deno.errors.NotFound(`File not found: ${path}`);
    },

    async *walk(root: string): AsyncIterable<WalkEntry> {
      const normalizedRoot = root.endsWith("/") ? root.slice(0, -1) : root;

      for (const filePath of paths) {
        if (
          filePath.startsWith(`${normalizedRoot}/`) ||
          filePath === normalizedRoot
        ) {
          const name = filePath.split("/").pop() ?? filePath;
          yield {
            path: filePath,
            isDirectory: false,
            isFile: true,
            name,
          };
        }
      }
    },

    isDirectory(path: string): boolean {
      const normalizedPath = path.endsWith("/") ? path.slice(0, -1) : path;
      return directories.has(normalizedPath) ||
        paths.some((p) => p.startsWith(`${normalizedPath}/`));
    },

    exists(path: string): boolean {
      const normalizedPath = path.endsWith("/") ? path.slice(0, -1) : path;
      return path in files || directories.has(normalizedPath);
    },
  };
};
