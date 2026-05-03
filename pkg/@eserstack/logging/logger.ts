// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as logging from "@eserstack/standards/logging";
import * as functions from "@eserstack/primitives/functions";
import type { Category, Filter, Sink } from "./types.ts";
import {
  categoryKey,
  categoryToString,
  extendCategory,
  normalizeCategory,
} from "./category.ts";
import {
  getEffectiveConfig,
  registerConfigureHook,
  registerLoggerCacheClear,
} from "./config.ts";
import { applyPrefixToCategory, getContext } from "./context.ts";
import { ensureLib, requireLib } from "./ffi-client.ts";

export const DEFAULT_LEVEL = logging.Severities.Info;

/** Maps OTel severity numbers to Go slog level name strings. */
const severityToGoLevel = (s: logging.Severity): string => {
  if (s <= 4) return "TRACE";
  if (s <= 8) return "DEBUG";
  if (s <= 12) return "INFO";
  if (s <= 16) return "WARN";
  if (s <= 20) return "ERROR";
  if (s <= 24) return "FATAL";

  return "PANIC";
};

/** Module-level map from category key → Go handle, shared with configure hook. */
const goHandles = new Map<string, string>();

/**
 * Logger class with hierarchical category support.
 */
export class Logger implements logging.Logger {
  /** Hierarchical category of this logger */
  readonly category: Category;

  /** Parent logger (null for root loggers) */
  readonly parent: Logger | null;

  /** Preset properties to include in all log records */
  readonly #properties: Record<string, unknown>;

  /** Cached effective config (sinks, filters, level) */
  #effectiveConfig: {
    sinks: Sink[];
    filters: Filter[];
    lowestLevel: logging.Severity;
  } | null = null;

  /** Go FFI handle for this logger (null until first log or if FFI unavailable). */
  #goHandle: string | null = null;
  #goHandleInitialized = false;

  constructor(
    category: Category | string,
    parent: Logger | null = null,
    properties: Record<string, unknown> = {},
  ) {
    this.category = normalizeCategory(category);
    this.parent = parent;
    this.#properties = properties;
  }

  /**
   * Gets the effective configuration for this logger.
   * Resolves inheritance from parent categories via the config system.
   */
  #getEffectiveConfig(): {
    sinks: Sink[];
    filters: Filter[];
    lowestLevel: logging.Severity;
  } {
    if (this.#effectiveConfig === null) {
      this.#effectiveConfig = getEffectiveConfig(this.category);
    }

    return this.#effectiveConfig;
  }

  /** Lazily creates and caches a Go FFI handle for this logger. Throws if FFI unavailable. */
  async #ensureGoHandle(): Promise<void> {
    if (this.#goHandleInitialized) return;

    this.#goHandleInitialized = true;
    await ensureLib();

    const lib = requireLib();
    const config = this.#getEffectiveConfig();
    const raw = lib.symbols.EserAjanLogCreate(
      JSON.stringify({
        scopeName: categoryToString(this.category),
        level: severityToGoLevel(config.lowestLevel),
      }),
    );
    const result = JSON.parse(raw) as { handle?: string; error?: string };

    if (result.handle) {
      this.#goHandle = result.handle;
      goHandles.set(categoryKey(this.category), result.handle);
    }
  }

  /**
   * Creates a child logger with an extended category.
   *
   * @example
   * const logger = getLogger(["myapp"]);
   * const childLogger = logger.getChild("http"); // ["myapp", "http"]
   * const grandchildLogger = childLogger.getChild(["request", "handler"]); // ["myapp", "http", "request", "handler"]
   */
  getChild(subcategory: string | Category): Logger {
    const childCategory = extendCategory(
      this.category,
      normalizeCategory(subcategory),
    );

    return new Logger(childCategory, this, this.#properties);
  }

  /**
   * Returns a new logger with preset properties.
   * Properties are merged with existing ones.
   *
   * @example
   * const logger = getLogger(["myapp"]);
   * const requestLogger = logger.with({ requestId: "abc-123" });
   * await requestLogger.info("Processing"); // Includes requestId
   */
  with(properties: Record<string, unknown>): Logger {
    return new Logger(this.category, this.parent, {
      ...this.#properties,
      ...properties,
    });
  }

  /**
   * Gets the logger name as a dot-separated string.
   * For backward compatibility with old code.
   */
  get loggerName(): string {
    return categoryToString(this.category);
  }

  /**
   * Converts a value to a string for logging.
   */
  asString(data: unknown, isProperty = false): string {
    if (typeof data === "string") {
      if (isProperty) {
        return `"${data}"`;
      }

      return data;
    }

    if (
      data === null ||
      typeof data === "number" ||
      typeof data === "bigint" ||
      typeof data === "boolean" ||
      typeof data === "undefined" ||
      typeof data === "symbol"
    ) {
      return String(data);
    }

    if (data instanceof Error) {
      return data.stack!;
    }

    if (data !== null && typeof data === "object") {
      if (Array.isArray(data)) {
        return JSON.stringify(data);
      }

      return `{${
        Object.entries(data)
          .map(([k, v]) => `"${k}":${this.asString(v, true)}`)
          .join(",")
      }}`;
    }

    return "undefined";
  }

  /**
   * Logs a message at the given severity level. Delegates entirely to Go FFI.
   * Throws if the native library is unavailable.
   */
  async log<T>(
    severity: logging.Severity,
    message:
      // deno-lint-ignore no-explicit-any
      | (T extends functions.GenericFunction<any, any> ? never : T)
      | (() => T),
    // deno-lint-ignore no-explicit-any
    ...args: functions.ArgList<any>
  ): Promise<T | undefined> {
    // TS-side level gate — WASM command mode is stateless so Go handles are ephemeral;
    // we use the locally-known lowestLevel to decide whether to proceed.
    const config = this.#getEffectiveConfig();

    if (severity < config.lowestLevel) {
      return message instanceof Function ? undefined : message;
    }

    // Evaluate lazy message only when level passes.
    let fnResult: T | undefined;
    let logMessage: string;
    if (message instanceof Function) {
      fnResult = message();
      logMessage = this.asString(fnResult);
    } else {
      logMessage = this.asString(message);
    }

    await this.#ensureGoHandle();
    const lib = requireLib();
    const context = getContext();
    const attrs: Record<string, unknown> = {
      ...this.#properties,
      ...(context ?? {}),
    };

    lib.symbols.EserAjanLogWrite(
      JSON.stringify({
        handle: this.#goHandle,
        level: severityToGoLevel(severity),
        message: logMessage,
        attrs,
      }),
    );

    return message instanceof Function ? fnResult : message;
  }

  debug<T>(
    message: () => T,
    // deno-lint-ignore no-explicit-any
    ...args: functions.ArgList<any>
  ): Promise<T | undefined>;
  debug<T>(
    // deno-lint-ignore no-explicit-any
    message: T extends functions.GenericFunction<any, any> ? never : T,
    // deno-lint-ignore no-explicit-any
    ...args: functions.ArgList<any>
  ): Promise<T>;
  debug<T>(
    message:
      // deno-lint-ignore no-explicit-any
      | (T extends functions.GenericFunction<any, any> ? never : T)
      | (() => T),
    // deno-lint-ignore no-explicit-any
    ...args: functions.ArgList<any>
  ): Promise<T | undefined> {
    return this.log(logging.Severities.Debug, message, ...args);
  }

  info<T>(
    message: () => T,
    // deno-lint-ignore no-explicit-any
    ...args: functions.ArgList<any>
  ): Promise<T | undefined>;
  info<T>(
    // deno-lint-ignore no-explicit-any
    message: T extends functions.GenericFunction<any, any> ? never : T,
    // deno-lint-ignore no-explicit-any
    ...args: functions.ArgList<any>
  ): Promise<T>;
  info<T>(
    message:
      // deno-lint-ignore no-explicit-any
      | (T extends functions.GenericFunction<any, any> ? never : T)
      | (() => T),
    // deno-lint-ignore no-explicit-any
    ...args: functions.ArgList<any>
  ): Promise<T | undefined> {
    return this.log(logging.Severities.Info, message, ...args);
  }

  warn<T>(
    message: () => T,
    // deno-lint-ignore no-explicit-any
    ...args: functions.ArgList<any>
  ): Promise<T | undefined>;
  warn<T>(
    // deno-lint-ignore no-explicit-any
    message: T extends functions.GenericFunction<any, any> ? never : T,
    // deno-lint-ignore no-explicit-any
    ...args: functions.ArgList<any>
  ): Promise<T>;
  warn<T>(
    message:
      // deno-lint-ignore no-explicit-any
      | (T extends functions.GenericFunction<any, any> ? never : T)
      | (() => T),
    // deno-lint-ignore no-explicit-any
    ...args: functions.ArgList<any>
  ): Promise<T | undefined> {
    return this.log(logging.Severities.Warning, message, ...args);
  }

  error<T>(
    message: () => T,
    // deno-lint-ignore no-explicit-any
    ...args: functions.ArgList<any>
  ): Promise<T | undefined>;
  error<T>(
    // deno-lint-ignore no-explicit-any
    message: T extends functions.GenericFunction<any, any> ? never : T,
    // deno-lint-ignore no-explicit-any
    ...args: functions.ArgList<any>
  ): Promise<T>;
  error<T>(
    message:
      // deno-lint-ignore no-explicit-any
      | (T extends functions.GenericFunction<any, any> ? never : T)
      | (() => T),
    // deno-lint-ignore no-explicit-any
    ...args: functions.ArgList<any>
  ): Promise<T | undefined> {
    return this.log(logging.Severities.Error, message, ...args);
  }

  critical<T>(
    message: () => T,
    // deno-lint-ignore no-explicit-any
    ...args: functions.ArgList<any>
  ): Promise<T | undefined>;
  critical<T>(
    // deno-lint-ignore no-explicit-any
    message: T extends functions.GenericFunction<any, any> ? never : T,
    // deno-lint-ignore no-explicit-any
    ...args: functions.ArgList<any>
  ): Promise<T>;
  critical<T>(
    message:
      // deno-lint-ignore no-explicit-any
      | (T extends functions.GenericFunction<any, any> ? never : T)
      | (() => T),
    // deno-lint-ignore no-explicit-any
    ...args: functions.ArgList<any>
  ): Promise<T | undefined> {
    return this.log(logging.Severities.Critical, message, ...args);
  }

  /**
   * Logs an emergency message.
   */
  emergency<T>(
    message: () => T,
    // deno-lint-ignore no-explicit-any
    ...args: functions.ArgList<any>
  ): Promise<T | undefined>;
  emergency<T>(
    // deno-lint-ignore no-explicit-any
    message: T extends functions.GenericFunction<any, any> ? never : T,
    // deno-lint-ignore no-explicit-any
    ...args: functions.ArgList<any>
  ): Promise<T>;
  emergency<T>(
    message:
      // deno-lint-ignore no-explicit-any
      | (T extends functions.GenericFunction<any, any> ? never : T)
      | (() => T),
    // deno-lint-ignore no-explicit-any
    ...args: functions.ArgList<any>
  ): Promise<T | undefined> {
    return this.log(logging.Severities.Emergency, message, ...args);
  }

  /**
   * Logs an alert message.
   */
  alert<T>(
    message: () => T,
    // deno-lint-ignore no-explicit-any
    ...args: functions.ArgList<any>
  ): Promise<T | undefined>;
  alert<T>(
    // deno-lint-ignore no-explicit-any
    message: T extends functions.GenericFunction<any, any> ? never : T,
    // deno-lint-ignore no-explicit-any
    ...args: functions.ArgList<any>
  ): Promise<T>;
  alert<T>(
    message:
      // deno-lint-ignore no-explicit-any
      | (T extends functions.GenericFunction<any, any> ? never : T)
      | (() => T),
    // deno-lint-ignore no-explicit-any
    ...args: functions.ArgList<any>
  ): Promise<T | undefined> {
    return this.log(logging.Severities.Alert, message, ...args);
  }

  /**
   * Logs a notice message.
   */
  notice<T>(
    message: () => T,
    // deno-lint-ignore no-explicit-any
    ...args: functions.ArgList<any>
  ): Promise<T | undefined>;
  notice<T>(
    // deno-lint-ignore no-explicit-any
    message: T extends functions.GenericFunction<any, any> ? never : T,
    // deno-lint-ignore no-explicit-any
    ...args: functions.ArgList<any>
  ): Promise<T>;
  notice<T>(
    message:
      // deno-lint-ignore no-explicit-any
      | (T extends functions.GenericFunction<any, any> ? never : T)
      | (() => T),
    // deno-lint-ignore no-explicit-any
    ...args: functions.ArgList<any>
  ): Promise<T | undefined> {
    return this.log(logging.Severities.Notice, message, ...args);
  }

  /**
   * Logs a trace message (most verbose level).
   */
  trace<T>(
    message: () => T,
    // deno-lint-ignore no-explicit-any
    ...args: functions.ArgList<any>
  ): Promise<T | undefined>;
  trace<T>(
    // deno-lint-ignore no-explicit-any
    message: T extends functions.GenericFunction<any, any> ? never : T,
    // deno-lint-ignore no-explicit-any
    ...args: functions.ArgList<any>
  ): Promise<T>;
  trace<T>(
    message:
      // deno-lint-ignore no-explicit-any
      | (T extends functions.GenericFunction<any, any> ? never : T)
      | (() => T),
    // deno-lint-ignore no-explicit-any
    ...args: functions.ArgList<any>
  ): Promise<T | undefined> {
    return this.log(logging.Severities.Trace, message, ...args);
  }
}

/**
 * Logger cache by category key.
 */
const loggerInstances = new Map<string, Logger>();

/**
 * Gets or creates a logger for the given category.
 *
 * @example
 * const logger = getLogger(["myapp", "http"]);
 * await logger.info("Request received");
 *
 * // Or with a string
 * const logger2 = getLogger("myapp.http");
 */
export const getLogger = (category: Category | string): Logger => {
  const normalized = applyPrefixToCategory(normalizeCategory(category));
  const key = categoryKey(normalized);

  let logger = loggerInstances.get(key);
  if (!logger) {
    logger = new Logger(normalized);
    loggerInstances.set(key, logger);
  }

  // Pre-warm FFI library so the first log() call doesn't block on it.
  void ensureLib();

  return logger;
};

/**
 * Clears the logger instance cache.
 * Useful for testing.
 */
export const clearLoggerCache = (): void => {
  loggerInstances.clear();
};

// Register the logger cache clear callback with config.ts
registerLoggerCacheClear(clearLoggerCache);

// When TS configure() runs, push updated levels to any live Go handles.
registerConfigureHook(async (loggerConfigs) => {
  await ensureLib();
  const lib = requireLib(); // throws if FFI never loaded — not a silent skip

  for (const loggerConfig of loggerConfigs) {
    if (loggerConfig.lowestLevel === undefined) continue;

    const normalized = normalizeCategory(loggerConfig.category);
    const key = categoryKey(normalized);
    const handle = goHandles.get(key);

    if (handle !== undefined) {
      lib.symbols.EserAjanLogConfigure(
        JSON.stringify({ handle, level: severityToGoLevel(loggerConfig.lowestLevel) }),
      );
    }
  }
});

/**
 * Default logger instance (for backward compatibility).
 * Uses the "default" category and console output.
 */
export const current: Logger = new Logger(["default"]);

// Re-export types for convenience
export type { Category, LogRecord } from "./types.ts";
