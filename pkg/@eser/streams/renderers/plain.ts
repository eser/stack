// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Plain text renderer — strips all formatting, outputs raw text.
 * Used for tests, log files, and any context where markup is unwanted.
 *
 * @module
 */

import type * as spanTypes from "../span.ts";
import { plainLength } from "../span.ts";
import type { Renderer } from "./types.ts";

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
    case "strikethrough":
    case "color":
    case "group":
      return span.children.map(renderSpan).join("");
    case "code-block":
      return span.value
        .split("\n")
        .map((line) => `  ${line}`)
        .join("\n") + "\n";
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

      const padCell = (cell: spanTypes.Span, width: number): string => {
        const rendered = renderSpan(cell);
        const textLen = plainLength(cell);
        return rendered + " ".repeat(Math.max(0, width - textLen));
      };

      const header = span.headers
        .map((h, i) => padCell(h, widths[i]!))
        .join("  ");
      const sep = widths.map((w) => "-".repeat(w)).join("  ");
      const rows = span.rows
        .map((row) =>
          row.map((cell, i) => padCell(cell, widths[i]!)).join("  ")
        )
        .join("\n");

      return `${header}\n${sep}\n${rows}\n`;
    }
    case "list":
      return span.items
        .map((item) => `  - ${item.map(renderSpan).join("")}`)
        .join("\n") + "\n";
  }
};

const plain = (): Renderer => ({
  name: "plain",
  render: (spans) => spans.map(renderSpan).join(""),
});

export { plain };
