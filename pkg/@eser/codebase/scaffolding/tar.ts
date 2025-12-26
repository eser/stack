// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Tarball extraction utility for scaffolding
 *
 * Uses @std/tar for cross-platform extraction without external dependencies.
 *
 * @module
 */

import * as tar from "@std/tar/untar-stream";
import * as path from "@std/path";
import * as fs from "@std/fs";

export type ExtractOptions = {
  /** Number of leading path components to strip (like tar --strip-components) */
  stripComponents?: number;
  /** Only extract files under this subpath */
  subpath?: string;
};

/**
 * Extract a tarball stream to a target directory
 *
 * @param stream - ReadableStream of tarball data (may be gzipped)
 * @param targetDir - Directory to extract files into
 * @param options - Extraction options
 */
export const extractTarball = async (
  stream: ReadableStream<Uint8Array>,
  targetDir: string,
  options: ExtractOptions = {},
): Promise<void> => {
  const { stripComponents = 0, subpath } = options;

  // Normalize the subpath for matching
  const normalizedSubpath = subpath !== undefined
    ? path.normalize(subpath).replace(/^\/+/, "")
    : undefined;

  // Decompress gzip if needed and parse tar
  // Type assertion needed due to DecompressionStream type mismatch in TypeScript
  const decompressed = stream.pipeThrough(
    new DecompressionStream("gzip") as unknown as TransformStream<
      Uint8Array,
      Uint8Array
    >,
  );
  const untarStream = decompressed.pipeThrough(new tar.UntarStream());

  for await (const entry of untarStream) {
    // Normalize and validate the entry path
    const entryPath = path.normalize(entry.path);

    // Security: Prevent path traversal attacks
    if (entryPath.startsWith("..") || path.isAbsolute(entryPath)) {
      // Skip entries that try to escape the target directory
      if (entry.readable !== undefined) {
        await entry.readable.cancel();
      }
      continue;
    }

    // Strip leading path components
    const parts = entryPath.split(path.SEPARATOR);
    const strippedParts = parts.slice(stripComponents);

    if (strippedParts.length === 0) {
      // Entry is at or above strip level, skip it
      if (entry.readable !== undefined) {
        await entry.readable.cancel();
      }
      continue;
    }

    const strippedPath = strippedParts.join(path.SEPARATOR);

    // Filter by subpath if specified
    if (normalizedSubpath !== undefined) {
      if (!strippedPath.startsWith(normalizedSubpath)) {
        if (entry.readable !== undefined) {
          await entry.readable.cancel();
        }
        continue;
      }
      // Remove subpath prefix
      const relativePath = strippedPath.slice(normalizedSubpath.length)
        .replace(/^\/+/, "");
      if (relativePath === "") {
        if (entry.readable !== undefined) {
          await entry.readable.cancel();
        }
        continue;
      }
    }

    // Calculate final output path
    const outputPath = normalizedSubpath !== undefined
      ? path.join(
        targetDir,
        strippedPath.slice(normalizedSubpath.length).replace(/^\/+/, ""),
      )
      : path.join(targetDir, strippedPath);

    // Create parent directories
    await fs.ensureDir(path.dirname(outputPath));

    // Write file content
    if (entry.readable !== undefined) {
      const file = await Deno.create(outputPath);
      await entry.readable.pipeTo(file.writable);
    }
  }
};
