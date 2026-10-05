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
          <code
            className={hasText(span.language)
              ? `language-${span.language}`
              : undefined}
          >
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

    case "gauge":
      return (
        <span key={key} className="inline-flex items-center gap-2">
          <meter
            min={0}
            max={100}
            value={span.percent}
            aria-label={hasText(span.label) ? span.label : "Percentage"}
            style={span.width === undefined
              ? undefined
              : { width: `${span.width}ch` }}
          />
          <span>{`${span.percent}%`}</span>
          {hasText(span.label) ? <span>{span.label}</span> : null}
        </span>
      );

    case "separator":
      return hasText(span.label)
        ? (
          <div key={key} className="flex items-center gap-2 text-gray-400">
            <hr className="flex-1" />
            <span>{span.label}</span>
            <hr className="flex-1" />
          </div>
        )
        : <hr key={key} />;

    case "alert":
      return (
        <div
          key={key}
          role="note"
          className={ALERT_CLASSES[span.level]}
          data-level={span.level}
        >
          <strong>{`${ALERT_LABELS[span.level]}: `}</strong>
          {span.children.map((child, i) => renderSpan(child, i))}
        </div>
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
  render: (spans) => <>{spans.map((s, i) => renderSpan(s, i))}</>,
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
