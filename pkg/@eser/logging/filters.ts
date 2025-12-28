// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as logging from "@eser/standards/logging";
import type { Category, Filter, LogRecord } from "./types.ts";
import {
  isDescendantOrSelf,
  matchesPattern,
  normalizeCategory,
} from "./category.ts";

/**
 * Creates a filter that passes records at or above a given severity level.
 * Lower severity numbers are more severe (Emergency=0, Debug=7).
 *
 * @example
 * const filter = getLevelFilter(logging.Severities.Warning);
 * filter(infoRecord) // false (Info=6 > Warning=4)
 * filter(errorRecord) // true (Error=3 < Warning=4)
 */
export const getLevelFilter = (level: logging.Severity): Filter => {
  return (record: LogRecord): boolean => {
    return record.severity <= level;
  };
};

/**
 * Creates a filter that passes records matching a specific category or its descendants.
 *
 * @example
 * const filter = getCategoryFilter(["app", "http"]);
 * filter(appHttpRecord) // true
 * filter(appHttpRequestRecord) // true
 * filter(appDbRecord) // false
 */
export const getCategoryFilter = (category: Category | string): Filter => {
  const normalized = normalizeCategory(category);

  return (record: LogRecord): boolean => {
    return isDescendantOrSelf(record.category, normalized);
  };
};

/**
 * Creates a filter that passes records matching a category pattern.
 * Supports "*" (any single segment) and "**" (any number of segments).
 *
 * @example
 * const filter = getCategoryPatternFilter(["app", "*", "request"]);
 * filter({ category: ["app", "http", "request"] }) // true
 * filter({ category: ["app", "db", "request"] }) // true
 * filter({ category: ["app", "http", "response"] }) // false
 */
export const getCategoryPatternFilter = (
  pattern: Category | string,
): Filter => {
  const normalized = normalizeCategory(pattern);

  return (record: LogRecord): boolean => {
    return matchesPattern(record.category, normalized);
  };
};

/**
 * Creates a filter that checks for the presence of a property.
 *
 * @example
 * const filter = getPropertyFilter("requestId");
 * filter({ properties: { requestId: "123" } }) // true
 * filter({ properties: {} }) // false
 */
export const getPropertyFilter = (propertyName: string): Filter => {
  return (record: LogRecord): boolean => {
    return propertyName in record.properties || propertyName in record.context;
  };
};

/**
 * Creates a filter that checks a property value against a predicate.
 *
 * @example
 * const filter = getPropertyValueFilter("userId", (v) => v === 123);
 * filter({ properties: { userId: 123 } }) // true
 * filter({ properties: { userId: 456 } }) // false
 */
export const getPropertyValueFilter = (
  propertyName: string,
  predicate: (value: unknown) => boolean,
): Filter => {
  return (record: LogRecord): boolean => {
    const value = record.properties[propertyName] ??
      record.context[propertyName];

    return predicate(value);
  };
};

/**
 * Creates a filter that passes records containing a message substring.
 *
 * @example
 * const filter = getMessageFilter("error");
 * filter({ message: "An error occurred" }) // true
 * filter({ message: "Success" }) // false
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
 * const filter = getMessageRegexFilter(/error|warning/i);
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
 * const filter = combineFilters(
 *   getLevelFilter(logging.Severities.Warning),
 *   getCategoryFilter(["app", "http"])
 * );
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
 * const filter = anyFilter(
 *   getCategoryFilter(["app", "http"]),
 *   getCategoryFilter(["app", "db"])
 * );
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
 * const filter = notFilter(getCategoryFilter(["debug"]));
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
 * const filter = getRateLimitFilter(10, 1000); // 10 records per second
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
 * Creates a sampling filter that passes approximately 1 in N records.
 *
 * @param sampleRate - Sample rate (e.g., 10 means ~10% of records pass)
 *                     Must be a positive number.
 * @throws Error if sampleRate is not a positive number
 *
 * @example
 * const filter = getSamplingFilter(10); // ~10% of records
 */
export const getSamplingFilter = (sampleRate: number): Filter => {
  if (sampleRate <= 0 || !Number.isFinite(sampleRate)) {
    throw new Error("sampleRate must be a positive number");
  }

  return (_record: LogRecord): boolean => {
    return Math.random() < 1 / sampleRate;
  };
};
