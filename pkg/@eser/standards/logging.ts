// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as functions from "@eser/primitives/functions";

// OpenTelemetry severity levels (see: https://opentelemetry.io/docs/specs/otel/logs/data-model/#field-severitynumber)
// Higher numbers = more severe (opposite of RFC 5424)
export const Severities = {
  Trace: 1, // 1-4: most fine-grained diagnostic information
  Debug: 5, // 5-8: detailed troubleshooting data
  Info: 9, // 9-12: normal operational messages
  Notice: 10, // within INFO range: normal but significant condition
  Warning: 13, // 13-16: potential issues needing attention
  Error: 17, // 17-20: functionality-breaking problems
  Critical: 21, // 21-24: non-recoverable critical failures
  Alert: 22, // within FATAL range: action must be taken immediately
  Emergency: 23, // within FATAL range: system is unusable (most severe)
} as const;

export type SeverityKey = Exclude<keyof typeof Severities, number>;
export type Severity = typeof Severities[SeverityKey];

export const SeverityNames = {
  [Severities.Trace]: "Trace",
  [Severities.Debug]: "Debug",
  [Severities.Info]: "Info",
  [Severities.Notice]: "Notice",
  [Severities.Warning]: "Warning",
  [Severities.Error]: "Error",
  [Severities.Critical]: "Critical",
  [Severities.Alert]: "Alert",
  [Severities.Emergency]: "Emergency",
} as const;

/**
 * Category is a hierarchical array of strings representing the logger's namespace.
 * Example: ["myapp", "http", "request"]
 */
export type Category = readonly string[];

/**
 * Core Logger interface for logging messages at various severity levels.
 * This interface defines the minimum contract that all loggers must implement.
 */
export interface Logger {
  /**
   * Hierarchical category of this logger.
   */
  readonly category: Category;

  /**
   * Logs a message at the given severity level.
   *
   * @param severity - The severity level of the log
   * @param message - The message to log (can be a value or a function for lazy evaluation)
   * @param args - Additional arguments to include in the log
   * @returns The logged message value (or undefined if skipped due to severity)
   */
  log<T>(
    severity: Severity,
    message:
      // deno-lint-ignore no-explicit-any
      | (T extends functions.GenericFunction<any, any> ? never : T)
      | (() => T),
    // deno-lint-ignore no-explicit-any
    ...args: functions.ArgList<any>
  ): Promise<T | undefined>;

  /**
   * Creates a child logger with an extended category.
   *
   * @param subcategory - The subcategory to append
   * @returns A new logger with the extended category
   */
  getChild(subcategory: string | Category): Logger;

  /**
   * Returns a new logger with preset properties.
   * Properties are merged with existing ones and included in all log records.
   *
   * @param properties - Properties to include in all log records
   * @returns A new logger with the preset properties
   */
  with(properties: Record<string, unknown>): Logger;
}
