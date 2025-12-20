// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as versions from "@eser/standards/versions";
import { runtime } from "@eser/standards/runtime";

export const checkMinDenoVersion = (minimumVersion: string) => {
  return versions.compareTextVersions(
    runtime.version,
    minimumVersion,
  );
};
