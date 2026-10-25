// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * ThreadPartialError: returned via Result when sequential thread posting
 * fails partway through. Carries the posts that were published before the
 * failure. Lives in the application layer so both platform adapters and UI
 * adapters can import it without cross-adapter dependencies.
 *
 * @module
 */

import type { Post } from "../domain/entities/post.ts";

/**
 * Builds the message: where the thread stopped, why, and what was published,
 * in the same shape as a FanOutPartialError message.
 */
const describeThread = (
  postedCount: number,
  failedIndex: number,
  totalCount: number,
  cause: Error,
): string => {
  const stoppedAt = `index ${failedIndex} (post ${
    failedIndex + 1
  } of ${totalCount})`;

  if (postedCount === 0) {
    return `Thread failed at ${stoppedAt}, so nothing was published: ${cause.message}.`;
  }

  return (
    `Thread stopped at ${stoppedAt}: ${cause.message}. ` +
    `${postedCount} of ${totalCount} posts were published and stay up; ` +
    "the rest were not sent, so continue the thread from the last published post instead of posting it again."
  );
};

/**
 * Returned when a post in a thread fails to publish. The posts before it, if
 * any, stay published; the ones after it are not sent.
 */
export class ThreadPartialError extends Error {
  /** Stable code for matching this error without parsing the message. */
  readonly code = "THREAD_PARTIAL" as const;
  /** The error that caused the post at failedIndex to fail. */
  readonly failureCause: Error;

  /** Posts that were successfully published before the failure. */
  readonly postedTweets: readonly Post[];
  /** Zero-based index of the post that failed to publish. */
  readonly failedIndex: number;
  /** Total number of posts in the thread. */
  readonly totalCount: number;

  // Explicit assignment, not parameter properties: Node's erase-only type
  // stripping cannot emit them.
  /**
   * Create the error for a thread that stopped at `failedIndex`.
   *
   * @param postedTweets The posts published before the failure, in order.
   * @param failedIndex The zero-based index of the post that failed.
   * @param totalCount How many posts the thread has.
   * @param cause Why the post at `failedIndex` failed.
   */
  constructor(
    postedTweets: readonly Post[],
    failedIndex: number,
    totalCount: number,
    cause: Error,
  ) {
    super(describeThread(postedTweets.length, failedIndex, totalCount, cause), {
      cause,
    });
    this.name = "ThreadPartialError";
    this.failureCause = cause;
    this.postedTweets = postedTweets;
    this.failedIndex = failedIndex;
    this.totalCount = totalCount;
  }
}
