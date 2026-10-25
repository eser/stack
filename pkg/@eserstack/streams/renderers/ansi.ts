// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * ANSI terminal renderer — serializes Spans to ANSI escape codes.
 * Used for CLI output to color-capable terminals.
 *
 * @module
 */

import * as span from "../span.ts";
import type { Renderer } from "./types.ts";

// =============================================================================
// ANSI escape codes
// =============================================================================

const ESC = "\x1b[";
/** The escape sequence that turns off every style and color. */
export const RESET = `${ESC}0m`;

/** The opening and closing escape sequences of each text style. */
export const STYLE_CODES: Record<string, [string, string]> = {
  bold: [`${ESC}1m`, `${ESC}22m`],
  dim: [`${ESC}2m`, `${ESC}22m`],
  italic: [`${ESC}3m`, `${ESC}23m`],
  underline: [`${ESC}4m`, `${ESC}24m`],
  strikethrough: [`${ESC}9m`, `${ESC}29m`],
};

/** The foreground color escape sequence of each named color. */
export const COLOR_CODES: Record<string, string> = {
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

const renderSpan = (node: span.Span): string => {
  switch (node.kind) {
    case "text":
      return node.value;
    case "newline":
      return "\n";
    case "bold":
    case "dim":
    case "italic":
    case "underline":
    case "strikethrough": {
      const [open, close] = STYLE_CODES[node.kind]!;
      return `${open}${node.children.map(renderSpan).join("")}${close}`;
    }
    case "color": {
      const code = COLOR_CODES[node.color] ?? COLOR_CODES["white"]!;
      return `${code}${node.children.map(renderSpan).join("")}${COLOR_RESET}`;
    }
    case "group":
      return node.children.map(renderSpan).join("");
    case "code-block": {
      const dimOpen = STYLE_CODES["dim"]![0];
      const dimClose = STYLE_CODES["dim"]![1];
      return (
        node.value
          .split("\n")
          .map((line) => `${dimOpen}  ${line}${dimClose}`)
          .join("\n") + "\n"
      );
    }
    case "table": {
      const widths = node.headers.map((h, i) => {
        const maxRow = node.rows.reduce((max, row) => {
          const cell = row[i];
          return Math.max(max, cell !== undefined ? span.plainLength(cell) : 0);
        }, 0);
        return Math.max(span.plainLength(h), maxRow);
      });

      const boldOpen = STYLE_CODES["bold"]![0];
      const boldClose = STYLE_CODES["bold"]![1];
      const dimOpen = STYLE_CODES["dim"]![0];
      const dimClose = STYLE_CODES["dim"]![1];

      const padCell = (cell: span.Span, width: number): string => {
        const rendered = renderSpan(cell);
        const textLen = span.plainLength(cell);
        return rendered + " ".repeat(Math.max(0, width - textLen));
      };

      const header = node.headers
        .map((h, i) => `${boldOpen}${padCell(h, widths[i]!)}${boldClose}`)
        .join("  ");
      const sep = `${dimOpen}${widths
        .map((w) => "─".repeat(w))
        .join("──")}${dimClose}`;
      const rows = node.rows
        .map((row) =>
          row.map((cell, i) => padCell(cell, widths[i]!)).join("  "),
        )
        .join("\n");

      return `${header}\n${sep}\n${rows}\n`;
    }
    case "list":
      return (
        node.items
          .map((item) => `  • ${item.map(renderSpan).join("")}`)
          .join("\n") + "\n"
      );
    case "gauge": {
      const w = node.width ?? 20;
      const filled = Math.round((w * node.percent) / 100);
      const empty = w - filled;
      const bar = `${COLOR_CODES["green"]!}${"█".repeat(filled)}${COLOR_RESET}${
        STYLE_CODES["dim"]![0]
      }${"░".repeat(empty)}${STYLE_CODES["dim"]![1]}`;
      const pct = ` ${node.percent}%`;
      const label = node.label
        ? `${STYLE_CODES["dim"]![0]}  ${node.label}${STYLE_CODES["dim"]![1]}`
        : "";
      return `${bar}${pct}${label}`;
    }
    case "separator": {
      const dimOpen = STYLE_CODES["dim"]![0];
      const dimClose = STYLE_CODES["dim"]![1];
      if (node.label) {
        const pad = "─".repeat(Math.max(0, 33 - node.label.length));
        return `${dimOpen}──── ${node.label} ${pad}${dimClose}\n`;
      }
      return `${dimOpen}${"─".repeat(40)}${dimClose}\n`;
    }
    case "alert": {
      const icons = {
        info: "ℹ",
        success: "✓",
        warning: "▲",
        error: "✗",
      } as const;
      const colors = {
        info: "cyan",
        success: "green",
        warning: "yellow",
        error: "red",
      } as const;
      const icon = icons[node.level];
      const colorCode = COLOR_CODES[colors[node.level]]!;
      return `${colorCode}${icon}${COLOR_RESET} ${node.children
        .map(renderSpan)
        .join("")}`;
    }
  }
};

/**
 * Creates a renderer that writes spans with ANSI escape sequences for
 * terminals.
 */
export const ansi = (): Renderer => ({
  name: "ansi",
  render: (spans) => {
    const result = spans.map(renderSpan).join("");
    // Ensure no unclosed escape sequences
    return result.includes(ESC) ? result + RESET : result;
  },
});
