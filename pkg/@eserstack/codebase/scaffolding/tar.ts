// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Tarball extraction utility for scaffolding
 *
 * Uses @std/tar for cross-platform extraction without external dependencies.
 *
 * @module
 */

import * as tar from "@std/tar/untar-stream";
import { runtime } from "@eserstack/standards/cross-runtime";

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
    ? runtime.path.normalize(subpath).replace(/^\/+/, "")
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
    const entryPath = runtime.path.normalize(entry.path);

    // Security: Prevent path traversal attacks
    if (entryPath.startsWith("..") || runtime.path.isAbsolute(entryPath)) {
      // Skip entries that try to escape the target directory
      if (entry.readable !== undefined) {
        await entry.readable.cancel();
      }
      continue;
    }

    // Strip leading path components
    const parts = entryPath.split(runtime.path.sep);
    const strippedParts = parts.slice(stripComponents);

    if (strippedParts.length === 0) {
      // Entry is at or above strip level, skip it
      if (entry.readable !== undefined) {
        await entry.readable.cancel();
      }
      continue;
    }

    const strippedPath = strippedParts.join(runtime.path.sep);

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
      ? runtime.path.join(
        targetDir,
        strippedPath.slice(normalizedSubpath.length).replace(/^\/+/, ""),
      )
      : runtime.path.join(targetDir, strippedPath);

    // Create parent directories
    await runtime.fs.ensureDir(runtime.path.dirname(outputPath));

    // Write file content
    if (entry.readable !== undefined) {
      // Collect stream to Uint8Array and write using runtime.fs
      const response = new Response(entry.readable);
      const buffer = new Uint8Array(await response.arrayBuffer());
      await runtime.fs.writeFile(outputPath, buffer);
    }
  }
};
