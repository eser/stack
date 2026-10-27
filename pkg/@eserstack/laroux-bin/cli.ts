#!/usr/bin/env -S node
// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The `laroux` bin of the npm package `laroux`.
 *
 * The commands live in @eserstack/laroux-server, which this package depends on
 * at the same version. The bin holds no copy of them, so the CLI, the app's
 * server modules and its React all load from the app's node_modules, once.
 *
 * Usage:
 *   npx laroux <command> [options]
 *
 * @module
 */

import * as larouxCli from "@eserstack/laroux-server/cli";

if (import.meta.main) {
  // Bin entry point: the process runs the command and exits when it settles.
  // oxlint-disable-next-line node/no-top-level-await
  await larouxCli.run();
}
