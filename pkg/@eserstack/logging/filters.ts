// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type * as logging from "@eserstack/standards/logging";
import type { Category, Filter, LogRecord } from "./types.ts";
import * as category from "./category.ts";

/**
 * Creates a filter that passes records at or above a given severity level.
 * Higher severity numbers are more severe (Trace=1, Emergency=23) per OpenTelemetry.
 *
 * @example
 * ```typescript
 * import * as logging from "@eserstack/logging";
 *
 * // Passes Warning (13) and above, such as Error (17); drops Info (9)
 * const warnings = logging.filters.getLevelFilter(logging.Severities.Warning);
 * ```
 */
export const getLevelFilter = (level: logging.Severity): Filter => {
  return (record: LogRecord): boolean => {
    return record.severity >= level;
  };
};

/**
 * Creates a filter that passes records matching a specific category or its descendants.
 *
 * @example
 * ```typescript
 * import * as logging from "@eserstack/logging";
 *
 * // Passes app.http and app.http.request; drops app.db
 * const http = logging.filters.getCategoryFilter(["app", "http"]);
 * ```
 */
export const getCategoryFilter = (baseCategory: Category | string): Filter => {
  const normalized = category.normalizeCategory(baseCategory);

  return (record: LogRecord): boolean => {
    return category.isDescendantOrSelf(record.category, normalized);
  };
};

/**
 * Creates a filter that passes records matching a category pattern.
 * Supports "*" (any single segment) and "**" (any number of segments).
 *
 * @example
 * ```typescript
 * import * as logging from "@eserstack/logging";
 *
 * // Passes app.http.request and app.db.request; drops app.http.response
 * const requests = logging.filters.getCategoryPatternFilter([
 *   "app",
 *   "*",
 *   "request",
 * ]);
 * ```
 */
export const getCategoryPatternFilter = (
  pattern: Category | string,
): Filter => {
  const normalized = category.normalizeCategory(pattern);

  return (record: LogRecord): boolean => {
    return category.matchesPattern(record.category, normalized);
  };
};

/**
 * Creates a filter that passes records that have the property, set through
 * `logger.with()` or the logging context.
 *
 * @example
 * ```typescript
 * import * as logging from "@eserstack/logging";
 *
 * // Passes records logged with a requestId property or context value
 * const withRequestId = logging.filters.getPropertyFilter("requestId");
 * ```
 */
export const getPropertyFilter = (propertyName: string): Filter => {
  return (record: LogRecord): boolean => {
    return propertyName in record.properties || propertyName in record.context;
  };
};

/**
 * Creates a filter that checks a property value against a predicate. The
 * value comes from the record's properties, or from its context when the
 * properties do not set it.
 *
 * @example
 * ```typescript
 * import * as logging from "@eserstack/logging";
 *
 * // Passes records whose userId is 123
 * const oneUser = logging.filters.getPropertyValueFilter(
 *   "userId",
 *   (value) => value === 123,
 * );
 * ```
 */
export const getPropertyValueFilter = (
  propertyName: string,
  predicate: (value: unknown) => boolean,
): Filter => {
  return (record: LogRecord): boolean => {
    const value =
      record.properties[propertyName] ?? record.context[propertyName];

    return predicate(value);
  };
};

/**
 * Creates a filter that passes records whose message contains `substring`,
 * ignoring case unless `caseSensitive` is set.
 *
 * @example
 * ```typescript
 * import * as logging from "@eserstack/logging";
 *
 * // Passes "An Error occurred"; drops "Success"
 * const errors = logging.filters.getMessageFilter("error");
 * ```
 */
export const getMessageFilter = (
  substring: string,
  caseSensitive = false,
): Filter => {
  return (record: LogRecord): boolean => {
    if (caseSensitive) {
      return record.message.includes(substring);
    }

    return record.message.toLowerCase().includes(substring.toLowerCase());
  };
};

/**
 * Creates a filter that passes records matching a message regex.
 *
 * @example
 * ```typescript
 * import * as logging from "@eserstack/logging";
 *
 * const problems = logging.filters.getMessageRegexFilter(/error|warning/i);
 * ```
 */
export const getMessageRegexFilter = (regex: RegExp): Filter => {
  return (record: LogRecord): boolean => {
    return regex.test(record.message);
  };
};

/**
 * Combines multiple filters with AND logic (all must pass).
 *
 * @example
 * ```typescript
 * import * as logging from "@eserstack/logging";
 *
 * // Passes warnings and above from app.http
 * const httpWarnings = logging.filters.combineFilters(
 *   logging.filters.getLevelFilter(logging.Severities.Warning),
 *   logging.filters.getCategoryFilter(["app", "http"]),
 * );
 * ```
 */
export const combineFilters = (...filters: Filter[]): Filter => {
  return (record: LogRecord): boolean => {
    return filters.every((filter) => filter(record));
  };
};

/**
 * Combines multiple filters with OR logic (any must pass).
 *
 * @example
 * ```typescript
 * import * as logging from "@eserstack/logging";
 *
 * // Passes records from app.http or app.db
 * const httpOrDb = logging.filters.anyFilter(
 *   logging.filters.getCategoryFilter(["app", "http"]),
 *   logging.filters.getCategoryFilter(["app", "db"]),
 * );
 * ```
 */
export const anyFilter = (...filters: Filter[]): Filter => {
  return (record: LogRecord): boolean => {
    return filters.some((filter) => filter(record));
  };
};

/**
 * Inverts a filter (NOT logic).
 *
 * @example
 * ```typescript
 * import * as logging from "@eserstack/logging";
 *
 * const notDebug = logging.filters.notFilter(
 *   logging.filters.getCategoryFilter(["debug"]),
 * );
 * ```
 */
export const notFilter = (filter: Filter): Filter => {
  return (record: LogRecord): boolean => {
    return !filter(record);
  };
};

/**
 * Creates a filter that always passes all records.
 */
export const passAllFilter: Filter = (_record: LogRecord): boolean => {
  return true;
};

/**
 * Creates a filter that rejects all records.
 */
export const rejectAllFilter: Filter = (_record: LogRecord): boolean => {
  return false;
};

/**
 * Creates a rate-limiting filter that passes at most N records per time window.
 *
 * Note: The returned filter maintains state. Create a new filter instance
 * for each independent rate limit context (e.g., per-sink or per-category).
 *
 * @param maxRecords - Maximum records allowed per window (must be > 0)
 * @param windowMs - Time window in milliseconds (must be > 0)
 * @throws Error if parameters are invalid
 *
 * @example
 * ```typescript
 * import * as logging from "@eserstack/logging";
 *
 * // At most 10 records per second
 * const limited = logging.filters.getRateLimitFilter(10, 1000);
 * ```
 */
export const getRateLimitFilter = (
  maxRecords: number,
  windowMs: number,
): Filter => {
  if (maxRecords <= 0 || !Number.isInteger(maxRecords)) {
    throw new Error("maxRecords must be a positive integer");
  }
  if (windowMs <= 0 || !Number.isFinite(windowMs)) {
    throw new Error("windowMs must be a positive number");
  }

  let count = 0;
  let windowStart = Date.now();

  return (_record: LogRecord): boolean => {
    const now = Date.now();

    if (now - windowStart >= windowMs) {
      windowStart = now;
      count = 0;
    }

    if (count >= maxRecords) {
      return false;
    }

    count++;

    return true;
  };
};

/**
 * Creates a sampling filter that passes each record with a chance of 1 in
 * `sampleRate`.
 *
 * @param sampleRate - A positive number; 10 passes each record with a 10%
 *   chance
 * @throws Error if sampleRate is not a positive number
 *
 * @example
 * ```typescript
 * import * as logging from "@eserstack/logging";
 *
 * // Each record passes with a 10% chance
 * const sampled = logging.filters.getSamplingFilter(10);
 * ```
 */
export const getSamplingFilter = (sampleRate: number): Filter => {
  if (sampleRate <= 0 || !Number.isFinite(sampleRate)) {
    throw new Error("sampleRate must be a positive number");
  }

  return (_record: LogRecord): boolean => {
    return Math.random() < 1 / sampleRate;
  };
};
