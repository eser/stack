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
  writeStart?: (options?: FormatOptions) => string;
  writeItem: (data: unknown, options?: FormatOptions) => string;
  writeEnd?: (options?: FormatOptions) => string;
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
  clear: () => void;
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

export type WriterOptions = {
  readonly type: string;
  readonly name?: string;
  readonly options?: FormatOptions;
};

export type WriterInstance = {
  readonly name?: string;
  readonly start: () => void;
  readonly write: (data: unknown) => void;
  readonly end: () => void;
  readonly clear: () => void;

  // String/bytes output
  readonly string: () => string;
  readonly bytes: () => Uint8Array;

  // Stream output (Web Streams API)
  readonly readable: () => ReadableStream<string>;
  readonly pipeTo: (dest: WritableStream<string>) => Promise<void>;
  readonly pipeToStdout: () => Promise<void>;
};
