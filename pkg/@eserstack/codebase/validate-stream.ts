// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Streaming validator run via the Go FFI bridge.
 *
 * Returns an `AsyncIterable<ValidatorResult>` backed by `EserAjanCodebaseValidateFilesStream*`.
 * Each yielded item is one validator's result. Supports `await using` / `Symbol.asyncDispose`.
 *
 * @module
 */

import { ensureLib, getLib } from "./ffi-client.ts";
import type { ValidatorResult } from "./validation/types.ts";

// =============================================================================
// Types
// =============================================================================

export type ValidateStreamOptions = {
  readonly dir?: string;
  readonly validators?: readonly string[];
  readonly extensions?: readonly string[];
  readonly validatorOptions?: Record<string, unknown>;
  readonly gitAware?: boolean;
};

// =============================================================================
// ValidateStream
// =============================================================================

export class ValidateStream
  implements AsyncIterable<ValidatorResult>, AsyncDisposable {
  readonly #handle: string;

  constructor(handle: string) {
    this.#handle = handle;
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<ValidatorResult> {
    const lib = getLib();
    if (lib === null) {
      throw new Error(
        "FFI library unavailable — cannot iterate validate stream",
      );
    }

    while (true) {
      const raw = lib.symbols.EserAjanCodebaseValidateFilesStreamRead(
        this.#handle,
      );

      if (raw === "null") {
        break;
      }

      const parsed = JSON.parse(raw) as {
        name?: string;
        passed?: boolean;
        issues?: Array<{
          severity?: string;
          file?: string;
          line?: number;
          message?: string;
        }>;
        filesChecked?: number;
        error?: string;
      };

      if (parsed.error !== undefined) {
        throw new Error(`validate stream error: ${parsed.error}`);
      }

      yield {
        name: parsed.name ?? "",
        passed: parsed.passed ?? true,
        issues: (parsed.issues ?? []).map((iss) => ({
          severity: (iss.severity ?? "error") as "error" | "warning",
          message: iss.message ?? "",
          file: iss.file,
          line: iss.line,
        })),
        stats: { filesChecked: parsed.filesChecked ?? 0 },
      };
    }
  }

  async [Symbol.asyncDispose](): Promise<void> {
    const lib = getLib();
    if (lib !== null) {
      lib.symbols.EserAjanCodebaseValidateFilesStreamClose(this.#handle);
    }
  }
}

// =============================================================================
// Factory
// =============================================================================

export const validateFilesStream = async (
  options: ValidateStreamOptions = {},
): Promise<ValidateStream> => {
  await ensureLib();
  const lib = getLib();

  if (lib === null) {
    throw new Error(
      "FFI library unavailable — cannot create validate stream",
    );
  }

  const raw = lib.symbols.EserAjanCodebaseValidateFilesStreamCreate(
    JSON.stringify({
      dir: options.dir ?? ".",
      validators: options.validators,
      extensions: options.extensions,
      validatorOptions: options.validatorOptions,
      gitAware: options.gitAware ?? false,
    }),
  );

  const parsed = JSON.parse(raw) as { handle?: string; error?: string };

  if (parsed.error !== undefined || parsed.handle === undefined) {
    throw new Error(
      `validate stream create failed: ${parsed.error ?? "no handle"}`,
    );
  }

  return new ValidateStream(parsed.handle);
};
