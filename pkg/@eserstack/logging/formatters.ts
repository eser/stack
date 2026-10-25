// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as logging from "@eserstack/standards/logging";
import * as span from "@eserstack/streams/span";
import type { FormatterFn, LogRecord, TextFormatterOptions } from "./types.ts";
import * as category from "./category.ts";
import * as serialize from "./serialize.ts";

/**
 * Severity level abbreviations (OpenTelemetry order: Trace=1 to Emergency=23).
 */
const SEVERITY_ABBR: Record<logging.Severity, string> = {
  [logging.Severities.Trace]: "TRCE",
  [logging.Severities.Debug]: "DBUG",
  [logging.Severities.Info]: "INFO",
  [logging.Severities.Notice]: "NOTC",
  [logging.Severities.Warning]: "WARN",
  [logging.Severities.Error]: "ERRO",
  [logging.Severities.Critical]: "CRIT",
  [logging.Severities.Alert]: "ALRT",
  [logging.Severities.Emergency]: "EMRG",
};

/**
 * Flattens args array for JSON output.
 */
const flattenArgs = (args: readonly unknown[]): unknown => {
  if (args.length > 1) {
    return args;
  }

  return args[0];
};

/**
 * Formats a date to ISO string (timestamp).
 */
const formatTimestamp = (
  datetime: Date,
  format: TextFormatterOptions["timestamp"],
): string => {
  if (format === "none") {
    return "";
  }

  if (typeof format === "function") {
    return format(datetime);
  }

  const iso = datetime.toISOString();
  const date = iso.slice(0, 10);
  const time = iso.slice(11, 19);
  const tz = iso.slice(19);

  switch (format) {
    case "rfc3339":
      return iso;
    case "date-time-timezone":
    case undefined:
      return `${date} ${time}${tz}`;
    case "date-time":
      return `${date} ${time}`;
    case "time-timezone":
      return `${time}${tz}`;
    case "time":
      return time;
    case "date":
      return date;
  }
};

/**
 * Stringifies a value with Error support, falling back to String() for a value
 * JSON cannot hold (a cycle, a BigInt).
 */
const safeStringify = (value: unknown): string =>
  serialize.toJson(value) ?? String(value);

/**
 * Formats properties and context as key=value pairs.
 */
const formatProperties = (
  properties: Record<string, unknown>,
  context: Record<string, unknown>,
): string => {
  const merged = { ...context, ...properties };
  const entries = Object.entries(merged);

  if (entries.length === 0) {
    return "";
  }

  return (
    " " +
    entries
      .map(([key, value]) => {
        const strValue =
          typeof value === "string" ? value : safeStringify(value);
        return `${key}=${strValue}`;
      })
      .join(" ")
  );
};

/**
 * JSON formatter - outputs structured JSON log lines.
 * This is the default formatter.
 */
export const jsonFormatter: FormatterFn = (record: LogRecord): string => {
  const output: Record<string, unknown> = {
    level: logging.SeverityNames[record.severity],
    datetime: record.datetime.getTime(),
    category: category.categoryToString(record.category),
    message: record.message,
  };

  if (record.args.length > 0) {
    output["args"] = flattenArgs(record.args);
  }

  const mergedProps = { ...record.context, ...record.properties };
  if (Object.keys(mergedProps).length > 0) {
    output["properties"] = mergedProps;
  }

  return `${JSON.stringify(output, serialize.jsonReplacer)}\n`;
};

/**
 * Text formatter - outputs human-readable log lines.
 */
export const textFormatter = (
  options: TextFormatterOptions = {},
): FormatterFn => {
  const {
    timestamp = "date-time-timezone",
    categorySeparator = ".",
    includeLevel = true,
    includeCategory = true,
  } = options;

  return (record: LogRecord): string => {
    const parts: string[] = [];

    // Timestamp
    const ts = formatTimestamp(record.datetime, timestamp);
    if (ts) {
      parts.push(ts);
    }

    // Severity level
    if (includeLevel) {
      parts.push(SEVERITY_ABBR[record.severity] ?? "????");
    }

    // Category
    if (includeCategory && record.category.length > 0) {
      parts.push(
        `[${category.categoryToString(record.category, categorySeparator)}]`,
      );
    }

    // Message
    parts.push(record.message);

    // Properties and context
    const propsStr = formatProperties(record.properties, record.context);

    return `${parts.join(" ")}${propsStr}\n`;
  };
};

/**
 * JSON Lines formatter - outputs compact JSON (one object per line, no pretty printing).
 */
export const jsonLinesFormatter: FormatterFn = (record: LogRecord): string => {
  return (
    JSON.stringify(
      {
        ts: record.datetime.getTime(),
        lvl: SEVERITY_ABBR[record.severity],
        cat: category.categoryToString(record.category),
        msg: record.message,
        ...(record.args.length > 0 ? { args: record.args } : {}),
        ...record.context,
        ...record.properties,
      },
      serialize.jsonReplacer,
    ) + "\n"
  );
};

// =============================================================================
// Span-based formatting (uses @eserstack/streams span IR)
// =============================================================================

/**
 * Maps severity to a styled span.
 */
const severityToSpan = (
  severity: logging.Severity,
  label: string,
): span.Span => {
  switch (severity) {
    case logging.Severities.Trace:
      return span.dim(span.magenta(label));
    case logging.Severities.Debug:
      return span.gray(label);
    case logging.Severities.Info:
      return span.green(label);
    case logging.Severities.Notice:
      return span.cyan(label);
    case logging.Severities.Warning:
      return span.yellow(label);
    case logging.Severities.Error:
      return span.red(label);
    case logging.Severities.Critical:
      return span.bold(span.red(label));
    case logging.Severities.Alert:
      return span.bold(span.red(label));
    case logging.Severities.Emergency:
      return span.bold(span.red(label));
    default:
      return span.text(label);
  }
};

/**
 * A span formatter function that converts a LogRecord to an array of Spans.
 * Used with getOutputSink() — the Output's renderer determines the final format.
 */
export type SpanFormatterFn = (record: LogRecord) => span.Span[];

/**
 * Default span formatter — produces styled spans for terminal/markdown/plain output.
 * Pair with `getOutputSink(output)` and let the Output's renderer handle serialization.
 *
 * @example
 * ```typescript
 * import * as logging from "@eserstack/logging";
 * import * as streams from "@eserstack/streams";
 *
 * const out = streams.output({
 *   renderer: streams.renderers.plain(),
 *   sink: streams.sinks.stdout(),
 * });
 * const sink = logging.sinks.getOutputSink(out, {
 *   formatter: logging.formatters.spanFormatter,
 * });
 * ```
 */
export const spanFormatter: SpanFormatterFn = (
  record: LogRecord,
): span.Span[] => {
  const ts = formatTimestamp(record.datetime, "date-time-timezone");
  const abbr = SEVERITY_ABBR[record.severity] ?? "????";
  const cat =
    record.category.length > 0
      ? category.categoryToString(record.category)
      : "";
  const propsStr = formatProperties(record.properties, record.context);

  const spans: span.Span[] = [];

  if (ts) {
    spans.push(span.dim(ts), span.text(" "));
  }

  spans.push(severityToSpan(record.severity, abbr), span.text(" "));

  if (cat) {
    spans.push(span.cyan(`[${cat}]`), span.text(" "));
  }

  if (record.severity >= logging.Severities.Error) {
    spans.push(span.red(record.message));
  } else {
    spans.push(span.text(record.message));
  }

  if (propsStr.trim()) {
    spans.push(span.text(" "), span.dim(propsStr.trim()));
  }

  return spans;
};

// Re-export FormatterFn type
export type { FormatterFn } from "./types.ts";
