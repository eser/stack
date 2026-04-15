// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * React Span renderer — converts Span trees into React elements.
 *
 * This is an external renderer for `@eserstack/streams` that lives in
 * `@eserstack/laroux-react` to avoid coupling streams to React.
 *
 * @example
 * ```tsx
 * import { SpanView } from "@eserstack/laroux-react/span-renderer";
 * import * as span from "@eserstack/streams/span";
 *
 * <SpanView>{[span.bold("Recipe: "), span.cyan(recipe.name)]}</SpanView>
 * ```
 *
 * @module
 */

import * as React from "react";
import type * as spanTypes from "@eserstack/streams/span";
import { normalize } from "@eserstack/streams/span";
import type { Renderer } from "@eserstack/streams/renderers";

// =============================================================================
// Color mapping
// =============================================================================

const COLOR_CLASSES: Record<string, string> = {
  red: "text-red-500",
  green: "text-green-500",
  yellow: "text-yellow-500",
  blue: "text-blue-500",
  magenta: "text-magenta-500",
  cyan: "text-cyan-500",
  gray: "text-gray-400",
  white: "text-white",
};

// =============================================================================
// Span → React element
// =============================================================================

const renderSpan = (
  span: spanTypes.Span,
  key: number,
): React.ReactElement => {
  switch (span.kind) {
    case "text":
      return <React.Fragment key={key}>{span.value}</React.Fragment>;

    case "newline":
      return <br key={key} />;

    case "bold":
      return (
        <strong key={key}>
          {span.children.map((child, i) => renderSpan(child, i))}
        </strong>
      );

    case "dim":
      return (
        <span key={key} className="opacity-50">
          {span.children.map((child, i) => renderSpan(child, i))}
        </span>
      );

    case "italic":
      return (
        <em key={key}>
          {span.children.map((child, i) => renderSpan(child, i))}
        </em>
      );

    case "underline":
      return (
        <span key={key} className="underline">
          {span.children.map((child, i) => renderSpan(child, i))}
        </span>
      );

    case "strikethrough":
      return (
        <s key={key}>
          {span.children.map((child, i) => renderSpan(child, i))}
        </s>
      );

    case "color": {
      const className = COLOR_CLASSES[span.color] ?? "";
      return (
        <span key={key} className={className} data-color={span.color}>
          {span.children.map((child, i) => renderSpan(child, i))}
        </span>
      );
    }

    case "group":
      return (
        <React.Fragment key={key}>
          {span.children.map((child, i) => renderSpan(child, i))}
        </React.Fragment>
      );

    case "code-block":
      return (
        <pre key={key}>
          <code className={span.language ? `language-${span.language}` : ""}>
            {span.value}
          </code>
        </pre>
      );

    case "table":
      return (
        <table key={key}>
          <thead>
            <tr>
              {span.headers.map((header, i) => (
                <th key={i}>{renderSpan(header, i)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {span.rows.map((row, rowIdx) => (
              <tr key={rowIdx}>
                {row.map((cell, cellIdx) => (
                  <td key={cellIdx}>{renderSpan(cell, cellIdx)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );

    case "list":
      return (
        <ul key={key}>
          {span.items.map((item, i) => (
            <li key={i}>
              {item.map((child, j) => renderSpan(child, j))}
            </li>
          ))}
        </ul>
      );
  }
};

// =============================================================================
// Public API
// =============================================================================

/**
 * React renderer — implements the `@eserstack/streams` Renderer interface.
 * Returns `React.ReactElement` instead of string.
 *
 * ```tsx
 * const renderer = react();
 * const element = renderer.render([span.bold("hello")]);
 * // <strong>hello</strong>
 * ```
 */
const react = (): Renderer<React.ReactElement> => ({
  name: "react",
  render: (spans) => <>{spans.map((s, i) => renderSpan(s, i))}</>,
});

/**
 * SpanView — React component that renders a Span tree.
 *
 * ```tsx
 * <SpanView>{[span.bold("Recipe"), span.cyan(name)]}</SpanView>
 * ```
 */
const SpanView = (
  { children }: { readonly children: readonly spanTypes.SpanInput[] },
): React.ReactElement => {
  const spans = normalize(children);
  const renderer = react();
  return renderer.render(spans);
};

export { react, renderSpan, SpanView };
