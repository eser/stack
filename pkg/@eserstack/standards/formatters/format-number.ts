// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Format a number with thousands separators.
 *
 * @param num - Number to format (must be finite)
 * @returns Formatted number string
 * @throws Error if num is not a finite number
 *
 * @example
 * ```typescript
 * formatNumber(1000);    // "1,000"
 * formatNumber(1000000); // "1,000,000"
 * ```
 */
export const formatNumber = (num: number): string => {
  if (!Number.isFinite(num)) {
    throw new Error("Number must be finite");
  }

  // Grouped by hand rather than via toLocaleString.
  //
  // Two reasons. The documented contract above is "1,000,000" -- a comma, every
  // three digits -- which is a FIXED format, not a localised one; toLocaleString
  // would render it differently under another locale and quietly break callers
  // that parse or snapshot it. And toLocaleString is backed by Intl, which is
  // absent from builds compiled with `--engine quickjs`: there it silently
  // returns "1000000", losing the separators this function exists to add.
  const [whole, fraction] = Math.abs(num).toString().split(".");
  const grouped = whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const sign = num < 0 ? "-" : "";

  return fraction === undefined
    ? `${sign}${grouped}`
    : `${sign}${grouped}.${fraction}`;
};
