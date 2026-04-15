// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Dirty-region tracking for panel rendering.
 *
 * Provides pure functions for tracking which layout panels need
 * re-rendering, with optional content-hash-based invalidation to
 * skip re-renders when content has not actually changed.
 *
 * @module
 */

import * as layoutTypes from "./layout-types.ts";

/** Factory — all regions start dirty (need initial render). */
export const createDirtyTracker = (
  panelIds: ReadonlyArray<string>,
): layoutTypes.DirtyTracker => ({
  regions: panelIds.map((panelId) => ({
    panelId,
    dirty: true,
  })),
});

/** Returns new tracker with the specified region marked dirty. If panelId not found, returns tracker unchanged. */
export const markDirty = (
  tracker: layoutTypes.DirtyTracker,
  panelId: string,
): layoutTypes.DirtyTracker => {
  const index = tracker.regions.findIndex((r) => r.panelId === panelId);

  if (index === -1) {
    return tracker;
  }

  return {
    regions: tracker.regions.map((r) =>
      r.panelId === panelId ? { ...r, dirty: true } : r
    ),
  };
};

/** Returns new tracker with ALL regions marked dirty (e.g., after terminal resize). */
export const markAllDirty = (
  tracker: layoutTypes.DirtyTracker,
): layoutTypes.DirtyTracker => ({
  regions: tracker.regions.map((r) => ({ ...r, dirty: true })),
});

/** Returns new tracker with the specified region marked clean, optionally storing a content hash. */
export const markClean = (
  tracker: layoutTypes.DirtyTracker,
  panelId: string,
  contentHash?: number,
): layoutTypes.DirtyTracker => {
  const index = tracker.regions.findIndex((r) => r.panelId === panelId);

  if (index === -1) {
    return tracker;
  }

  return {
    regions: tracker.regions.map((r) =>
      r.panelId === panelId
        ? {
          ...r,
          dirty: false,
          lastRenderHash: contentHash ?? r.lastRenderHash,
        }
        : r
    ),
  };
};

/** Returns whether the specified region needs re-rendering. */
export const isDirty = (
  tracker: layoutTypes.DirtyTracker,
  panelId: string,
): boolean => {
  const region = tracker.regions.find((r) => r.panelId === panelId);

  return region?.dirty ?? false;
};

/** Returns array of panel IDs that are currently dirty. */
export const getDirtyPanelIds = (
  tracker: layoutTypes.DirtyTracker,
): ReadonlyArray<string> =>
  tracker.regions.filter((r) => r.dirty).map((r) => r.panelId);

/**
 * Content-based dirty detection: compares contentHash with lastRenderHash.
 * If different (or no previous hash), marks dirty. If same, leaves unchanged.
 * This allows skipping re-renders when content hasn't actually changed.
 */
export const markDirtyIfChanged = (
  tracker: layoutTypes.DirtyTracker,
  panelId: string,
  contentHash: number,
): layoutTypes.DirtyTracker => {
  const region = tracker.regions.find((r) => r.panelId === panelId);

  if (region === undefined) {
    return tracker;
  }

  if (region.lastRenderHash === contentHash) {
    return tracker;
  }

  return {
    regions: tracker.regions.map((r) =>
      r.panelId === panelId ? { ...r, dirty: true } : r
    ),
  };
};

/**
 * A fast, non-cryptographic hash function (djb2) for content comparison.
 * Returns an unsigned 32-bit integer.
 */
export const simpleHash = (content: string): number => {
  let hash = 5381;

  for (let i = 0; i < content.length; i++) {
    hash = ((hash << 5) + hash) + content.charCodeAt(i);
  }

  return hash >>> 0;
};
