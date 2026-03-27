// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Version check utilities - shared by version and doctor handlers.
 *
 * Checks for CLI updates by comparing the current version against the
 * latest GitHub release, with 24-hour caching in ~/.cache/eser/.
 *
 * @module
 */

import * as standardsCrossRuntime from "@eser/standards/cross-runtime";
import * as versions from "@eser/standards/versions";
import config from "../../package.json" with { type: "json" };

const runtime = standardsCrossRuntime.runtime;

const CACHE_DIR = ".cache/eser";
const CACHE_FILE = "latest-version.json";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
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

const writeCache = async (latestVersion: string): Promise<void> => {
  try {
    const cacheDir = getCacheDir();
    await runtime.fs.ensureDir(cacheDir);

    const cachePath = getCachePath();
    const data: CachedVersion = {
      latestVersion,
      checkedAt: Date.now(),
    };

    await runtime.fs.writeTextFile(cachePath, JSON.stringify(data));
  } catch {
    // Skip caching if directory creation or write fails
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
export const checkForUpdate = async (): Promise<
  UpdateCheckResult | undefined
> => {
  try {
    const currentVersion = config.version;

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

    // Cache is stale or missing — fetch from GitHub
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
