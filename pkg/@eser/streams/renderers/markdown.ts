// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Markdown renderer — serializes Spans to Markdown syntax.
 * Used for MCP tool responses, HTTP API responses, and documentation.
 *
 * @module
 */

import type * as spanTypes from "../span.ts";
import type { Renderer } from "./types.ts";

const renderSpan = (span: spanTypes.Span): string => {
  switch (span.kind) {
    case "text":
      return span.value;
    case "newline":
      return "\n";
    case "bold":
      return `**${span.children.map(renderSpan).join("")}**`;
    case "italic":
      return `*${span.children.map(renderSpan).join("")}*`;
    case "strikethrough":
      return `~~${span.children.map(renderSpan).join("")}~~`;
    case "dim":
    case "underline":
    case "color":
    case "group":
      // No markdown equivalent for dim/underline/color — render children plain
      return span.children.map(renderSpan).join("");
    case "code-block": {
      const lang = span.language ?? "";
      return `\`\`\`${lang}\n${span.value}\n\`\`\`\n`;
    }
    case "table": {
      const header = `| ${span.headers.map(renderSpan).join(" | ")} |`;
      const sep = `| ${span.headers.map(() => "---").join(" | ")} |`;
      const rows = span.rows
        .map((row) => `| ${row.map(renderSpan).join(" | ")} |`)
        .join("\n");

      return `${header}\n${sep}\n${rows}\n`;
    }
    case "list":
      return span.items
        .map((item) => `- ${item.map(renderSpan).join("")}`)
        .join("\n") + "\n";
  }
};

const markdown = (): Renderer => ({
  name: "markdown",
  render: (spans) => spans.map(renderSpan).join(""),
});

export { markdown };
