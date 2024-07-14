// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as semver from "@std/semver";
import * as jsRuntime from "@eser/standards/js-runtime";

export const compareSemanticVersions = (
  currentVersion: semver.SemVer,
  targetVersion: semver.Range | semver.SemVer,
) => {
  if (semver.isRange(targetVersion)) {
    return semver.testRange(currentVersion, targetVersion);
  }

  return !semver.greaterOrEqual(currentVersion, targetVersion);
};

export const compareTextVersions = (
  currentVersion: string,
  targetVersion: string,
) => {
  const currentSemanticVersion = semver.parse(currentVersion);
  const targetSemanticVersion = semver.parseRange(targetVersion);

  return compareSemanticVersions(currentSemanticVersion, targetSemanticVersion);
};

export const checkMinDenoVersion = (minimumVersion: string) => {
  return compareTextVersions(jsRuntime.current.version, minimumVersion);
};
