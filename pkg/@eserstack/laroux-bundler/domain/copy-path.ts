// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Recursive copy on top of the runtime file system, which copies single
 * files only.
 *
 * @module
 */

import { runtime } from "@eserstack/standards/cross-runtime";

/**
 * Copy a file or a directory tree to dest, overwriting files that exist
 * there. Symbolic links are followed, so their targets are copied. Copying a
 * file onto a directory, or a directory onto a file, fails.
 *
 * @param src - File or directory to copy
 * @param dest - Path the copy is written to
 */
export async function copyPath(src: string, dest: string): Promise<void> {
  const info = await runtime.fs.stat(src);

  if (!info.isDirectory) {
    await runtime.fs.ensureDir(runtime.path.dirname(dest));
    await runtime.fs.copyFile(src, dest);
    return;
  }

  await runtime.fs.ensureDir(dest);
  for await (const entry of runtime.fs.readDir(src)) {
    // One entry at a time keeps open file handles bounded in a large tree
    await copyPath(
      runtime.path.join(src, entry.name),
      runtime.path.join(dest, entry.name),
    );
  }
}
