// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * @module @eserstack/standards/formatters
 *
 * Value formatting utilities for converting numbers, sizes, durations,
 * and percentages to human-readable strings.
 *
 * @example
 * ```typescript
 * import {
 *   formatDuration,
 *   formatSize,
 *   formatNumber,
 *   formatPercent,
 * } from "@eserstack/standards/formatters";
 *
 * formatDuration(1500);           // "1.50s"
 * formatSize(1048576);            // "1.00 MB"
 * formatNumber(1000000);          // "1,000,000"
 * formatPercent(0.75, 1, true);   // "75.0%"
 * ```
 */

export { formatDuration } from "./format-duration.ts";
export { formatNumber } from "./format-number.ts";
export { formatPercent } from "./format-percent.ts";
export { formatSize } from "./format-size.ts";
