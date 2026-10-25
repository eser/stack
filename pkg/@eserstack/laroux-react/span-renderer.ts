// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * React Span renderer — converts Span trees into React elements.
 *
 * This is an external renderer for `@eserstack/streams` that lives in
 * `@eserstack/laroux-react` to avoid coupling streams to React.
 *
 * @example
 * ```tsx
 * import * as larouxReact from "@eserstack/laroux-react";
 * import * as streams from "@eserstack/streams";
 *
 * export function RecipeTitle(props: { readonly name: string }) {
 *   return (
 *     <larouxReact.SpanView>
 *       {[streams.span.bold("Recipe: "), streams.span.cyan(props.name)]}
 *     </larouxReact.SpanView>
 *   );
 * }
 * ```
 *
 * @module
 */

import * as React from "react";
import * as streams from "@eserstack/streams";

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

type AlertLevel = streams.span.AlertSpan["level"];

// The text that names an alert's level, so the level does not rest on color.
const ALERT_LABELS: Readonly<Record<AlertLevel, string>> = {
  info: "Info",
  success: "Success",
  warning: "Warning",
  error: "Error",
};

const ALERT_CLASSES: Readonly<Record<AlertLevel, string>> = {
  info: "text-blue-500",
  success: "text-green-500",
  warning: "text-yellow-500",
  error: "text-red-500",
};

// Labels and code languages are optional; an empty one counts as absent.
const hasText = (value: string | undefined): value is string =>
  value !== undefined && value !== "";

// =============================================================================
// Span → React element
// =============================================================================

export const renderSpan = (
  span: streams.span.Span,
  key: number,
): React.ReactElement => {
  switch (span.kind) {
    case "text":
      return React.createElement(React.Fragment, { key: key }, span.value);

    case "newline":
      return React.createElement("br", { key: key });

    case "bold":
      return (
        React.createElement(
          "strong",
          { key: key },
          span.children.map((child, i) => renderSpan(child, i)),
        )
      );

    case "dim":
      return (
        React.createElement(
          "span",
          { key: key, className: "opacity-50" },
          span.children.map((child, i) => renderSpan(child, i)),
        )
      );

    case "italic":
      return (
        React.createElement(
          "em",
          { key: key },
          span.children.map((child, i) => renderSpan(child, i)),
        )
      );

    case "underline":
      return (
        React.createElement(
          "span",
          { key: key, className: "underline" },
          span.children.map((child, i) => renderSpan(child, i)),
        )
      );

    case "strikethrough":
      return (
        React.createElement(
          "s",
          { key: key },
          span.children.map((child, i) => renderSpan(child, i)),
        )
      );

    case "color": {
      const className = COLOR_CLASSES[span.color] ?? "";
      return (
        React.createElement("span", {
          key: key,
          className: className,
          "data-color": span.color,
        }, span.children.map((child, i) => renderSpan(child, i)))
      );
    }

    case "group":
      return (
        React.createElement(
          React.Fragment,
          { key: key },
          span.children.map((child, i) => renderSpan(child, i)),
        )
      );

    case "code-block":
      return (
        React.createElement(
          "pre",
          { key: key },
          React.createElement("code", {
            className: hasText(span.language)
              ? `language-${span.language}`
              : undefined,
          }, span.value),
        )
      );

    case "table":
      return (
        React.createElement(
          "table",
          { key: key },
          React.createElement(
            "thead",
            null,
            React.createElement(
              "tr",
              null,
              span.headers.map((header, i) => (
                React.createElement("th", { key: i }, renderSpan(header, i))
              )),
            ),
          ),
          React.createElement(
            "tbody",
            null,
            span.rows.map((row, rowIdx) => (
              React.createElement(
                "tr",
                { key: rowIdx },
                row.map((cell, cellIdx) => (
                  React.createElement(
                    "td",
                    { key: cellIdx },
                    renderSpan(cell, cellIdx),
                  )
                )),
              )
            )),
          ),
        )
      );

    case "list":
      return (
        React.createElement(
          "ul",
          { key: key },
          span.items.map((item, i) => (
            React.createElement(
              "li",
              { key: i },
              item.map((child, j) => renderSpan(child, j)),
            )
          )),
        )
      );

    case "gauge":
      return (
        React.createElement(
          "span",
          { key: key, className: "inline-flex items-center gap-2" },
          React.createElement("meter", {
            min: 0,
            max: 100,
            value: span.percent,
            "aria-label": hasText(span.label) ? span.label : "Percentage",
            style: span.width === undefined
              ? undefined
              : { width: `${span.width}ch` },
          }),
          React.createElement("span", null, `${span.percent}%`),
          hasText(span.label)
            ? React.createElement("span", null, span.label)
            : null,
        )
      );

    case "separator":
      return hasText(span.label)
        ? (
          React.createElement(
            "div",
            { key: key, className: "flex items-center gap-2 text-gray-400" },
            React.createElement("hr", { className: "flex-1" }),
            React.createElement("span", null, span.label),
            React.createElement("hr", { className: "flex-1" }),
          )
        )
        : React.createElement("hr", { key: key });

    case "alert":
      return (
        React.createElement(
          "div",
          {
            key: key,
            role: "note",
            className: ALERT_CLASSES[span.level],
            "data-level": span.level,
          },
          React.createElement("strong", null, `${ALERT_LABELS[span.level]}: `),
          span.children.map((child, i) => renderSpan(child, i)),
        )
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
 * import * as larouxReact from "@eserstack/laroux-react";
 * import * as streams from "@eserstack/streams";
 *
 * const renderer = larouxReact.reactRenderer();
 * const element = renderer.render([streams.span.bold("hello")]);
 * // <strong>hello</strong>
 * ```
 */
export const react = (): streams.renderers.Renderer<React.ReactElement> => ({
  name: "react",
  render: (spans) =>
    React.createElement(
      React.Fragment,
      null,
      spans.map((s, i) => renderSpan(s, i)),
    ),
});

/**
 * SpanView — React component that renders a Span tree.
 *
 * ```tsx
 * import * as larouxReact from "@eserstack/laroux-react";
 * import * as streams from "@eserstack/streams";
 *
 * <larouxReact.SpanView>{[streams.span.bold("Recipe")]}</larouxReact.SpanView>;
 * ```
 */
export const SpanView = (
  props: { readonly children: readonly streams.span.SpanInput[] },
): React.ReactElement => {
  const spans = streams.span.normalize(props.children);
  const renderer = react();
  return renderer.render(spans);
};
