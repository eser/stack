// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as runtime from "../standards/runtime.ts";
import { semver } from "./deps.ts";

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
