// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Date and time utilities.
 *
 * Provides date formatting, relative time, and date comparison functions.
 *
 * @example
 * ```typescript
 * import {
 *   toISODate,
 *   getRelativeTime,
 *   isToday,
 * } from "@eser/standards/datetimes";
 *
 * // Format to ISO date
 * toISODate(new Date()); // "2024-03-15"
 *
 * // Get relative time
 * getRelativeTime(new Date(Date.now() - 3600000)); // "1 hour ago"
 *
 * // Check if today
 * isToday(new Date()); // true
 * ```
 *
 * @module
 */

export * from "./format.ts";
