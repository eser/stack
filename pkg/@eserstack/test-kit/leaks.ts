// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * An opt-in check that fails a test when it leaves resources behind: a timer
 * it never cleared, a server it never closed, a socket still open. It
 * compares `process.getActiveResourcesInfo()` before and after each test, so
 * it runs on Node only.
 *
 * Call `checkLeaks()` at the top of a test file to check every test in it, or
 * inside a `describe` block to check that suite only. Unref'd timers and
 * handles do not keep the process alive and are not counted.
 *
 * @example
 * ```typescript
 * import * as nodeTest from "node:test";
 * import * as leaks from "@eserstack/test-kit/leaks";
 *
 * leaks.checkLeaks();
 *
 * nodeTest.test("clears its timer", () => {
 *   const timer = setTimeout(() => {}, 1000);
 *   clearTimeout(timer);
 * });
 * ```
 *
 * @module
 */

import * as nodeTest from "node:test";
import * as assert from "./assert.ts";

/** A resource type whose count grew during a test. */
export type LeakedResource = {
  /** The type name Node reports, such as `"Timeout"` or `"TCPServerWrap"`. */
  readonly type: string;
  /** How many more resources of this type are active than before the test. */
  readonly count: number;
};

const countByType = (resources: readonly string[]): Map<string, number> => {
  const counts = new Map<string, number>();

  for (const type of resources) {
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }

  return counts;
};

/**
 * Returns the resource types whose count grew from `before` to `after`,
 * sorted by type name. Both lists are `process.getActiveResourcesInfo()`
 * results.
 *
 * @param before - The active resources before the test
 * @param after - The active resources after the test
 * @returns The types with more active resources after the test
 */
export const diffResources = (
  before: readonly string[],
  after: readonly string[],
): readonly LeakedResource[] => {
  const beforeCounts = countByType(before);
  const leaked: LeakedResource[] = [];

  for (const [type, count] of countByType(after)) {
    const grown = count - (beforeCounts.get(type) ?? 0);

    if (grown > 0) {
      leaked.push({ type, count: grown });
    }
  }

  return leaked.sort((a, b) => a.type.localeCompare(b.type));
};

/**
 * Formats leaked resources as a failure message, for example
 * `"the test leaked active resources: Timeout (+1)"`.
 *
 * @param leaked - The result of `diffResources`
 * @returns The message
 */
export const formatLeaks = (leaked: readonly LeakedResource[]): string => {
  const list = leaked
    .map((resource) => `${resource.type} (+${resource.count})`)
    .join(", ");

  return `the test leaked active resources: ${list}`;
};

const waitForPendingCloses = (): Promise<void> =>
  new Promise((resolve) => setImmediate(resolve));

/**
 * Registers `beforeEach` and `afterEach` hooks that fail each test in the
 * current file or `describe` block when it ends with more active resources
 * than it started with. The check waits one event-loop turn before it reads
 * the resources, so handles closed at the end of the test have time to go.
 */
export const checkLeaks = (): void => {
  let before: readonly string[] = [];

  nodeTest.beforeEach(() => {
    before = process.getActiveResourcesInfo();
  });

  nodeTest.afterEach(async () => {
    await waitForPendingCloses();

    const leaked = diffResources(before, process.getActiveResourcesInfo());

    if (leaked.length > 0) {
      throw new assert.AssertionError(formatLeaks(leaked));
    }
  });
};
