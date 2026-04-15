// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * UsageData — domain entity representing API usage for the current billing period.
 * Pure value; no I/O or platform knowledge.
 */

/** Usage totals for a single calendar day. */
export interface DailyUsage {
  readonly date: Date;
  /** Total number of API calls counted for this day. */
  readonly callCount: number;
}

/** Aggregate API usage for the billing period, broken down by day. */
export interface UsageData {
  readonly appName: string | undefined;
  readonly daily: ReadonlyArray<DailyUsage>;
  /** Sum of callCount across all days. */
  readonly totalCalls: number;
}
