// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type * as logging from "@eser/standards/logging";

/**
 * A hierarchical category represented as an array of strings.
 * Example: ["myapp", "http", "request"]
 */
export type Category = readonly string[];

/**
 * A log record containing all information about a single log entry.
 */
export type LogRecord = {
  /** The formatted message string */
  readonly message: string;
  /** The original message template (string or tagged template) */
  readonly rawMessage: string | TemplateStringsArray;
  /** Additional arguments passed to the log method */
  readonly args: readonly unknown[];
  /** Timestamp of the log entry */
  readonly datetime: Date;
  /** Severity level (RFC 5424) */
  readonly severity: logging.Severity;
  /** Hierarchical category of the logger */
  readonly category: Category;
  /** Properties set via logger.with() */
  readonly properties: Record<string, unknown>;
  /** Context from withContext() (e.g., requestId, traceId) */
  readonly context: Record<string, unknown>;
};

/**
 * A sink function that handles log record output.
 * Can be synchronous or asynchronous.
 */
export type Sink = (record: LogRecord) => void | Promise<void>;

/**
 * A filter function that determines whether a log record should be processed.
 * Returns true to allow the record, false to discard it.
 */
export type Filter = (record: LogRecord) => boolean;

/**
 * Configuration for named sinks.
 */
export type SinkConfig = {
  readonly [name: string]: Sink;
};

/**
 * Configuration for named filters.
 */
export type FilterConfig = {
  readonly [name: string]: Filter;
};

/**
 * Configuration for a single logger category.
 */
export type LoggerConfig = {
  /** Category to configure (array or dot-separated string) */
  readonly category: Category | string;
  /** Minimum severity level to log (optional, inherits from parent) */
  readonly lowestLevel?: logging.Severity;
  /** Names of sinks to use (optional, inherits from parent) */
  readonly sinks?: readonly string[];
  /** How to handle parent sinks: "inherit" (default) or "override" */
  readonly parentSinks?: "inherit" | "override";
  /** Names of filters to apply (optional) */
  readonly filters?: readonly string[];
};

/**
 * Interface for context local storage (compatible with AsyncLocalStorage).
 */
export type ContextLocalStorage<T = Record<string, unknown>> = {
  run<R>(store: T, callback: () => R): R;
  getStore(): T | undefined;
};

/**
 * Options for configuring the logging system.
 */
export type ConfigureOptions = {
  /** Named sinks for log output */
  readonly sinks: SinkConfig;
  /** Named filters (optional) */
  readonly filters?: FilterConfig;
  /** Logger configurations by category */
  readonly loggers: readonly LoggerConfig[];
  /** Custom context local storage (optional, uses AsyncLocalStorage by default) */
  readonly contextLocalStorage?: ContextLocalStorage;
  /** Reset existing configuration before applying (default: false) */
  readonly reset?: boolean;
};

/**
 * Internal state for the logger registry.
 */
export type LoggerRegistryState = {
  readonly sinks: Map<string, Sink>;
  readonly filters: Map<string, Filter>;
  readonly loggers: Map<string, LoggerConfig>;
  readonly contextLocalStorage?: ContextLocalStorage;
  readonly categoryPrefixStorage?: ContextLocalStorage<Category>;
};

/**
 * Options for console sink.
 */
export type ConsoleSinkOptions = {
  /** Custom formatter function */
  readonly formatter?: FormatterFn;
  /** Use stderr instead of stdout (default: false) */
  readonly stderr?: boolean;
};

/**
 * Options for stream sink.
 */
export type StreamSinkOptions = {
  /** Custom formatter function */
  readonly formatter?: FormatterFn;
};

/**
 * A formatter function that converts a LogRecord to a string.
 */
export type FormatterFn = (record: LogRecord) => string;

/**
 * Options for text formatter.
 */
export type TextFormatterOptions = {
  /** Timestamp format */
  readonly timestamp?:
    | "date-time-timezone"
    | "date-time"
    | "time-timezone"
    | "time"
    | "date"
    | "rfc3339"
    | "none"
    | ((datetime: Date) => string);
  /** Category separator (default: ".") */
  readonly categorySeparator?: string;
  /** Include severity level name (default: true) */
  readonly includeLevel?: boolean;
  /** Include category (default: true) */
  readonly includeCategory?: boolean;
};

/**
 * Type guard to check if a value is a Category array.
 */
export const isCategory = (value: unknown): value is Category => {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
};

/**
 * Type guard to check if a value is a LogRecord.
 */
export const isLogRecord = (value: unknown): value is LogRecord => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record["message"] === "string" &&
    record["datetime"] instanceof Date &&
    typeof record["severity"] === "number" &&
    isCategory(record["category"]) &&
    typeof record["properties"] === "object" &&
    typeof record["context"] === "object"
  );
};

/**
 * Creates an empty LogRecord with default values.
 */
export const createLogRecord = (
  overrides: Partial<LogRecord> & {
    message: string;
    severity: logging.Severity;
    category: Category;
  },
): LogRecord => {
  return {
    rawMessage: overrides.rawMessage ?? overrides.message,
    args: overrides.args ?? [],
    datetime: overrides.datetime ?? new Date(),
    properties: overrides.properties ?? {},
    context: overrides.context ?? {},
    ...overrides,
  };
};
