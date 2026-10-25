// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Semantic version comparisons for update checks.
 *
 * @module
 */

import * as semver from "@std/semver";

/**
 * The bump kinds `maxVersion` compares: `major`, `minor`, `patch` and the
 * prerelease variants of @std/semver.
 */
export type ReleaseType = semver.ReleaseType;

/**
 * Checks `currentVersion` against a target.
 *
 * @param currentVersion - The version in use
 * @param targetVersion - A range, or the newest known version
 * @returns For a range, whether `currentVersion` satisfies it; for a version,
 *   whether `currentVersion` is older than it
 */
export const compareSemanticVersions = (
  currentVersion: semver.SemVer,
  targetVersion: semver.Range | semver.SemVer,
): boolean => {
  if (semver.isRange(targetVersion)) {
    return semver.satisfies(currentVersion, targetVersion);
  }

  return !semver.greaterOrEqual(currentVersion, targetVersion);
};

/**
 * Checks `currentVersion` against a target, both given as text.
 *
 * `targetVersion` is read as a plain version ("4.1.23") when it parses as one,
 * and as a range ("^4.1.0", ">=4.0.0") otherwise.
 *
 * @param currentVersion - The version in use
 * @param targetVersion - A version or a range
 * @returns The result of {@link compareSemanticVersions} on the parsed values
 * @throws If `currentVersion` is not a version, or `targetVersion` is neither
 *   a version nor a range
 */
export const compareTextVersions = (
  currentVersion: string,
  targetVersion: string,
): boolean => {
  const currentSemanticVersion = semver.parse(currentVersion);

  // Try parsing as a plain version first (e.g., "4.1.23"),
  // fall back to range parsing (e.g., "^4.1.0", ">=4.0.0")
  try {
    const targetAsSemVer = semver.parse(targetVersion);
    return compareSemanticVersions(currentSemanticVersion, targetAsSemVer);
  } catch {
    const targetAsRange = semver.parseRange(targetVersion);
    return compareSemanticVersions(currentSemanticVersion, targetAsRange);
  }
};

/**
 * Returns the larger of two release types: `major` over `minor` over `patch`.
 * Any other release type counts as `patch`.
 */
export function maxVersion(v0: ReleaseType, v1: ReleaseType): ReleaseType {
  if (v0 === "major" || v1 === "major") {
    return "major";
  }

  if (v0 === "minor" || v1 === "minor") {
    return "minor";
  }

  return "patch";
}
