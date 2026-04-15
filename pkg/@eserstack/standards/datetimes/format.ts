// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Date and time formatting utilities.
 *
 * @module
 */

/**
 * Format a date to ISO date string (YYYY-MM-DD).
 *
 * @example
 * toISODate(new Date("2024-03-15T10:30:00Z"))
 * // "2024-03-15"
 */
export const toISODate = (date: Date): string => {
  const parts = date.toISOString().split("T");
  return parts[0] ?? "";
};

/**
 * Format a date to ISO datetime string.
 *
 * @example
 * toISODateTime(new Date("2024-03-15T10:30:00Z"))
 * // "2024-03-15T10:30:00.000Z"
 */
export const toISODateTime = (date: Date): string => date.toISOString();

/**
 * Time unit thresholds for relative time calculation.
 */
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Get relative time description (e.g., "2 hours ago", "in 3 days").
 * Handles both past and future dates.
 *
 * @example
 * // Assuming now is 2024-03-15T12:00:00Z
 * getRelativeTime(new Date("2024-03-15T11:30:00Z"))
 * // "30 minutes ago"
 *
 * getRelativeTime(new Date("2024-03-15T14:00:00Z"))
 * // "in 2 hours"
 *
 * @param date - The date to format
 * @param now - Reference date for comparison (defaults to current time)
 * @returns Human-readable relative time string
 */
export const getRelativeTime = (
  date: Date,
  now: Date = new Date(),
): string => {
  const diffMs = now.getTime() - date.getTime();
  const absDiffMs = Math.abs(diffMs);
  const isPast = diffMs > 0;

  const formatUnit = (value: number, unit: string): string => {
    const plural = value === 1 ? "" : "s";
    return isPast
      ? `${value} ${unit}${plural} ago`
      : `in ${value} ${unit}${plural}`;
  };

  if (absDiffMs < MINUTE) {
    return "just now";
  }

  if (absDiffMs < HOUR) {
    const minutes = Math.floor(absDiffMs / MINUTE);
    return formatUnit(minutes, "minute");
  }

  if (absDiffMs < DAY) {
    const hours = Math.floor(absDiffMs / HOUR);
    return formatUnit(hours, "hour");
  }

  const days = Math.floor(absDiffMs / DAY);
  return formatUnit(days, "day");
};

/**
 * Check if a date is today.
 *
 * @example
 * isToday(new Date()) // true
 * isToday(new Date("2020-01-01")) // false
 */
export const isToday = (date: Date, now: Date = new Date()): boolean =>
  toISODate(date) === toISODate(now);

/**
 * Check if a date is in the past.
 */
export const isPast = (date: Date, now: Date = new Date()): boolean =>
  date.getTime() < now.getTime();

/**
 * Check if a date is in the future.
 */
export const isFuture = (date: Date, now: Date = new Date()): boolean =>
  date.getTime() > now.getTime();
