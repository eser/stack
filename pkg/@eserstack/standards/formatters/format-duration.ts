// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

const MS_PER_SECOND = 1000;

/**
 * Format duration in milliseconds to human readable string.
 *
 * @param ms - Duration in milliseconds (must be >= 0)
 * @returns Human readable duration string
 * @throws Error if ms is negative or not a finite number
 *
 * @example
 * ```typescript
 * formatDuration(500);   // "500ms"
 * formatDuration(1500);  // "1.50s"
 * formatDuration(65000); // "65.00s"
 * ```
 */
export const formatDuration = (ms: number): string => {
  if (!Number.isFinite(ms) || ms < 0) {
    throw new Error("Duration must be a non-negative finite number");
  }
  if (ms < MS_PER_SECOND) {
    return `${ms.toFixed(0)}ms`;
  }
  return `${(ms / MS_PER_SECOND).toFixed(2)}s`;
};
