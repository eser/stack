// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Streaming file walk via the Go FFI bridge.
 *
 * Returns an `AsyncIterable<FileEntry>` backed by `EserAjanCodebaseWalkFilesStream*`.
 * Supports `await using` / `Symbol.asyncDispose` for deterministic cleanup.
 *
 * @module
 */

import { ensureLib, getLib } from "./ffi-client.ts";
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
  readonly #handle: string;

  constructor(handle: string) {
    this.#handle = handle;
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<FileEntry> {
    const lib = getLib();
    if (lib === null) {
      throw new Error("FFI library unavailable — cannot iterate walk stream");
    }

    while (true) {
      const raw = lib.symbols.EserAjanCodebaseWalkFilesStreamRead(
        this.#handle,
      );

      if (raw === "null") {
        break;
      }

      const parsed = JSON.parse(raw) as {
        path?: string;
        name?: string;
        size?: number;
        isSymlink?: boolean;
        error?: string;
      };

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

  async [Symbol.asyncDispose](): Promise<void> {
    const lib = getLib();
    if (lib !== null) {
      lib.symbols.EserAjanCodebaseWalkFilesStreamClose(this.#handle);
    }
  }
}

// =============================================================================
// Factory
// =============================================================================

export const walkFilesStream = async (
  options: WalkStreamOptions = {},
): Promise<WalkStream> => {
  await ensureLib();
  const lib = getLib();

  if (lib === null) {
    throw new Error(
      "FFI library unavailable — cannot create walk stream",
    );
  }

  const raw = lib.symbols.EserAjanCodebaseWalkFilesStreamCreate(
    JSON.stringify({
      dir: options.dir ?? ".",
      extensions: options.extensions,
      exclude: options.exclude,
      gitAware: options.gitAware ?? false,
    }),
  );

  const parsed = JSON.parse(raw) as { handle?: string; error?: string };

  if (parsed.error !== undefined || parsed.handle === undefined) {
    throw new Error(
      `walk stream create failed: ${parsed.error ?? "no handle"}`,
    );
  }

  return new WalkStream(parsed.handle);
};
