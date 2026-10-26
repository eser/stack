// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Platform capability notes and character limits.
 * Used to show informative hints in the TUI before potentially limited operations.
 */

import type { Platform } from "../../domain/values/platform.ts";

/** Capability metadata for a single API operation. */
export interface EndpointCost {
  /** Human-readable label. */
  readonly label: string;
  /** Approximate cost per API call in USD, if applicable. */
  readonly estimatedCostPerCall?: number;
  /** Per-platform capability notes shown to the user. */
  readonly platformNotes?: Partial<Record<Platform, string>>;
}

/** Maximum post length in characters per platform. */
export const PLATFORM_CHAR_LIMITS: Record<Platform, number> = {
  twitter: 280,
  bluesky: 300,
};

/** Human-readable platform display names for TUI labels. */
export const PLATFORM_LABELS: Record<Platform, string> = {
  twitter: "Twitter/X",
  bluesky: "Bluesky",
};

/** Short platform badge shown in the unified timeline. */
export const PLATFORM_BADGES: Record<Platform, string> = {
  twitter: "[X]",
  bluesky: "[BS]",
};

/** Capability metadata for every TUI-exposed operation. */
export const DEFAULT_COSTS: Record<string, EndpointCost> = {
  composePost: { label: "Post" },
  replyToPost: { label: "Reply to post" },
  postThread: { label: "Post thread" },
  getTimeline: { label: "View timeline" },
  translateAndPost: {
    label: "Translate & post",
    platformNotes: {
      twitter: "Requires ANTHROPIC_API_KEY to be set.",
      bluesky: "Requires ANTHROPIC_API_KEY to be set.",
    },
  },
  getConversation: {
    label: "View conversation",
    platformNotes: {
      twitter: "Requires search endpoint access on your X API account.",
      bluesky: "Available with any authenticated account.",
    },
  },
  getUsage: {
    label: "Usage & costs",
    platformNotes: {
      twitter: "Usage data available via the X API.",
      bluesky: "Bluesky has no billing API.",
    },
  },
  schedule: {
    label: "Schedule post",
    platformNotes: {
      twitter: "Scheduling is not yet implemented.",
      bluesky: "Scheduling is not yet implemented.",
    },
  },
};
