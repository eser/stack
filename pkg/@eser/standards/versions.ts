// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as semver from "@std/semver";

export const compareSemanticVersions = (
  currentVersion: semver.SemVer,
  targetVersion: semver.Range | semver.SemVer,
): boolean => {
  if (semver.isRange(targetVersion)) {
    return semver.satisfies(currentVersion, targetVersion);
  }

  return !semver.greaterOrEqual(currentVersion, targetVersion);
};

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

export function maxVersion(
  v0: semver.ReleaseType,
  v1: semver.ReleaseType,
): semver.ReleaseType {
  if (v0 === "major" || v1 === "major") {
    return "major";
  }

  if (v0 === "minor" || v1 === "minor") {
    return "minor";
  }

  return "patch";
}
