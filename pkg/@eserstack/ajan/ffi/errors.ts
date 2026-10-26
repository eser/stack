// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The errors of the dispatcher: an operation that ran no bridge function.
 *
 * A bridge function that fails answers JSON with an `error` field, which
 * `lib.call` returns like any other answer. These errors are for the cases
 * where there is no answer at all, each with the dispatcher's code
 * (dispatch.go).
 *
 * @module
 */

/** An operation the dispatcher refused, with its code. */
export class AjanCallError extends Error {
  /** The dispatcher's code, such as "UNKNOWN_FUNCTION". */
  readonly code: string;
  /** The name or handle the operation targeted. */
  readonly fn: string;

  constructor(fn: string, code: string, message: string) {
    super(message);
    this.name = "AjanCallError";
    this.code = code;
    this.fn = fn;
  }
}

/** A name the loaded library does not serve: a typo or an older library. */
export class UnknownFunctionError extends AjanCallError {
  constructor(fn: string, message: string) {
    super(fn, "UNKNOWN_FUNCTION", message);
    this.name = "UnknownFunctionError";
  }
}

/** A name outside the WASM fallback's profile. */
export class UnsupportedInWasmError extends AjanCallError {
  constructor(fn: string, profile: string) {
    super(
      fn,
      "UNSUPPORTED_IN_WASM",
      `eser-ajan WASM: "${fn}" is not in the ${profile} profile ` +
        `(UNSUPPORTED_IN_WASM). Install the native library (the ` +
        `@eserstack/ajan platform package for this OS and architecture) or ` +
        `set ESER_AJAN_LIB_PATH to an existing build.`,
    );
    this.name = "UnsupportedInWasmError";
  }
}

/** A library whose dispatcher ABI differs from the loader's. */
export class AbiMismatchError extends Error {
  readonly expected: number;
  readonly actual: number | null;

  constructor(path: string, expected: number, actual: number | null) {
    super(
      `eser-ajan library ${path} speaks dispatcher ABI ${
        actual ?? "none"
      }, but this loader speaks ABI ${expected}; use a library and a loader from the same release`,
    );
    this.name = "AbiMismatchError";
    this.expected = expected;
    this.actual = actual;
  }
}
