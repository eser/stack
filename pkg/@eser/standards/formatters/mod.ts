// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * @module @eser/standards/formatters
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
 * } from "@eser/standards/formatters";
 *
 * formatDuration(1500);           // "1.50s"
 * formatSize(1048576);            // "1.00 MB"
 * formatNumber(1000000);          // "1,000,000"
 * formatPercent(0.75, 1, true);   // "75.0%"
 * ```
 */

export * from "./format-duration.ts";
export * from "./format-number.ts";
export * from "./format-percent.ts";
export * from "./format-size.ts";
