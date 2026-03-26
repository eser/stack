// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Span-based intermediate representation for formatted output.
 *
 * Formatting is declared as a lightweight node tree — renderers serialize
 * it per target format (ANSI for terminals, Markdown for MCP/HTTP,
 * plain text for tests and logs).
 *
 * @module
 */

// =============================================================================
// Span Types — Inline
// =============================================================================

type TextSpan = { readonly kind: "text"; readonly value: string };
type BoldSpan = { readonly kind: "bold"; readonly children: readonly Span[] };
type DimSpan = { readonly kind: "dim"; readonly children: readonly Span[] };
type ItalicSpan = {
  readonly kind: "italic";
  readonly children: readonly Span[];
};
type UnderlineSpan = {
  readonly kind: "underline";
  readonly children: readonly Span[];
};
type StrikethroughSpan = {
  readonly kind: "strikethrough";
  readonly children: readonly Span[];
};
type ColorSpan = {
  readonly kind: "color";
  readonly color: string;
  readonly children: readonly Span[];
};
type GroupSpan = {
  readonly kind: "group";
  readonly children: readonly Span[];
};
type NewlineSpan = { readonly kind: "newline" };

// =============================================================================
// Span Types — Block-level
// =============================================================================

type CodeBlockSpan = {
  readonly kind: "code-block";
  readonly language?: string;
  readonly value: string;
};

type TableSpan = {
  readonly kind: "table";
  readonly headers: readonly Span[];
  readonly rows: readonly (readonly Span[])[];
};

type ListSpan = {
  readonly kind: "list";
  readonly items: readonly (readonly Span[])[];
};

// =============================================================================
// Union type
// =============================================================================

type Span =
  | TextSpan
  | BoldSpan
  | DimSpan
  | ItalicSpan
  | UnderlineSpan
  | StrikethroughSpan
  | ColorSpan
  | GroupSpan
  | NewlineSpan
  | CodeBlockSpan
  | TableSpan
  | ListSpan;

type SpanInput = string | Span;

// =============================================================================
// Normalize helper
// =============================================================================

const normalize = (inputs: readonly SpanInput[]): Span[] =>
  inputs.map((i) => typeof i === "string" ? text(i) : i);

// =============================================================================
// Inline constructors
// =============================================================================

const text = (value: string): TextSpan => ({ kind: "text", value });

const bold = (...children: SpanInput[]): BoldSpan => ({
  kind: "bold",
  children: normalize(children),
});

const dim = (...children: SpanInput[]): DimSpan => ({
  kind: "dim",
  children: normalize(children),
});

const italic = (...children: SpanInput[]): ItalicSpan => ({
  kind: "italic",
  children: normalize(children),
});

const underline = (...children: SpanInput[]): UnderlineSpan => ({
  kind: "underline",
  children: normalize(children),
});

const strikethrough = (...children: SpanInput[]): StrikethroughSpan => ({
  kind: "strikethrough",
  children: normalize(children),
});

const group = (...children: SpanInput[]): GroupSpan => ({
  kind: "group",
  children: normalize(children),
});

const nl = (): NewlineSpan => ({ kind: "newline" });

// Color constructors
const color = (c: string, ...children: SpanInput[]): ColorSpan => ({
  kind: "color",
  color: c,
  children: normalize(children),
});

const red = (...children: SpanInput[]): ColorSpan => color("red", ...children);
const green = (...children: SpanInput[]): ColorSpan =>
  color("green", ...children);
const yellow = (...children: SpanInput[]): ColorSpan =>
  color("yellow", ...children);
const blue = (...children: SpanInput[]): ColorSpan =>
  color("blue", ...children);
const magenta = (...children: SpanInput[]): ColorSpan =>
  color("magenta", ...children);
const cyan = (...children: SpanInput[]): ColorSpan =>
  color("cyan", ...children);
const gray = (...children: SpanInput[]): ColorSpan =>
  color("gray", ...children);
const white = (...children: SpanInput[]): ColorSpan =>
  color("white", ...children);

// =============================================================================
// Block-level constructors
// =============================================================================

const codeBlock = (value: string, language?: string): CodeBlockSpan => ({
  kind: "code-block",
  language,
  value,
});

const table = (
  headers: readonly SpanInput[],
  rows: readonly (readonly SpanInput[])[],
): TableSpan => ({
  kind: "table",
  headers: normalize(headers),
  rows: rows.map((row) => normalize(row)),
});

const list = (items: readonly (readonly SpanInput[])[]): ListSpan => ({
  kind: "list",
  items: items.map((row) => normalize(row)),
});

// =============================================================================
// Measurement — plain text length of a span (strips all formatting)
// =============================================================================

const plainLength = (s: Span): number => {
  switch (s.kind) {
    case "text":
      return s.value.length;
    case "newline":
      return 1;
    case "bold":
    case "dim":
    case "italic":
    case "underline":
    case "strikethrough":
    case "color":
    case "group":
      return s.children.reduce((sum, child) => sum + plainLength(child), 0);
    case "code-block":
      return s.value.length;
    case "table":
    case "list":
      return 0; // nested blocks don't contribute to inline length
  }
};

// =============================================================================
// Exports
// =============================================================================

export {
  blue,
  bold,
  codeBlock,
  color,
  cyan,
  dim,
  gray,
  green,
  group,
  italic,
  list,
  magenta,
  nl,
  normalize,
  plainLength,
  red,
  strikethrough,
  table,
  text,
  underline,
  white,
  yellow,
};

export type {
  BoldSpan,
  CodeBlockSpan,
  ColorSpan,
  DimSpan,
  GroupSpan,
  ItalicSpan,
  ListSpan,
  NewlineSpan,
  Span,
  SpanInput,
  StrikethroughSpan,
  TableSpan,
  TextSpan,
  UnderlineSpan,
};
