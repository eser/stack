// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Scheduler — outbound port for scheduling post delivery.
 * Adapters persist pending jobs to a store (file, DB, queue, etc.).
 */

/** A post that has been queued for future delivery. */
export interface ScheduledPost {
  /** Internal scheduler job identifier. */
  id: string;
  /** The text content that will be posted. */
  text: string;
  /** UTC timestamp when the post should be published. */
  scheduledAt: Date;
}

/** Outbound port: post scheduling persistence. */
export interface Scheduler {
  /** Persist a post to be sent at the given time; returns the job id. */
  schedule(
    params: { text: string; scheduledAt: Date },
  ): Promise<{ id: string }>;
  /** Remove a pending job; no-op if already sent or not found. */
  cancel(id: string): Promise<void>;
  /** List all jobs that have not yet been dispatched. */
  listPending(): Promise<ScheduledPost[]>;
}
