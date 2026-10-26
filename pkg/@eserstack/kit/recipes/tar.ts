// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Tarball extraction utility for kit recipes
 *
 * Extraction runs on the Go extractor of kitfx (pkg/ajan/kitfx/tar.go)
 * through the eser-ajan native library: the gzipped stream is pushed to it
 * chunk by chunk, so a download is extracted while it arrives. Archives come
 * from untrusted repositories, so extraction writes regular files only, keeps
 * every path inside the target directory, and stops at a byte and an entry
 * limit.
 *
 * @module
 */

import { runtime } from "@eserstack/standards/cross-runtime";
import * as ffiClient from "../ffi-client.ts";

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
   * links, pax global headers and entries that `subpath` filters out. pax and
   * GNU long-name records count as part of the entry they describe. Defaults
   * to {@link DEFAULT_MAX_ENTRIES}.
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

type ExtractAnswer = {
  readonly error?: string;
  readonly limit?: TarballLimit;
  readonly max?: number;
  readonly done?: boolean;
};

/** The error an answer of the Go extractor carries, or null. */
const answerError = (answer: ExtractAnswer | null): Error | null => {
  if (answer === null || answer.error === undefined || answer.error === "") {
    return null;
  }

  if (answer.limit !== undefined && answer.max !== undefined) {
    return new TarballLimitError(answer.limit, answer.max);
  }

  return new Error(answer.error);
};

/** Encodes a chunk for the bridge, whose requests are JSON. */
const toBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }

  return btoa(binary);
};

type Library = NonNullable<ReturnType<typeof ffiClient.getLib>>;

/** Opens the push-fed extraction stream of the Go extractor. */
const openExtraction = (
  lib: Library,
  request: {
    readonly dir: string;
    readonly stripComponents: number;
    readonly subpath: string | undefined;
    readonly maxBytes: number;
    readonly maxEntries: number;
  },
) => lib.stream("kitExtractTarballStream", request);

/**
 * Extract a gzipped tarball stream to a target directory.
 *
 * Only regular files are written. Symlinks, hardlinks, devices, FIFOs and
 * metadata entries are skipped, and entries whose path escapes the target
 * directory are dropped. Directories are created on demand for the files
 * inside them. pax and GNU long-name records are read as part of the entry
 * they describe; a malformed one fails the extraction.
 *
 * @param stream - ReadableStream of gzipped tarball data
 * @param targetDir - Directory to extract files into
 * @param options - Extraction options
 * @throws {TarballLimitError} When the archive goes past maxBytes or
 *   maxEntries; the source stream is cancelled.
 * @throws {RangeError} When maxBytes or maxEntries is not a positive integer;
 *   the source stream is cancelled.
 * @throws {Error} When the eser-ajan native library is unavailable or the
 *   archive is not a valid gzipped tarball; the source stream is cancelled.
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

  await ffiClient.ensureLib();
  const lib = ffiClient.getLib();
  if (lib === null) {
    await stream.cancel();
    const cause = ffiClient.getLoadError();
    throw new Error(
      `extract tarball: the eser-ajan native library is unavailable${
        cause !== null ? `: ${cause.message}` : ""
      }`,
      { cause },
    );
  }

  // The Go extractor resolves the subpath ("", "/" and "." name the archive
  // root). The WASM fallback does not serve it, and opening it there throws.
  let extraction: ReturnType<typeof openExtraction>;
  try {
    extraction = openExtraction(lib, {
      dir: runtime.path.resolve(targetDir),
      stripComponents,
      subpath,
      maxBytes,
      maxEntries,
    });
  } catch (error) {
    await stream.cancel();
    throw error;
  }

  const openError = answerError(extraction.opened);
  if (openError !== null || extraction.handle === "") {
    await stream.cancel();
    throw (
      openError ?? new Error("extract tarball: the extractor did not start")
    );
  }

  /** Pushes one chunk, or the end; reports whether the extraction is done. */
  const push = (chunk: Uint8Array | undefined): boolean => {
    const answer = lib.call("kitExtractTarballStreamPush", {
      handle: extraction.handle,
      chunk: chunk !== undefined ? toBase64(chunk) : undefined,
      end: chunk === undefined,
    });

    const pushError = answerError(answer);
    if (pushError !== null) {
      throw pushError;
    }

    return answer?.done === true;
  };

  try {
    // Leaving this loop early, on an error or at the archive's end blocks
    // (which may come before the end of the stream), cancels the source and
    // with it the download.
    for await (const chunk of stream) {
      if (push(chunk)) {
        return;
      }
    }

    if (!push(undefined)) {
      throw new Error("extract tarball: the archive ended early");
    }
  } finally {
    // Stops an extraction that has not ended, so nothing is written after
    // this returns, and releases the handle.
    extraction.close();
  }
};
