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

export interface WriterFormat {
  name: string;
  extensions: string[];
  serialize: (data: unknown, options?: FormatOptions) => string;
}

export type WriteOptions = FormatOptions & {
  format?: string;
  filename?: string;
};

export interface FormatRegistry {
  register: (format: WriterFormat) => void;
  unregister: (name: string) => void;
  get: (nameOrExtension: string) => WriterFormat | undefined;
  list: () => WriterFormat[];
  has: (nameOrExtension: string) => boolean;
}

export class WriterError extends Error {
  public format?: string;

  constructor(message: string, format?: string) {
    super(message);
    this.name = "WriterError";
    this.format = format;
  }
}

export class FormatNotFoundError extends WriterError {
  constructor(format: string) {
    super(`Format '${format}' not found in registry`);
    this.name = "FormatNotFoundError";
    this.format = format;
  }
}

export class SerializationError extends WriterError {
  public override cause?: Error;

  constructor(message: string, format?: string, cause?: Error) {
    super(message);
    this.name = "SerializationError";
    this.format = format;
    this.cause = cause;
  }
}

export class DeserializationError extends WriterError {
  public override cause?: Error;

  constructor(message: string, format?: string, cause?: Error) {
    super(message);
    this.name = "DeserializationError";
    this.format = format;
    this.cause = cause;
  }
}
