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

/** Text, written as it is. */
export type TextSpan = { readonly kind: "text"; readonly value: string };
/** Children shown in bold. */
export type BoldSpan = {
  readonly kind: "bold";
  readonly children: readonly Span[];
};
/** Children shown dimmed. */
export type DimSpan = {
  readonly kind: "dim";
  readonly children: readonly Span[];
};
/** Children shown in italics. */
export type ItalicSpan = {
  readonly kind: "italic";
  readonly children: readonly Span[];
};
/** Children shown underlined. */
export type UnderlineSpan = {
  readonly kind: "underline";
  readonly children: readonly Span[];
};
/** Children shown struck through. */
export type StrikethroughSpan = {
  readonly kind: "strikethrough";
  readonly children: readonly Span[];
};
/** Children shown in a named color, such as `"red"`. */
export type ColorSpan = {
  readonly kind: "color";
  readonly color: string;
  readonly children: readonly Span[];
};
/** Children with no formatting of their own. */
export type GroupSpan = {
  readonly kind: "group";
  readonly children: readonly Span[];
};
/** A line break. */
export type NewlineSpan = { readonly kind: "newline" };

// =============================================================================
// Span Types — Block-level
// =============================================================================

/** A block of code, with an optional language name. */
export type CodeBlockSpan = {
  readonly kind: "code-block";
  readonly language?: string;
  readonly value: string;
};

/** A table: a header row and rows of cells. */
export type TableSpan = {
  readonly kind: "table";
  readonly headers: readonly Span[];
  readonly rows: readonly (readonly Span[])[];
};

/** A list: each item is a row of spans. */
export type ListSpan = {
  readonly kind: "list";
  readonly items: readonly (readonly Span[])[];
};

/**
 * A bar that shows a percentage from 0 to 100, with an optional width in
 * characters and a label.
 */
export type GaugeSpan = {
  readonly kind: "gauge";
  readonly percent: number;
  readonly width?: number;
  readonly label?: string;
};

/** A horizontal rule, with an optional label. */
export type SeparatorSpan = {
  readonly kind: "separator";
  readonly label?: string;
};

/** A callout at the info, success, warning or error level. */
export type AlertSpan = {
  readonly kind: "alert";
  readonly level: "info" | "success" | "warning" | "error";
  readonly children: readonly Span[];
};

// =============================================================================
// Union type
// =============================================================================

/**
 * Any span. A renderer turns a list of spans into its output format, such as
 * ANSI text or Markdown.
 */
export type Span =
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
  | ListSpan
  | GaugeSpan
  | SeparatorSpan
  | AlertSpan;

/** A span, or a string that becomes a text span. */
export type SpanInput = string | Span;

// =============================================================================
// Normalize helper
// =============================================================================

/** Turns each string into a text span and keeps spans as they are. */
export const normalize = (inputs: readonly SpanInput[]): Span[] =>
  inputs.map((i) => (typeof i === "string" ? text(i) : i));

// =============================================================================
// Inline constructors
// =============================================================================

/** Creates a text span. */
export const text = (value: string): TextSpan => ({ kind: "text", value });

// ESC-introduced sequences (CSI, OSC ending in BEL or ST, DCS/SOS/PM/APC,
// other two-byte ESC forms), their 8-bit CSI/OSC forms, C0 controls other than
// tab and newline, DEL, and C1 controls.
const TERMINAL_CONTROL =
  // deno-lint-ignore no-control-regex
  /\x1b\[[\x30-\x3f]*[\x20-\x2f]*[\x40-\x7e]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?|\x1b[PX^_][\s\S]*?(?:\x1b\\|$)|\x1b[\x20-\x2f]*[\x30-\x7e]?|\x9b[\x30-\x3f]*[\x20-\x2f]*[\x40-\x7e]|\x9d[^\x07\x9c]*[\x07\x9c]?|[\x00-\x08\x0b-\x1f\x7f-\x9f]/g;

/**
 * Removes terminal control sequences and control characters, keeping tab and
 * newline, so the string can only print visible text.
 */
export const stripTerminalControls = (value: string): string =>
  value.replace(TERMINAL_CONTROL, "");

/**
 * A text span for content from outside the program (remote posts, registry
 * strings, provider errors). Text spans are passed through verbatim because
 * the TUI itself sends cursor control that way; this constructor removes
 * control sequences first, so the content cannot move the cursor, rewrite
 * earlier lines, spoof links or write the clipboard.
 */
export const untrusted = (value: string): TextSpan =>
  text(stripTerminalControls(value));

/** Creates a bold span; strings among the children become text spans. */
export const bold = (...children: SpanInput[]): BoldSpan => ({
  kind: "bold",
  children: normalize(children),
});

/** Creates a dimmed span; strings among the children become text spans. */
export const dim = (...children: SpanInput[]): DimSpan => ({
  kind: "dim",
  children: normalize(children),
});

/** Creates an italic span; strings among the children become text spans. */
export const italic = (...children: SpanInput[]): ItalicSpan => ({
  kind: "italic",
  children: normalize(children),
});

/**
 * Creates an underlined span; strings among the children become text spans.
 */
export const underline = (...children: SpanInput[]): UnderlineSpan => ({
  kind: "underline",
  children: normalize(children),
});

/**
 * Creates a struck-through span; strings among the children become text
 * spans.
 */
export const strikethrough = (...children: SpanInput[]): StrikethroughSpan => ({
  kind: "strikethrough",
  children: normalize(children),
});

/** Groups spans without adding formatting. */
export const group = (...children: SpanInput[]): GroupSpan => ({
  kind: "group",
  children: normalize(children),
});

/** Creates a line break. */
export const nl = (): NewlineSpan => ({ kind: "newline" });

// Color constructors
/**
 * Creates a span of the children in the named color; strings among the
 * children become text spans.
 */
export const color = (c: string, ...children: SpanInput[]): ColorSpan => ({
  kind: "color",
  color: c,
  children: normalize(children),
});

/** Creates a red span. */
export const red = (...children: SpanInput[]): ColorSpan =>
  color("red", ...children);
/** Creates a green span. */
export const green = (...children: SpanInput[]): ColorSpan =>
  color("green", ...children);
/** Creates a yellow span. */
export const yellow = (...children: SpanInput[]): ColorSpan =>
  color("yellow", ...children);
/** Creates a blue span. */
export const blue = (...children: SpanInput[]): ColorSpan =>
  color("blue", ...children);
/** Creates a magenta span. */
export const magenta = (...children: SpanInput[]): ColorSpan =>
  color("magenta", ...children);
/** Creates a cyan span. */
export const cyan = (...children: SpanInput[]): ColorSpan =>
  color("cyan", ...children);
/** Creates a gray span. */
export const gray = (...children: SpanInput[]): ColorSpan =>
  color("gray", ...children);
/** Creates a white span. */
export const white = (...children: SpanInput[]): ColorSpan =>
  color("white", ...children);

// =============================================================================
// Block-level constructors
// =============================================================================

/** Creates a code block, with an optional language name. */
export const codeBlock = (value: string, language?: string): CodeBlockSpan => ({
  kind: "code-block",
  language,
  value,
});

/** Creates a table from a header row and rows of cells. */
export const table = (
  headers: readonly SpanInput[],
  rows: readonly (readonly SpanInput[])[],
): TableSpan => ({
  kind: "table",
  headers: normalize(headers),
  rows: rows.map((row) => normalize(row)),
});

/** Creates a list; each item is a row of spans. */
export const list = (items: readonly (readonly SpanInput[])[]): ListSpan => ({
  kind: "list",
  items: items.map((row) => normalize(row)),
});

/**
 * Creates a bar for a percentage. `percent` is clamped to 0 through 100.
 */
export const gauge = (
  percent: number,
  options?: { width?: number; label?: string },
): GaugeSpan => ({
  kind: "gauge",
  percent: Math.max(0, Math.min(100, percent)),
  width: options?.width,
  label: options?.label,
});

/** Creates a horizontal rule, with an optional label. */
export const separator = (label?: string): SeparatorSpan => ({
  kind: "separator",
  label,
});

/** Creates a callout at the given level. */
export const alert = (
  level: AlertSpan["level"],
  ...children: SpanInput[]
): AlertSpan => ({
  kind: "alert",
  level,
  children: normalize(children),
});

// =============================================================================
// Measurement — plain text length of a span (strips all formatting)
// =============================================================================

/**
 * Returns how many characters a span takes as plain text, without
 * formatting. Tables, lists and separators count as 0 because they are blocks,
 * not inline text.
 */
export const plainLength = (s: Span): number => {
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
    case "gauge": {
      const w = s.width ?? 20;
      const label = s.label ? `  ${s.label}` : "";
      return w + ` ${s.percent}%`.length + label.length;
    }
    case "separator":
      return 0; // block-level, no inline contribution
    case "alert":
      return 2 + s.children.reduce((sum, child) => sum + plainLength(child), 0);
  }
};
