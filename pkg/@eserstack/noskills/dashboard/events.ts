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

/** Append a single event to the JSONL log. Creates file/dir if needed. */
export const appendEvent = async (
  root: string,
  event: DashboardEvent,
): Promise<void> => {
  const dir = `${root}/${persistence.paths.eventsDir}`;
  const file = `${root}/${persistence.paths.eventsFile}`;

  await runtime.fs.mkdir(dir, { recursive: true });

  const line = JSON.stringify(event) + "\n";

  let existing = "";
  try {
    existing = await runtime.fs.readTextFile(file);
  } catch {
    // File doesn't exist yet
  }
  await runtime.fs.writeTextFile(file, existing + line);
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

/** Watch for new events. Returns an unsubscribe function. */
export const watchEvents = (
  root: string,
  callback: (event: DashboardEvent) => void,
): () => void => {
  const file = `${root}/${persistence.paths.eventsFile}`;
  let lastSize = 0;
  let aborted = false;

  // Initialize last known size
  (async () => {
    try {
      const stat = await runtime.fs.stat(file);
      lastSize = stat.size;
    } catch {
      lastSize = 0;
    }
  })();

  // Poll for changes (cross-platform, no native fs.watch dependency)
  const interval = setInterval(async () => {
    if (aborted) return;

    try {
      const stat = await runtime.fs.stat(file);
      if (stat.size <= lastSize) return;

      const content = await runtime.fs.readTextFile(file);

      // Read new lines from the end
      const allBytes = new TextEncoder().encode(content);
      if (allBytes.length > lastSize) {
        const newContent = content.slice(
          new TextDecoder().decode(allBytes.slice(0, lastSize)).length,
        );
        const newLines = newContent.trim().split("\n").filter((l) =>
          l.length > 0
        );

        for (const line of newLines) {
          try {
            const event = JSON.parse(line) as DashboardEvent;
            callback(event);
          } catch {
            // Skip malformed lines
          }
        }
      }

      lastSize = stat.size;
    } catch {
      // File may not exist yet
    }
  }, 500);

  return () => {
    aborted = true;
    clearInterval(interval);
  };
};
