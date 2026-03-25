// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

export type FormatOptions = {
  pretty?: boolean;
  indent?: number;
  separator?: string;
  headers?: string[];
  delimiter?: string;
  quote?: string;
  encoding?: string;
  [key: string]: unknown;
};

export interface FormatReader {
  push(chunk: string): unknown[];
  flush(): unknown[];
}

export interface Format {
  name: string;
  extensions: string[];
  streamable: boolean;

  // Write direction
  writeStart?: (options?: FormatOptions) => string;
  writeItem: (data: unknown, options?: FormatOptions) => string;
  writeEnd?: (options?: FormatOptions) => string;

  // Read direction
  createReader: (options?: FormatOptions) => FormatReader;
}

export type WriteOptions = FormatOptions & {
  format?: string;
  filename?: string;
};

export interface FormatRegistry {
  register: (format: Format) => void;
  unregister: (name: string) => void;
  get: (nameOrExtension: string) => Format | undefined;
  list: () => Format[];
  has: (nameOrExtension: string) => boolean;
  clear: () => void;
}

export class FormatError extends Error {
  public format?: string;

  constructor(message: string, format?: string) {
    super(message);
    this.name = "FormatError";
    this.format = format;
  }
}

export class FormatNotFoundError extends FormatError {
  constructor(format: string) {
    super(`Format '${format}' not found in registry`);
    this.name = "FormatNotFoundError";
    this.format = format;
  }
}

export class SerializationError extends FormatError {
  public override cause?: Error;

  constructor(message: string, format?: string, cause?: Error) {
    super(message);
    this.name = "SerializationError";
    this.format = format;
    this.cause = cause;
  }
}

export class DeserializationError extends FormatError {
  public override cause?: Error;

  constructor(message: string, format?: string, cause?: Error) {
    super(message);
    this.name = "DeserializationError";
    this.format = format;
    this.cause = cause;
  }
}
