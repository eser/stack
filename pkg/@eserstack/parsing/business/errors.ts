// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

export class ParsingError extends Error {
  readonly code: string;
  override readonly cause?: unknown;

  constructor(message: string, code: string, cause?: unknown) {
    super(message);
    this.name = "ParsingError";
    this.code = code;
    this.cause = cause;
  }
}

export const PARSING_TOKENIZE_FAILED = "PARSING_TOKENIZE_FAILED";
export const PARSING_INVALID_PATTERN = "PARSING_INVALID_PATTERN";
