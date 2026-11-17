#!/usr/bin/env -S node
// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The `noskills` bin of the npm package `noskills`.
 *
 * It runs the Go noskills binary of this machine's platform package
 * (launcher.ts). The binary forwards the commands that are not ported to Go
 * yet (`watch`, `manager`, `web`) to the TypeScript CLI, which this package
 * depends on as @eserstack/noskills at the same version; the launcher names
 * that CLI's entry point in NOSKILLS_TS_BUNDLE, and the binary runs it with
 * node.
 *
 * Usage:
 *   npx noskills <command> [options]
 *
 * @module
 */

import * as url from "node:url";
import * as launcher from "./launcher.ts";

/** The launcher of the Go noskills. */
export const NOSKILLS: launcher.Launcher = {
  command: "noskills",
  platformPackages: {
    "darwin-arm64": "@eserstack/noskills-darwin-arm64",
    "darwin-x64": "@eserstack/noskills-darwin-x64",
    "linux-arm64": "@eserstack/noskills-linux-arm64",
    "linux-x64": "@eserstack/noskills-linux-x64",
    "win32-x64": "@eserstack/noskills-win32-x64",
  },
  source: "cmd/noskills",
};

/** The environment variable that names the TypeScript CLI's entry point. */
export const TS_CLI_ENV = "NOSKILLS_TS_BUNDLE";

/** The entry point of the TypeScript CLI, the `.` export of @eserstack/noskills. */
export const tsCLIEntry = (): string =>
  url.fileURLToPath(import.meta.resolve("@eserstack/noskills"));

if (import.meta.main) {
  launcher.main(NOSKILLS, import.meta.url, { [TS_CLI_ENV]: tsCLIEntry() });
}
