// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Semantic version comparisons for update checks.
 *
 * @module
 */

import * as semver from "semver";

/**
 * The bump kinds `maxVersion` compares: `major`, `minor`, `patch` and the
 * prerelease variants of the semver package.
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
  if (targetVersion instanceof semver.Range) {
    return semver.satisfies(currentVersion, targetVersion);
  }

  return semver.lt(currentVersion, targetVersion);
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
  // The constructors throw a TypeError on text that is not a version or a
  // range.
  const currentSemanticVersion = new semver.SemVer(currentVersion);

  // A plain version first (e.g., "4.1.23"), then a range (e.g., "^4.1.0",
  // ">=4.0.0").
  const targetAsSemVer = semver.parse(targetVersion);
  if (targetAsSemVer !== null) {
    return compareSemanticVersions(currentSemanticVersion, targetAsSemVer);
  }

  return compareSemanticVersions(
    currentSemanticVersion,
    new semver.Range(targetVersion),
  );
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
