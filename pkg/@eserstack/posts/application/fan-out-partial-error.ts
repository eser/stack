// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * FanOutPartialError: returned via Result when a cross-platform write fails
 * on at least one platform. Carries the posts that were published and the
 * per-platform failures. Lives in the application layer so both platform
 * adapters and UI adapters can import it without cross-adapter dependencies.
 *
 * @module
 */

import type { Post } from "../domain/entities/post.ts";
import type { Platform } from "../domain/values/platform.ts";

/** A single per-platform failure entry in a fan-out operation. */
export interface FanOutFailure {
  /** The platform the write failed on. */
  readonly platform: Platform;
  /** Why the write failed on that platform. */
  readonly error: Error;
}

/** Builds the message: which platforms published, which failed and why. */
const describeFanOut = (
  posted: readonly Post[],
  failed: readonly FanOutFailure[],
  totalPlatforms: number,
): string => {
  const failures = failed
    .map((failure) => `${failure.platform} (${failure.error.message})`)
    .join(", ");

  if (posted.length === 0) {
    return `Cross-post failed on all ${totalPlatforms} platforms, so nothing was published: ${failures}.`;
  }

  const published = posted.map((post) => post.platform).join(", ");
  return `Cross-post published on ${published} but failed on ${failures}; ` +
    `${posted.length} of ${totalPlatforms} platforms succeeded. ` +
    "The published posts stay up, so retry only the failed platforms.";
};

/**
 * Returned when a cross-platform write fails on one or more platforms. The
 * other platforms may have published, and their posts stay up.
 */
export class FanOutPartialError extends Error {
  /** Stable code for matching this error without parsing the message. */
  readonly code = "FANOUT_PARTIAL" as const;
  /** Posts that were published, in the order the platforms were tried. */
  readonly posted: readonly Post[];
  /** Per-platform failure entries, in the order the platforms were tried. */
  readonly failed: readonly FanOutFailure[];
  /** Total number of platforms that were attempted. */
  readonly totalPlatforms: number;

  /**
   * Create the error from the outcome of every attempted platform.
   *
   * @param params.posted The posts that were published.
   * @param params.failed The platforms that failed, each with its error.
   * @param params.totalPlatforms How many platforms were attempted.
   */
  constructor(params: {
    readonly posted: readonly Post[];
    readonly failed: readonly FanOutFailure[];
    readonly totalPlatforms: number;
  }) {
    super(describeFanOut(params.posted, params.failed, params.totalPlatforms));
    this.name = "FanOutPartialError";
    this.posted = params.posted;
    this.failed = params.failed;
    this.totalPlatforms = params.totalPlatforms;
  }
}
