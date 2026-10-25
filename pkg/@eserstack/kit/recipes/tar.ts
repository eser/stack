// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Tarball extraction utility for kit recipes
 *
 * Uses @std/tar for cross-platform extraction without external dependencies.
 * Archives come from untrusted repositories, so extraction writes regular
 * files only, keeps every path inside the target directory, and stops at a
 * byte and an entry limit.
 *
 * @module
 */

import * as tar from "@std/tar/untar-stream";
import { runtime } from "@eserstack/standards/cross-runtime";

/**
 * Default upper bound on the decompressed archive size: 256 MiB. For scale,
 * `git archive HEAD | wc -c` on eser/stack, a large monorepo, gives about
 * 13 MiB; GitHub serves tarballs in the same format.
 */
export const DEFAULT_MAX_BYTES: number = 256 * 1024 * 1024;

/**
 * Default upper bound on the number of archive entries. For scale,
 * `git archive HEAD | tar -t | wc -l` on eser/stack gives about 2,400.
 */
export const DEFAULT_MAX_ENTRIES = 20_000;

/**
 * Tar typeflags of regular files: "0" (UntarStream also maps NUL to it) and
 * "7" (contiguous file). Every other entry (directories, links, devices,
 * FIFOs, pax and GNU metadata) is skipped, and directories are created on
 * demand for the files inside them.
 */
const REGULAR_FILE_TYPEFLAGS: ReadonlySet<string> = new Set(["0", "7"]);

export type ExtractOptions = {
  /** Number of leading path components to strip (like tar --strip-components) */
  readonly stripComponents?: number;
  /** Only extract files under this subpath */
  readonly subpath?: string;
  /**
   * Maximum number of decompressed bytes read from the archive, tar headers
   * included. Entries that `subpath` filters out count too, since they are
   * decompressed as well. Defaults to {@link DEFAULT_MAX_BYTES}.
   */
  readonly maxBytes?: number;
  /**
   * Maximum number of entries read from the archive, including directories,
   * links, metadata and entries that `subpath` filters out. Defaults to
   * {@link DEFAULT_MAX_ENTRIES}.
   */
  readonly maxEntries?: number;
};

/** The extraction limit an archive went past. */
export type TarballLimit = "maxBytes" | "maxEntries";

/**
 * Thrown when an archive goes past `maxBytes` or `maxEntries`. Files written
 * before the limit was reached stay in the target directory; the caller
 * extracts into a temporary directory and removes it.
 */
export class TarballLimitError extends Error {
  /** The option whose limit was exceeded */
  readonly limit: TarballLimit;
  /** The value of that option during extraction */
  readonly max: number;

  constructor(limit: TarballLimit, max: number, options?: ErrorOptions) {
    const measure =
      limit === "maxBytes"
        ? `decompressed size exceeds ${limit} (${max} bytes)`
        : `entry count exceeds ${limit} (${max})`;
    const fix = `check that the specifier names the intended repository and ref, or raise ${limit} for an archive you trust`;
    super(
      `extract tarball: ${measure}; a recipe template should be far smaller, so ${fix}`,
      options,
    );
    this.name = "TarballLimitError";
    this.limit = limit;
    this.max = max;
  }
}

const assertLimit = (name: TarballLimit, value: number): void => {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(
      `extract tarball: ${name} is ${value}; expected a positive integer`,
    );
  }
};

/**
 * Passes bytes through until more than `maxBytes` have arrived, then errors
 * the stream with a TarballLimitError (io.LimitReader in Go).
 */
const limitBytes = (
  maxBytes: number,
): TransformStream<Uint8Array, Uint8Array> => {
  let total = 0;

  return new TransformStream({
    transform(chunk, controller) {
      total += chunk.byteLength;
      if (total > maxBytes) {
        controller.error(new TarballLimitError("maxBytes", maxBytes));
        return;
      }

      controller.enqueue(chunk);
    },
  });
};

/** Reads an entry's content into memory; its size is bounded by maxBytes. */
const readContent = async (
  readable: ReadableStream<Uint8Array>,
): Promise<Uint8Array> => {
  // Iterating the stream directly, instead of `new Response(readable)`, keeps
  // a TarballLimitError raised mid-entry as the error the caller receives.
  const chunks: Uint8Array[] = [];
  let length = 0;
  for await (const chunk of readable) {
    chunks.push(chunk);
    length += chunk.byteLength;
  }

  const content = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    content.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return content;
};

/**
 * Maps an archive path to its path relative to the target directory, or
 * returns null when the entry is not extracted: it escapes the target, sits
 * at or above the strip level, or lies outside the subpath.
 */
const resolveEntryPath = (
  archivePath: string,
  stripComponents: number,
  subpath: string | undefined,
): string | null => {
  const entryPath = runtime.path.normalize(archivePath);

  // Security: Prevent path traversal attacks
  if (entryPath.startsWith("..") || runtime.path.isAbsolute(entryPath)) {
    return null;
  }

  const strippedParts = entryPath
    .split(runtime.path.sep)
    .slice(stripComponents);
  if (strippedParts.length === 0) {
    return null;
  }

  const strippedPath = strippedParts.join(runtime.path.sep);
  if (subpath === undefined) {
    return strippedPath;
  }

  // Match on a segment boundary, so subpath "include" does not also take
  // "include-extra/".
  const prefix = `${subpath}${runtime.path.sep}`;
  if (!strippedPath.startsWith(prefix)) {
    return null;
  }

  const relativePath = strippedPath.slice(prefix.length);

  return relativePath === "" ? null : relativePath;
};

/**
 * Extract a gzipped tarball stream to a target directory.
 *
 * Only regular files are written. Symlinks, hardlinks, devices, FIFOs and
 * metadata entries are skipped, and entries whose path escapes the target
 * directory are dropped.
 *
 * @param stream - ReadableStream of gzipped tarball data
 * @param targetDir - Directory to extract files into
 * @param options - Extraction options
 * @throws {TarballLimitError} When the archive goes past maxBytes or
 *   maxEntries; the source stream is cancelled.
 * @throws {RangeError} When maxBytes or maxEntries is not a positive integer;
 *   the source stream is cancelled.
 */
export const extractTarball = async (
  stream: ReadableStream<Uint8Array>,
  targetDir: string,
  options: ExtractOptions = {},
): Promise<void> => {
  const {
    stripComponents = 0,
    subpath,
    maxBytes = DEFAULT_MAX_BYTES,
    maxEntries = DEFAULT_MAX_ENTRIES,
  } = options;

  try {
    assertLimit("maxBytes", maxBytes);
    assertLimit("maxEntries", maxEntries);
  } catch (error) {
    // The caller handed the stream over; release it (and the download behind
    // it) instead of leaving it unread.
    await stream.cancel();
    throw error;
  }

  // Normalize the subpath for matching, without leading or trailing separators.
  // A subpath that names the archive root ("", "/", ".", from a specifier
  // such as gh:owner/repo/) extracts everything, as no subpath does.
  const trimmedSubpath =
    subpath !== undefined
      ? runtime.path.normalize(subpath).replace(/^[/\\]+|[/\\]+$/g, "")
      : "";
  const normalizedSubpath =
    trimmedSubpath !== "" && trimmedSubpath !== "."
      ? trimmedSubpath
      : undefined;

  // Aborted when extraction stops: cancels the source stream (and with it the
  // download) when the loop exits early, and is a no-op after a full read.
  const pipeline = new AbortController();

  // Type assertion needed due to DecompressionStream type mismatch in TypeScript
  const entries = stream
    .pipeThrough(
      new DecompressionStream("gzip") as unknown as TransformStream<
        Uint8Array,
        Uint8Array
      >,
      { signal: pipeline.signal },
    )
    .pipeThrough(limitBytes(maxBytes))
    .pipeThrough(new tar.UntarStream());

  let entryCount = 0;

  try {
    for await (const entry of entries) {
      entryCount += 1;
      if (entryCount > maxEntries) {
        throw new TarballLimitError("maxEntries", maxEntries);
      }

      const relativePath = REGULAR_FILE_TYPEFLAGS.has(entry.header.typeflag)
        ? resolveEntryPath(entry.path, stripComponents, normalizedSubpath)
        : null;

      if (relativePath === null) {
        // UntarStream yields the next entry only after this one's content is
        // consumed or cancelled.
        await entry.readable?.cancel();
        continue;
      }

      const outputPath = runtime.path.join(targetDir, relativePath);
      await runtime.fs.ensureDir(runtime.path.dirname(outputPath));

      const content =
        entry.readable !== undefined
          ? await readContent(entry.readable)
          : new Uint8Array(0);
      await runtime.fs.writeFile(outputPath, content);
    }
  } finally {
    pipeline.abort();
  }
};
