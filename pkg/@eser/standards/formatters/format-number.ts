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
  return num.toLocaleString();
};
