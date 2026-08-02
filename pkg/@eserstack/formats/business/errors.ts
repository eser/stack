// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

export class FormatFfiError extends Error {
  readonly code: string;
  override readonly cause?: unknown;

  constructor(message: string, code: string, cause?: unknown) {
    super(message);
    this.name = "FormatFfiError";
    this.code = code;
    this.cause = cause;
  }
}

export const FORMAT_ENCODE_FAILED = "FORMAT_ENCODE_FAILED";
export const FORMAT_DECODE_FAILED = "FORMAT_DECODE_FAILED";
export const FORMAT_NOT_FOUND = "FORMAT_NOT_FOUND";
export const FORMAT_LIST_FAILED = "FORMAT_LIST_FAILED";
