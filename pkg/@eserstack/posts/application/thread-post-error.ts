// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * ThreadPartialError — returned via Result when sequential thread posting fails partway through.
 * Carries the posts that were successfully published before the failure.
 * Lives in the application layer so both platform adapters and UI adapters
 * can import it without cross-adapter dependencies.
 */

import type { Post } from "../domain/entities/post.ts";

/** Returned when one post in a thread fails to publish after partial success. */
export class ThreadPartialError extends Error {
  readonly code = "THREAD_PARTIAL" as const;
  /** The error that caused the post at failedIndex to fail. */
  readonly failureCause: Error;

  constructor(
    /** Posts that were successfully published before the failure. */
    readonly postedTweets: readonly Post[],
    /** Zero-based index of the post that failed to publish. */
    readonly failedIndex: number,
    /** Total number of posts in the thread. */
    readonly totalCount: number,
    cause: Error,
  ) {
    super(
      `Thread partially posted: ${postedTweets.length}/${totalCount} succeeded, failed at index ${failedIndex}`,
      { cause },
    );
    this.name = "ThreadPartialError";
    this.failureCause = cause;
  }
}
