// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as functions from "@eser/primitives/functions";

// taken from RFC5424 (see: https://datatracker.ietf.org/doc/html/rfc5424#section-6.2.1)
export const Severities = {
  Emergency: 0, // system is unusable
  Alert: 1, // action must be taken immediately
  Critical: 2, // critical conditions
  Error: 3, // error conditions
  Warning: 4, // warning conditions
  Notice: 5, // normal but significant condition
  Info: 6, // informational messages
  Debug: 7, // debug-level messages
} as const;

export type SeverityKey = Exclude<keyof typeof Severities, number>;
export type Severity = typeof Severities[SeverityKey];

export const SeverityNames = {
  [Severities.Emergency]: "Emergency",
  [Severities.Alert]: "Alert",
  [Severities.Critical]: "Critical",
  [Severities.Error]: "Error",
  [Severities.Warning]: "Warning",
  [Severities.Notice]: "Notice",
  [Severities.Info]: "Info",
  [Severities.Debug]: "Debug",
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
