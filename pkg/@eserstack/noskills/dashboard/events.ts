// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Dashboard events — append-only JSONL log at
 * `.eser/.state/events/events.jsonl`.
 *
 * @module
 */

import { runtime } from "@eserstack/standards/cross-runtime";
import * as persistence from "../state/persistence.ts";

// =============================================================================
// Types
// =============================================================================

export type EventType =
  | "phase-change"
  | "mention"
  | "mention-reply"
  | "signoff"
  | "note"
  | "task-completed"
  | "spec-created"
  | "answer-added"
  | "delegation-created"
  | "delegation-answered"
  | "approve-blocked";

export type DashboardEvent = {
  readonly ts: string;
  readonly type: EventType;
  readonly spec: string;
  readonly user: string;
  readonly [key: string]: unknown;
};

// =============================================================================
// Paths
// =============================================================================

// Paths are owned by state/persistence.ts; re-export the two that external
// dashboard consumers reach for so the import surface stays stable.
export const eventsDir: string = persistence.paths.eventsDir;
export const eventsFile: string = persistence.paths.eventsFile;

// =============================================================================
// Write
// =============================================================================

/**
 * Append a single event to the JSONL log. Creates file/dir if needed.
 *
 * The line goes to the end of the file in one append write, so concurrent
 * appends from this or another process each keep their line; reading the log
 * and writing it back would drop the lines appended in between.
 */
export const appendEvent = async (
  root: string,
  event: DashboardEvent,
): Promise<void> => {
  const dir = `${root}/${persistence.paths.eventsDir}`;
  const file = `${root}/${persistence.paths.eventsFile}`;

  await runtime.fs.mkdir(dir, { recursive: true });
  await runtime.fs.writeTextFile(file, JSON.stringify(event) + "\n", {
    append: true,
  });
};

// =============================================================================
// Read
// =============================================================================

/** Read events from the JSONL log. Newest first by default. */
export const readEvents = async (
  root: string,
  opts?: { limit?: number; since?: string },
): Promise<readonly DashboardEvent[]> => {
  const file = `${root}/${persistence.paths.eventsFile}`;

  let content: string;
  try {
    content = await runtime.fs.readTextFile(file);
  } catch {
    return [];
  }

  let events = content
    .trim()
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => {
      try {
        return JSON.parse(line) as DashboardEvent;
      } catch {
        return null;
      }
    })
    .filter((e): e is DashboardEvent => e !== null);

  // Filter by timestamp if since is provided
  if (opts?.since !== undefined) {
    events = events.filter((e) => e.ts > opts.since!);
  }

  // Newest first
  events.reverse();

  // Limit
  if (opts?.limit !== undefined && opts.limit > 0) {
    events = events.slice(0, opts.limit);
  }

  return events;
};

// =============================================================================
// Watch
// =============================================================================

/** Reads the events appended to the log after it was opened. */
export type EventTail = {
  /**
   * The events completed since the last call, oldest first. A line without
   * its newline yet is left for a later call.
   */
  readonly poll: () => Promise<readonly DashboardEvent[]>;
};

const NEWLINE = 0x0a;

/** Parse each non-empty line, skipping the lines that are not JSON. */
const parseLines = (text: string): DashboardEvent[] =>
  text
    .split("\n")
    .filter((line) => line.length > 0)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as DashboardEvent];
      } catch {
        return [];
      }
    });

/**
 * Open a tail at the current end of the log, so only the events appended from
 * now on are read. A missing log starts at 0.
 *
 * The tail counts bytes and stops at the last newline it has seen, so a line
 * that is still being written, or a multi-byte character cut by a write, is
 * read once the rest of it is there. A log that is shorter than what was read
 * (rewritten or truncated) is read again only once it grows past that point.
 */
export const openEventTail = async (root: string): Promise<EventTail> => {
  const file = `${root}/${persistence.paths.eventsFile}`;
  const decoder = new TextDecoder();

  let offset = 0;
  try {
    offset = (await runtime.fs.stat(file)).size;
  } catch {
    // No log yet: everything written to it is new.
  }

  const poll = async (): Promise<readonly DashboardEvent[]> => {
    let bytes: Uint8Array;
    try {
      bytes = await runtime.fs.readFile(file);
    } catch {
      // The log may not exist yet; the next poll tries again.
      return [];
    }

    if (bytes.length <= offset) {
      return [];
    }

    const complete = bytes.lastIndexOf(NEWLINE);
    if (complete < offset) {
      return [];
    }

    const fresh = bytes.subarray(offset, complete);
    offset = complete + 1;

    return parseLines(decoder.decode(fresh));
  };

  return { poll };
};

/** Options for {@link watchEvents}. */
export type WatchOptions = {
  /** How often the log is polled; 500 ms by default. */
  readonly intervalMs?: number;
};

const DEFAULT_WATCH_INTERVAL_MS = 500;

/**
 * Watch for new events. Returns an unsubscribe function.
 *
 * Polls the log (no native fs.watch dependency). The first poll waits for the
 * tail to know where the log ended, and a poll that is still reading makes the
 * next tick wait, so no event is replayed or read twice.
 */
export const watchEvents = (
  root: string,
  callback: (event: DashboardEvent) => void,
  options?: WatchOptions,
): (() => void) => {
  const tail = openEventTail(root);
  let aborted = false;
  let polling = false;

  const interval = setInterval(async () => {
    if (aborted || polling) return;

    polling = true;
    try {
      const fresh = await (await tail).poll();
      for (const event of fresh) {
        if (aborted) return;
        try {
          callback(event);
        } catch {
          // A failing subscriber skips this event and keeps the watcher.
        }
      }
    } finally {
      polling = false;
    }
  }, options?.intervalMs ?? DEFAULT_WATCH_INTERVAL_MS);

  return () => {
    aborted = true;
    clearInterval(interval);
  };
};
