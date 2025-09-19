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
  constructor(message: string, public format?: string) {
    super(message);
    this.name = "WriterError";
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
  constructor(message: string, format?: string, public override cause?: Error) {
    super(message);
    this.name = "SerializationError";
    this.format = format;
  }
}

export class DeserializationError extends WriterError {
  constructor(message: string, format?: string, public override cause?: Error) {
    super(message);
    this.name = "DeserializationError";
    this.format = format;
  }
}
