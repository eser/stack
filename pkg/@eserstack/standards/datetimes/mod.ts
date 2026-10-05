// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Date and time utilities.
 *
 * Provides date formatting, relative time, and date comparison functions.
 *
 * @example
 * ```typescript
 * import * as standards from "@eserstack/standards";
 *
 * // Format to ISO date
 * standards.datetimes.toISODate(new Date()); // "2024-03-15"
 *
 * // Get relative time
 * standards.datetimes.getRelativeTime(new Date(Date.now() - 3600000));
 * // "1 hour ago"
 *
 * // Check if today
 * standards.datetimes.isToday(new Date()); // true
 * ```
 *
 * @module
 */

export {
  getRelativeTime,
  isFuture,
  isPast,
  isToday,
  toISODate,
  toISODateTime,
} from "./format.ts";
