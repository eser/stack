// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Thread value object — an ordered sequence of post texts to be published
 * sequentially, each replying to the previous one.
 * Pure value; no I/O or platform knowledge.
 */

/** An ordered sequence of post texts forming a thread. */
export interface Thread {
  readonly posts: ReadonlyArray<string>;
}

/**
 * Validate and construct a Thread.
 * Throws if fewer than 2 posts are provided or any post text is empty.
 */
export function createThread(posts: ReadonlyArray<string>): Thread {
  if (posts.length < 2) {
    throw new Error("A thread must contain at least 2 posts.");
  }
  posts.forEach((post, i) => {
    if (post.trim().length === 0) {
      throw new Error(`Post ${i + 1} in the thread cannot be empty.`);
    }
  });
  return { posts };
}
