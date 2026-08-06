// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Version check utilities - shared by version and doctor handlers.
 *
 * Checks for CLI updates by comparing the current version against the
 * latest GitHub release, with 24-hour caching in ~/.cache/eser/.
 *
 * @module
 */

import * as standardsCrossRuntime from "@eserstack/standards/cross-runtime";
import * as versions from "@eserstack/standards/versions";

const runtime = standardsCrossRuntime.runtime;

const CACHE_DIR = ".cache/eser";
const CACHE_FILE = "latest-version.json";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * How long to wait after a FAILED or timed-out attempt before trying again.
 *
 * Short enough that a genuinely available update is still noticed the same day,
 * long enough that a machine which cannot reach api.github.com -- offline, or
 * behind a proxy that blackholes it -- stops paying UPDATE_CHECK_TIMEOUT_MS on
 * every single command.
 */
const ATTEMPT_BACKOFF_MS = 60 * 60 * 1000; // 1 hour
const RELEASES_URL = "https://api.github.com/repos/eser/stack/releases/latest";

/**
 * Result of an update check.
 */
export type UpdateCheckResult = {
  latestVersion: string;
  currentVersion: string;
  updateAvailable: boolean;
};

type CachedVersion = {
  latestVersion: string;
  checkedAt: number;
  /**
   * When a fetch was last STARTED, successful or not.
   *
   * Separate from checkedAt because the two answer different questions.
   * checkedAt says "when did we last learn the latest version"; attemptedAt says
   * "when did we last try". Without the second one a fetch that never finishes
   * leaves no trace, and every subsequent run tries again from scratch.
   */
  attemptedAt?: number;
};

const getCachePath = (): string => {
  const home = standardsCrossRuntime.getHomedir();

  return runtime.path.join(home, CACHE_DIR, CACHE_FILE);
};

const getCacheDir = (): string => {
  const home = standardsCrossRuntime.getHomedir();

  return runtime.path.join(home, CACHE_DIR);
};

const readCache = async (): Promise<CachedVersion | undefined> => {
  try {
    const cachePath = getCachePath();
    const exists = await runtime.fs.exists(cachePath);

    if (!exists) {
      return undefined;
    }

    const content = await runtime.fs.readTextFile(cachePath);
    const cached = JSON.parse(content) as CachedVersion;

    if (
      typeof cached.latestVersion !== "string" ||
      typeof cached.checkedAt !== "number"
    ) {
      return undefined;
    }

    return cached;
  } catch {
    return undefined;
  }
};

const writeCache = async (
  latestVersion: string,
  attemptedAt?: number,
): Promise<void> => {
  try {
    const cacheDir = getCacheDir();
    await runtime.fs.ensureDir(cacheDir);

    const cachePath = getCachePath();
    const data: CachedVersion = {
      latestVersion,
      checkedAt: Date.now(),
      attemptedAt: attemptedAt ?? Date.now(),
    };

    await runtime.fs.writeTextFile(cachePath, JSON.stringify(data));
  } catch {
    // Skip caching if directory creation or write fails
  }
};

/**
 * Records that a fetch is about to start, keeping whatever version we already
 * knew.
 *
 * This is what stops the check costing 200ms on EVERY invocation. The caller
 * races checkForUpdate against UPDATE_CHECK_TIMEOUT_MS and then exits the
 * process outright, so a fetch slower than that -- which TLS to api.github.com
 * always is -- is killed before it can write anything. Nothing was recorded,
 * so the next run tried again, lost again, and paid the full timeout again,
 * forever. Marking the attempt BEFORE the fetch is the only write guaranteed to
 * survive.
 */
const markAttempt = async (knownVersion: string | undefined): Promise<void> => {
  try {
    await runtime.fs.ensureDir(getCacheDir());

    const data: CachedVersion = {
      latestVersion: knownVersion ?? "",
      // Deliberately old, so a marker never masquerades as a fresh answer.
      checkedAt: 0,
      attemptedAt: Date.now(),
    };

    await runtime.fs.writeTextFile(getCachePath(), JSON.stringify(data));
  } catch {
    // Best effort — a missing marker only costs another attempt.
  }
};

const fetchLatestVersion = async (): Promise<string | undefined> => {
  try {
    const response = await fetch(RELEASES_URL, {
      headers: { "Accept": "application/vnd.github.v3+json" },
    });

    if (!response.ok) {
      return undefined;
    }

    const data = (await response.json()) as { tag_name?: string };
    const tagName = data.tag_name;

    if (typeof tagName !== "string") {
      return undefined;
    }

    // Strip leading 'v' if present
    return tagName.startsWith("v") ? tagName.slice(1) : tagName;
  } catch {
    return undefined;
  }
};

/**
 * Checks for an available update by comparing the current version
 * against the latest GitHub release.
 *
 * Results are cached for 24 hours in ~/.cache/eser/latest-version.json.
 * Returns undefined if the check fails for any reason (no network, etc.).
 */
export const checkForUpdate = async (
  currentVersionArg: string,
): Promise<
  UpdateCheckResult | undefined
> => {
  try {
    const currentVersion = currentVersionArg;

    // Try reading from cache first
    const cached = await readCache();

    if (cached !== undefined) {
      const age = Date.now() - cached.checkedAt;

      if (age < CACHE_TTL_MS) {
        return {
          latestVersion: cached.latestVersion,
          currentVersion,
          updateAvailable: versions.compareTextVersions(
            currentVersion,
            cached.latestVersion,
          ),
        };
      }
    }

    // Back off after a recent attempt that produced nothing.
    //
    // Without this the timeout is paid on every invocation forever: the caller
    // kills the process at UPDATE_CHECK_TIMEOUT_MS, so a slow fetch never gets
    // to record anything, and the next run repeats it.
    if (
      cached?.attemptedAt !== undefined &&
      Date.now() - cached.attemptedAt < ATTEMPT_BACKOFF_MS
    ) {
      return undefined;
    }

    // Recorded BEFORE the fetch, because this is the only write that is certain
    // to happen while the process is still alive.
    await markAttempt(cached?.latestVersion);

    const latestVersion = await fetchLatestVersion();

    if (latestVersion === undefined) {
      return undefined;
    }

    // Update cache (fire-and-forget, errors are swallowed)
    await writeCache(latestVersion);

    return {
      latestVersion,
      currentVersion,
      updateAvailable: versions.compareTextVersions(
        currentVersion,
        latestVersion,
      ),
    };
  } catch {
    return undefined;
  }
};
