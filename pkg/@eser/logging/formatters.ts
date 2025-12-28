// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as logging from "@eser/standards/logging";
import type { FormatterFn, LogRecord, TextFormatterOptions } from "./types.ts";
import { categoryToString } from "./category.ts";

/**
 * ANSI color codes for terminal output.
 */
const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",

  // Foreground colors
  black: "\x1b[30m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",

  // Background colors
  bgRed: "\x1b[41m",
  bgYellow: "\x1b[43m",
} as const;

/**
 * Severity level abbreviations.
 */
const SEVERITY_ABBR: Record<logging.Severity, string> = {
  [logging.Severities.Emergency]: "EMRG",
  [logging.Severities.Alert]: "ALRT",
  [logging.Severities.Critical]: "CRIT",
  [logging.Severities.Error]: "ERRO",
  [logging.Severities.Warning]: "WARN",
  [logging.Severities.Notice]: "NOTC",
  [logging.Severities.Info]: "INFO",
  [logging.Severities.Debug]: "DBUG",
};

/**
 * ANSI colors for each severity level.
 */
const SEVERITY_COLORS: Record<logging.Severity, string> = {
  [logging.Severities.Emergency]: `${ANSI.bgRed}${ANSI.white}${ANSI.bold}`,
  [logging.Severities.Alert]: `${ANSI.bgRed}${ANSI.white}`,
  [logging.Severities.Critical]: `${ANSI.red}${ANSI.bold}`,
  [logging.Severities.Error]: ANSI.red,
  [logging.Severities.Warning]: ANSI.yellow,
  [logging.Severities.Notice]: ANSI.cyan,
  [logging.Severities.Info]: ANSI.green,
  [logging.Severities.Debug]: ANSI.gray,
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
 * Safely stringifies a value, handling circular references.
 */
const safeStringify = (value: unknown): string => {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

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
        const strValue = typeof value === "string"
          ? value
          : safeStringify(value);
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
    category: categoryToString(record.category),
    message: record.message,
  };

  if (record.args.length > 0) {
    output["args"] = flattenArgs(record.args);
  }

  const mergedProps = { ...record.context, ...record.properties };
  if (Object.keys(mergedProps).length > 0) {
    output["properties"] = mergedProps;
  }

  return `${JSON.stringify(output)}\n`;
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
      parts.push(`[${categoryToString(record.category, categorySeparator)}]`);
    }

    // Message
    parts.push(record.message);

    // Properties and context
    const propsStr = formatProperties(record.properties, record.context);

    return `${parts.join(" ")}${propsStr}\n`;
  };
};

/**
 * ANSI color formatter - outputs colored log lines for terminals.
 */
export const ansiColorFormatter = (
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
    const color = SEVERITY_COLORS[record.severity] ?? "";

    // Timestamp (dimmed)
    const ts = formatTimestamp(record.datetime, timestamp);
    if (ts) {
      parts.push(`${ANSI.dim}${ts}${ANSI.reset}`);
    }

    // Severity level (colored)
    if (includeLevel) {
      const abbr = SEVERITY_ABBR[record.severity] ?? "????";
      parts.push(`${color}${abbr}${ANSI.reset}`);
    }

    // Category (cyan)
    if (includeCategory && record.category.length > 0) {
      const cat = categoryToString(record.category, categorySeparator);
      parts.push(`${ANSI.cyan}[${cat}]${ANSI.reset}`);
    }

    // Message (colored for errors/warnings)
    if (
      record.severity <= logging.Severities.Error
    ) {
      parts.push(`${color}${record.message}${ANSI.reset}`);
    } else {
      parts.push(record.message);
    }

    // Properties and context (dimmed)
    const propsStr = formatProperties(record.properties, record.context);
    if (propsStr) {
      parts.push(`${ANSI.dim}${propsStr.trim()}${ANSI.reset}`);
    }

    return `${parts.join(" ")}\n`;
  };
};

/**
 * JSON Lines formatter - outputs compact JSON (one object per line, no pretty printing).
 */
export const jsonLinesFormatter: FormatterFn = (record: LogRecord): string => {
  return (
    JSON.stringify({
      ts: record.datetime.getTime(),
      lvl: SEVERITY_ABBR[record.severity],
      cat: categoryToString(record.category),
      msg: record.message,
      ...(record.args.length > 0 ? { args: record.args } : {}),
      ...record.context,
      ...record.properties,
    }) + "\n"
  );
};

/**
 * Default text formatter instance.
 */
export const defaultTextFormatter: FormatterFn = textFormatter();

/**
 * Default ANSI color formatter instance.
 */
export const defaultAnsiColorFormatter: FormatterFn = ansiColorFormatter();

// Re-export FormatterFn type
export type { FormatterFn } from "./types.ts";
