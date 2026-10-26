// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Streaming validator run via the Go FFI bridge.
 *
 * Returns an `AsyncIterable<ValidatorResult>` backed by the bridge's
 * `codebaseValidateFilesStream` stream.
 * Each yielded item is one validator's result. Supports `await using` / `Symbol.asyncDispose`.
 *
 * @module
 */

import type * as ffiTypes from "@eserstack/ajan/ffi";
import * as ffiClient from "./ffi-client.ts";
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
  implements AsyncIterable<ValidatorResult>, AsyncDisposable
{
  readonly #stream: ffiTypes.AjanStream<"codebaseValidateFilesStream">;

  constructor(stream: ffiTypes.AjanStream<"codebaseValidateFilesStream">) {
    this.#stream = stream;
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<ValidatorResult> {
    while (true) {
      const chunk = this.#stream.read();

      if (chunk === null) {
        break;
      }

      const parsed = chunk as {
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

  [Symbol.asyncDispose](): Promise<void> {
    this.#stream.close();
    return Promise.resolve();
  }
}

// =============================================================================
// Factory
// =============================================================================

export const validateFilesStream = async (
  options: ValidateStreamOptions = {},
): Promise<ValidateStream> => {
  await ffiClient.ensureLib();
  const lib = ffiClient.getLib();

  if (lib === null) {
    throw new Error("FFI library unavailable — cannot create validate stream");
  }

  const stream = lib.stream("codebaseValidateFilesStream", {
    dir: options.dir ?? ".",
    validators: options.validators,
    extensions: options.extensions,
    validatorOptions: options.validatorOptions,
    gitAware: options.gitAware ?? false,
  });
  const parsed = stream.opened;

  if (parsed.error !== undefined || parsed.handle === undefined) {
    throw new Error(
      `validate stream create failed: ${parsed.error ?? "no handle"}`,
    );
  }

  return new ValidateStream(stream);
};
