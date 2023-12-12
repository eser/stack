// Copyright 2023-present the cool authors. All rights reserved. MIT license.

import * as semver from "$std/semver/mod.ts";
import * as runtime from "../standards/runtime.ts";

export function compareSemanticVersions(
  currentVersion: semver.SemVer,
  targetVersion: semver.SemVerRange | semver.SemVer,
) {
  if (semver.isSemVerRange(targetVersion)) {
    return semver.testRange(currentVersion, targetVersion);
  }

  return !semver.gte(currentVersion, targetVersion);
}

export function compareTextVersions(
  currentVersion: string,
  targetVersion: string,
) {
  const currentSemanticVersion = semver.parse(currentVersion);
  const targetSemanticVersion = semver.parseRange(targetVersion);

  return compareSemanticVersions(currentSemanticVersion, targetSemanticVersion);
}

export function checkMinDenoVersion(minimumVersion: string) {
  return compareTextVersions(runtime.version.runtime, minimumVersion);
}
