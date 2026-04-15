// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

const DEFAULT_DECIMALS = 1;

/**
 * Format a percentage value.
 *
 * @param value - Value (0-1 or 0-100 based on isRatio)
 * @param decimals - Number of decimal places (default: 1, must be >= 0)
 * @param isRatio - If true, value is 0-1 ratio (default: false)
 * @returns Formatted percentage string
 * @throws Error if value is not finite or decimals is negative
 *
 * @example
 * ```typescript
 * formatPercent(0.75, 1, true);  // "75.0%"
 * formatPercent(75.5, 1, false); // "75.5%"
 * ```
 */
export const formatPercent = (
  value: number,
  decimals = DEFAULT_DECIMALS,
  isRatio = false,
): string => {
  if (!Number.isFinite(value)) {
    throw new Error("Value must be a finite number");
  }
  if (decimals < 0 || !Number.isInteger(decimals)) {
    throw new Error("Decimals must be a non-negative integer");
  }
  const percent = isRatio ? value * 100 : value;
  return `${percent.toFixed(decimals)}%`;
};
