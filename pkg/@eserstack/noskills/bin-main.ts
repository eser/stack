// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Entry point for the standalone `noskills` binary.
 *
 * The command tree is the module the `eser` CLI mounts at `eser noskills`,
 * re-rooted. See runStandaloneModule for why both binaries exist and why this
 * is not a second implementation.
 *
 * @module
 */

import * as cliSupport from "@eserstack/codebase/cli-support";
import * as module from "./module.ts";
import config from "./package.json" with { type: "json" };

if (import.meta.main) {
  // Entry point: the await only runs when this file is executed directly.
  // oxlint-disable-next-line node/no-top-level-await
  await cliSupport.runStandaloneModule(
    module.moduleDef,
    "noskills",
    config.version,
  );
}
