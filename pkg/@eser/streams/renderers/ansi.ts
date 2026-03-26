// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * ANSI terminal renderer — serializes Spans to ANSI escape codes.
 * Used for CLI output to color-capable terminals.
 *
 * @module
 */

import type * as spanTypes from "../span.ts";
import { plainLength } from "../span.ts";
import type { Renderer } from "./types.ts";

// =============================================================================
// ANSI escape codes
// =============================================================================

const ESC = "\x1b[";
const RESET = `${ESC}0m`;

const STYLE_CODES: Record<string, [string, string]> = {
  bold: [`${ESC}1m`, `${ESC}22m`],
  dim: [`${ESC}2m`, `${ESC}22m`],
  italic: [`${ESC}3m`, `${ESC}23m`],
  underline: [`${ESC}4m`, `${ESC}24m`],
  strikethrough: [`${ESC}9m`, `${ESC}29m`],
};

const COLOR_CODES: Record<string, string> = {
  black: `${ESC}30m`,
  red: `${ESC}31m`,
  green: `${ESC}32m`,
  yellow: `${ESC}33m`,
  blue: `${ESC}34m`,
  magenta: `${ESC}35m`,
  cyan: `${ESC}36m`,
  white: `${ESC}37m`,
  gray: `${ESC}90m`,
};

const COLOR_RESET = `${ESC}39m`;

// =============================================================================
// Renderer
// =============================================================================

const renderSpan = (span: spanTypes.Span): string => {
  switch (span.kind) {
    case "text":
      return span.value;
    case "newline":
      return "\n";
    case "bold":
    case "dim":
    case "italic":
    case "underline":
    case "strikethrough": {
      const [open, close] = STYLE_CODES[span.kind]!;
      return `${open}${span.children.map(renderSpan).join("")}${close}`;
    }
    case "color": {
      const code = COLOR_CODES[span.color] ?? COLOR_CODES["white"]!;
      return `${code}${span.children.map(renderSpan).join("")}${COLOR_RESET}`;
    }
    case "group":
      return span.children.map(renderSpan).join("");
    case "code-block": {
      const dimOpen = STYLE_CODES["dim"]![0];
      const dimClose = STYLE_CODES["dim"]![1];
      return span.value
        .split("\n")
        .map((line) => `${dimOpen}  ${line}${dimClose}`)
        .join("\n") + "\n";
    }
    case "table": {
      const widths = span.headers.map((h, i) => {
        const maxRow = span.rows.reduce(
          (max, row) => {
            const cell = row[i];
            return Math.max(max, cell !== undefined ? plainLength(cell) : 0);
          },
          0,
        );
        return Math.max(plainLength(h), maxRow);
      });

      const boldOpen = STYLE_CODES["bold"]![0];
      const boldClose = STYLE_CODES["bold"]![1];
      const dimOpen = STYLE_CODES["dim"]![0];
      const dimClose = STYLE_CODES["dim"]![1];

      const padCell = (cell: spanTypes.Span, width: number): string => {
        const rendered = renderSpan(cell);
        const textLen = plainLength(cell);
        return rendered + " ".repeat(Math.max(0, width - textLen));
      };

      const header = span.headers
        .map((h, i) => `${boldOpen}${padCell(h, widths[i]!)}${boldClose}`)
        .join("  ");
      const sep = `${dimOpen}${
        widths.map((w) => "─".repeat(w)).join("──")
      }${dimClose}`;
      const rows = span.rows
        .map((row) =>
          row.map((cell, i) => padCell(cell, widths[i]!)).join("  ")
        )
        .join("\n");

      return `${header}\n${sep}\n${rows}\n`;
    }
    case "list":
      return span.items
        .map((item) => `  • ${item.map(renderSpan).join("")}`)
        .join("\n") + "\n";
  }
};

const ansi = (): Renderer => ({
  name: "ansi",
  render: (spans) => {
    const result = spans.map(renderSpan).join("");
    // Ensure no unclosed escape sequences
    return result.includes(ESC) ? result + RESET : result;
  },
});

export { ansi, COLOR_CODES, RESET, STYLE_CODES };
