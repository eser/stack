// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Stream primitives on the Web Streams API: sources produce chunks, layers
 * transform them and sinks consume them. `output()` writes spans through a
 * renderer (ANSI, Markdown or plain text) to a sink, and `pipeline()` connects
 * a source, layers and a sink.
 *
 * @example
 * ```typescript
 * import * as streams from "@eserstack/streams";
 *
 * const out = streams.output({
 *   renderer: streams.renderers.ansi(),
 *   sink: streams.sinks.stdout(),
 * });
 *
 * out.writeln(streams.span.bold("Build"), " finished");
 * await out.close();
 * ```
 *
 * @module
 */

// Core types
export type {
  Chunk,
  ChunkMeta,
  ErrorContext,
  ErrorHandler,
  Layer,
  LayerDefinition,
  LayerTransformer,
  Output,
  OutputOptions,
  Pipeline,
  PipelineOptions,
  Sink,
  Source,
} from "./types.ts";
export { PipelineError, StreamError, TimeoutError } from "./types.ts";

// Chunk creation utility
export { createChunk } from "./chunk.ts";

// Layer definition helper
export { defineLayer } from "./define-layer.ts";

// High-level APIs
export { output } from "./output.ts";
export { pipeline } from "./pipeline.ts";

/** Sinks: stdout, stderr, buffer, null, writable and multiplex. */
export * as sinks from "./sinks/mod.ts";

/** Sources: stdin, readable, values and events. */
export * as sources from "./sources/mod.ts";

/** Layers: map, filter, tap and tee. */
export * as layers from "./layers/mod.ts";

// Span-based formatting
export * as span from "./span.ts";
// The span types Output and Renderer refer to, also exported at the root so
// the API reference can link them. They are the same types as in `span`.
export type {
  AlertSpan,
  BoldSpan,
  CodeBlockSpan,
  ColorSpan,
  DimSpan,
  GaugeSpan,
  GroupSpan,
  ItalicSpan,
  ListSpan,
  NewlineSpan,
  SeparatorSpan,
  Span,
  SpanInput,
  StrikethroughSpan,
  TableSpan,
  TextSpan,
  UnderlineSpan,
} from "./span.ts";

/** Renderers: ansi, markdown and plain. */
export * as renderers from "./renderers/mod.ts";
export type { Renderer } from "./renderers/types.ts";
