// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Entry point for the standalone `laroux` binary.
 *
 * The command tree is the module the `eser` CLI mounts at `eser laroux`,
 * re-rooted. See runStandaloneModule for why both binaries exist and why this
 * is not a second implementation.
 *
 * @module
 */

import * as cliSupport from "@eserstack/codebase/cli-support";
import * as module from "./module.ts";
import config from "./package.json" with { type: "json" };

if (import.meta.main) {
  // Binary entry point: the process runs the CLI and exits when it settles.
  // deno-lint-ignore no-top-level-await
  await cliSupport.runStandaloneModule(
    module.moduleDef,
    "laroux",
    config.version,
  );
}
