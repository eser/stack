// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// =============================================================================
// Core Data Unit
// =============================================================================

/**
 * Facts about a chunk: when it was made, what kind of data it holds, which
 * output channel it is for, and any annotations.
 */
export type ChunkMeta = {
  readonly timestamp: number;
  readonly kind: "text" | "structured" | "bytes" | "signal";
  readonly channel?: "stdout" | "stderr";
  readonly annotations?: Readonly<Record<string, unknown>>;
};

/** One unit of data moving through a stream, with its metadata. */
export type Chunk<T = unknown> = {
  readonly data: T;
  readonly meta: ChunkMeta;
};

// =============================================================================
// Stream Primitives
// =============================================================================

/** A named step that transforms chunks; `transform()` creates its stream. */
export type Layer<I = unknown, O = unknown> = {
  readonly name: string;
  readonly transform: () => TransformStream<Chunk<I>, Chunk<O>>;
};

/** A named stream of chunks to read from. */
export type Source<T = unknown> = {
  readonly name: string;
  readonly readable: ReadableStream<Chunk<T>>;
};

/** A named stream of chunks to write to. */
export type Sink<T = unknown> = {
  readonly name: string;
  readonly writable: WritableStream<Chunk<T>>;
};

// =============================================================================
// High-Level APIs
// =============================================================================

/**
 * What an `Output` passes to its error handler: the error, the index of the
 * chunk that failed, how many chunks were still queued, and the last chunk.
 */
export type ErrorContext = {
  readonly error: unknown;
  readonly chunkIndex: number;
  readonly pendingCount: number;
  readonly lastChunk: Chunk | undefined;
};

/** Receives a write failure of an `Output`. */
export type ErrorHandler = (context: ErrorContext) => void;

/**
 * Options for `output()`: the sink to write to (a buffer when absent), the
 * renderer (plain text when absent), layers between them, and the error
 * handler.
 */
export type OutputOptions = {
  readonly sink?: Sink;
  readonly renderer?: import("./renderers/types.ts").Renderer;
  readonly layers?: readonly Layer[];
  readonly onError?: ErrorHandler;
};

/**
 * Writes spans through a renderer to a sink. `write` and `writeln` return at
 * once and queue the rendered text; `flush` waits until the queue is written,
 * `close` flushes and closes the sink, and `pipe` returns an output with more
 * layers.
 */
export type Output = {
  readonly write: (...args: import("./span.ts").SpanInput[]) => void;
  readonly writeln: (...args: import("./span.ts").SpanInput[]) => void;
  readonly flush: () => Promise<void>;
  readonly close: () => Promise<void>;
  readonly pipe: (...layers: Layer[]) => Output;
};

/** Options for `Pipeline.run()`: a timeout in milliseconds. */
export type PipelineOptions = {
  readonly timeout?: number;
};

/**
 * A stream pipeline: `from` sets the source, `through` adds layers, `to` sets
 * the sink, `run` streams everything, and `collect` runs into a buffer and
 * returns the data.
 */
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

/** The callbacks of one layer instance, as for a `TransformStream`. */
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

/**
 * A named layer whose `create()` returns fresh callbacks each time the layer
 * is used.
 */
export type LayerDefinition<I = unknown, O = unknown> = {
  readonly name: string;
  readonly create: () => LayerTransformer<I, O>;
};

// =============================================================================
// Errors
// =============================================================================

/** Base class of the errors this package throws. */
export class StreamError extends Error {
  /** Creates the error with a message that says what failed. */
  constructor(message: string) {
    super(message);
    this.name = "StreamError";
  }
}

/** Thrown when a pipeline is incomplete or fails while streaming. */
export class PipelineError extends StreamError {
  /** The error that made the pipeline fail, if any. */
  public override cause?: Error;

  /**
   * Creates the error.
   *
   * @param message - What failed
   * @param cause - The underlying error, if any
   */
  constructor(message: string, cause?: Error) {
    super(message);
    this.name = "PipelineError";
    this.cause = cause;
  }
}

/** Thrown when a pipeline runs past its timeout. */
export class TimeoutError extends StreamError {
  /** Creates the error for a timeout of `timeoutMs` milliseconds. */
  constructor(timeoutMs: number) {
    super(`Pipeline timed out after ${timeoutMs}ms`);
    this.name = "TimeoutError";
  }
}
