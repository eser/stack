// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import {
  greaterOrEqual,
  isRange,
  parse,
  parseRange,
  Range,
  ReleaseType,
  satisfies,
  SemVer,
} from "@std/semver";

export const compareSemanticVersions = (
  currentVersion: SemVer,
  targetVersion: Range | SemVer,
) => {
  if (isRange(targetVersion)) {
    return satisfies(currentVersion, targetVersion);
  }

  return !greaterOrEqual(currentVersion, targetVersion);
};

export const compareTextVersions = (
  currentVersion: string,
  targetVersion: string,
) => {
  const currentSemanticVersion = parse(currentVersion);
  const targetSemanticVersion = parseRange(targetVersion);

  return compareSemanticVersions(currentSemanticVersion, targetSemanticVersion);
};

export function maxVersion(
  v0: ReleaseType,
  v1: ReleaseType,
): ReleaseType {
  if (v0 === "major" || v1 === "major") {
    return "major";
  }

  if (v0 === "minor" || v1 === "minor") {
    return "minor";
  }

  return "patch";
}
