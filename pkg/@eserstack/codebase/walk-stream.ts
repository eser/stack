// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Streaming file walk via the Go FFI bridge.
 *
 * Returns an `AsyncIterable<FileEntry>` backed by the bridge's
 * `codebaseWalkFilesStream` stream.
 * Supports `await using` / `Symbol.asyncDispose` for deterministic cleanup.
 *
 * @module
 */

import type * as ffiTypes from "@eserstack/ajan/ffi";
import * as ffiClient from "./ffi-client.ts";
import type { FileEntry } from "./file-tools-shared.ts";

// =============================================================================
// Types
// =============================================================================

export type WalkStreamOptions = {
  readonly dir?: string;
  readonly extensions?: readonly string[];
  readonly exclude?: readonly string[];
  readonly gitAware?: boolean;
};

// =============================================================================
// WalkStream
// =============================================================================

export class WalkStream implements AsyncIterable<FileEntry>, AsyncDisposable {
  readonly #stream: ffiTypes.AjanStream<"codebaseWalkFilesStream">;

  constructor(stream: ffiTypes.AjanStream<"codebaseWalkFilesStream">) {
    this.#stream = stream;
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<FileEntry> {
    while (true) {
      const parsed = this.#stream.read();

      if (parsed === null) {
        break;
      }

      if (parsed.error !== undefined) {
        throw new Error(`walk stream error: ${parsed.error}`);
      }

      yield {
        path: parsed.path ?? "",
        name: parsed.name ?? "",
        size: parsed.size ?? 0,
        isSymlink: parsed.isSymlink ?? false,
      };
    }
  }

  [Symbol.asyncDispose](): Promise<void> {
    this.#stream.close();
    return Promise.resolve();
  }
}

// =============================================================================
// Factory
// =============================================================================

export const walkFilesStream = async (
  options: WalkStreamOptions = {},
): Promise<WalkStream> => {
  await ffiClient.ensureLib();
  const lib = ffiClient.getLib();

  if (lib === null) {
    throw new Error("FFI library unavailable — cannot create walk stream");
  }

  const stream = lib.stream("codebaseWalkFilesStream", {
    dir: options.dir ?? ".",
    extensions: options.extensions,
    exclude: options.exclude,
    gitAware: options.gitAware ?? false,
  });
  const parsed = stream.opened;

  if (parsed.error !== undefined || parsed.handle === undefined) {
    throw new Error(
      `walk stream create failed: ${parsed.error ?? "no handle"}`,
    );
  }

  return new WalkStream(stream);
};
