// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// =============================================================================
// Core Data Unit
// =============================================================================

export type ChunkMeta = {
  readonly timestamp: number;
  readonly kind: "text" | "structured" | "bytes" | "signal";
  readonly channel?: "stdout" | "stderr";
  readonly annotations?: Readonly<Record<string, unknown>>;
};

export type Chunk<T = unknown> = {
  readonly data: T;
  readonly meta: ChunkMeta;
};

// =============================================================================
// Stream Primitives
// =============================================================================

export type Layer<I = unknown, O = unknown> = {
  readonly name: string;
  readonly transform: () => TransformStream<Chunk<I>, Chunk<O>>;
};

export type Source<T = unknown> = {
  readonly name: string;
  readonly readable: ReadableStream<Chunk<T>>;
};

export type Sink<T = unknown> = {
  readonly name: string;
  readonly writable: WritableStream<Chunk<T>>;
};

// =============================================================================
// High-Level APIs
// =============================================================================

export type ErrorContext = {
  readonly error: unknown;
  readonly chunkIndex: number;
  readonly pendingCount: number;
  readonly lastChunk: Chunk | undefined;
};

export type ErrorHandler = (context: ErrorContext) => void;

export type OutputOptions = {
  readonly sink?: Sink;
  readonly renderer?: import("./renderers/types.ts").Renderer;
  readonly layers?: readonly Layer[];
  readonly onError?: ErrorHandler;
};

export type Output = {
  readonly write: (...args: import("./span.ts").SpanInput[]) => void;
  readonly writeln: (...args: import("./span.ts").SpanInput[]) => void;
  readonly flush: () => Promise<void>;
  readonly close: () => Promise<void>;
  readonly pipe: (...layers: Layer[]) => Output;
};

export type PipelineOptions = {
  readonly timeout?: number;
};

export type Pipeline = {
  readonly from: (source: Source) => Pipeline;
  readonly through: (...layers: Layer[]) => Pipeline;
  readonly to: (sink: Sink) => Pipeline;
  readonly run: (options?: PipelineOptions) => Promise<void>;
  readonly collect: <T = unknown>() => Promise<T[]>;
};

// =============================================================================
// Layer Definition Helper
// =============================================================================

export type LayerTransformer<I = unknown, O = unknown> = {
  readonly start?: (
    controller: TransformStreamDefaultController<Chunk<O>>,
  ) => void | Promise<void>;
  readonly transform: (
    chunk: Chunk<I>,
    controller: TransformStreamDefaultController<Chunk<O>>,
  ) => void | Promise<void>;
  readonly flush?: (
    controller: TransformStreamDefaultController<Chunk<O>>,
  ) => void | Promise<void>;
};

export type LayerDefinition<I = unknown, O = unknown> = {
  readonly name: string;
  readonly create: () => LayerTransformer<I, O>;
};

// =============================================================================
// Errors
// =============================================================================

export class StreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StreamError";
  }
}

export class PipelineError extends StreamError {
  public override cause?: Error;

  constructor(message: string, cause?: Error) {
    super(message);
    this.name = "PipelineError";
    this.cause = cause;
  }
}

export class TimeoutError extends StreamError {
  constructor(timeoutMs: number) {
    super(`Pipeline timed out after ${timeoutMs}ms`);
    this.name = "TimeoutError";
  }
}
