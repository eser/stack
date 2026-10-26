// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Thrown when tokenizing through the Go library fails. `code` says why:
 * `PARSING_INVALID_PATTERN` or `PARSING_TOKENIZE_FAILED`.
 */
export class ParsingError extends Error {
  /** Why tokenizing failed, one of the `PARSING_*` constants. */
  readonly code: string;
  /** The error that caused this one, if any. */
  override readonly cause?: unknown;

  /**
   * Creates the error.
   *
   * @param message - What failed
   * @param code - One of the `PARSING_*` constants
   * @param cause - The underlying error, if any
   */
  constructor(message: string, code: string, cause?: unknown) {
    super(message);
    this.name = "ParsingError";
    this.code = code;
    this.cause = cause;
  }
}

/** Tokenizing failed, or the Go library is not available. */
export const PARSING_TOKENIZE_FAILED = "PARSING_TOKENIZE_FAILED";
/** A token definition's pattern is not a valid regular expression. */
export const PARSING_INVALID_PATTERN = "PARSING_INVALID_PATTERN";
