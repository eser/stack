// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * FanOutPartialError — returned via Result when a cross-platform write operation
 * fails on some platforms but succeeds on others.
 * Carries the posts that were successfully published and the per-platform failures.
 * Lives in the application layer so both platform adapters and UI adapters
 * can import it without cross-adapter dependencies.
 */

import type { Post } from "../domain/entities/post.ts";
import type { Platform } from "../domain/values/platform.ts";

/** A single per-platform failure entry in a fan-out operation. */
export interface FanOutFailure {
  readonly platform: Platform;
  readonly error: Error;
}

/** Returned when a cross-platform write succeeds on some platforms but fails on others. */
export class FanOutPartialError extends Error {
  readonly code = "FANOUT_PARTIAL" as const;
  /** Posts successfully published before and after the failure. */
  readonly posted: readonly Post[];
  /** Per-platform failure entries. */
  readonly failed: readonly FanOutFailure[];
  /** Total number of platforms that were attempted. */
  readonly totalPlatforms: number;

  constructor(params: {
    posted: readonly Post[];
    failed: readonly FanOutFailure[];
    totalPlatforms: number;
  }) {
    super(
      `Fan-out partial: ${params.posted.length}/${params.totalPlatforms} succeeded`,
    );
    this.name = "FanOutPartialError";
    this.posted = params.posted;
    this.failed = params.failed;
    this.totalPlatforms = params.totalPlatforms;
  }
}
