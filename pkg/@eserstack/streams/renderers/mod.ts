// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The built-in renderers, which turn a span tree into a string: `ansi()` for
 * terminals, `markdown()` and `plain()`. Implement `Renderer<T>` to render
 * spans into another output type.
 *
 * @example
 * ```typescript
 * import * as renderers from "@eserstack/streams/renderers";
 * import * as span from "@eserstack/streams/span";
 *
 * const spans = [span.bold("Build"), span.text(" finished")];
 * const text = renderers.plain().render(spans); // "Build finished"
 * ```
 *
 * @module
 */

export { ansi } from "./ansi.ts";
export { markdown } from "./markdown.ts";
export { plain } from "./plain.ts";
export type { Renderer } from "./types.ts";
// The span types Renderer refers to, also exported here so the API reference
// of this entry point can link them. They are the same types as in `span`.
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
  StrikethroughSpan,
  TableSpan,
  TextSpan,
  UnderlineSpan,
} from "../span.ts";
