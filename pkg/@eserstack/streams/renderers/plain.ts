// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Plain text renderer — strips all formatting, outputs raw text.
 * Used for tests, log files, and any context where markup is unwanted.
 *
 * @module
 */

import * as span from "../span.ts";
import type { Renderer } from "./types.ts";

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
    case "strikethrough":
    case "color":
    case "group":
      return node.children.map(renderSpan).join("");
    case "code-block":
      return node.value
        .split("\n")
        .map((line) => `  ${line}`)
        .join("\n") + "\n";
    case "table": {
      const widths = node.headers.map((h, i) => {
        const maxRow = node.rows.reduce(
          (max, row) => {
            const cell = row[i];
            return Math.max(
              max,
              cell !== undefined ? span.plainLength(cell) : 0,
            );
          },
          0,
        );
        return Math.max(span.plainLength(h), maxRow);
      });

      const padCell = (cell: span.Span, width: number): string => {
        const rendered = renderSpan(cell);
        const textLen = span.plainLength(cell);
        return rendered + " ".repeat(Math.max(0, width - textLen));
      };

      const header = node.headers
        .map((h, i) => padCell(h, widths[i]!))
        .join("  ");
      const sep = widths.map((w) => "-".repeat(w)).join("  ");
      const rows = node.rows
        .map((row) =>
          row.map((cell, i) => padCell(cell, widths[i]!)).join("  ")
        )
        .join("\n");

      return `${header}\n${sep}\n${rows}\n`;
    }
    case "list":
      return node.items
        .map((item) => `  - ${item.map(renderSpan).join("")}`)
        .join("\n") + "\n";
    case "gauge": {
      const w = node.width ?? 20;
      const filled = Math.round(w * node.percent / 100);
      const empty = w - filled;
      const bar = `[${"=".repeat(filled)}${" ".repeat(empty)}]`;
      const label = node.label ? ` ${node.label}` : "";
      return `${bar} ${node.percent}%${label}`;
    }
    case "separator":
      return node.label ? `--- ${node.label} ---\n` : `${"─".repeat(40)}\n`;
    case "alert": {
      const tags = {
        info: "INFO",
        success: "OK",
        warning: "WARN",
        error: "ERROR",
      } as const;
      return `[${tags[node.level]}] ${node.children.map(renderSpan).join("")}`;
    }
  }
};

/** Creates a renderer that writes spans as text without formatting. */
export const plain = (): Renderer => ({
  name: "plain",
  render: (spans) => spans.map(renderSpan).join(""),
});
