// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Bridge between {@link CliApp} and the cross-runtime execution detector.
 *
 * @module
 */

import * as standardsCrossRuntime from "@eserstack/standards/cross-runtime";

import type { CliApp } from "./app.ts";

/**
 * Adapts the app descriptor to the cross-runtime detector's shape.
 *
 * One conversion, used by every handler that needs it — the alternative was a
 * hardcoded ESER_OPTS constant per file, which is exactly what made this tree
 * un-shareable.
 */
export const appOpts = (
  app: CliApp,
): standardsCrossRuntime.CliCommandOptions => ({
  command: app.command,
  devCommand: app.devCommand,
  npmPackage: app.npmPackage ?? app.command,
  jsrPackage: app.jsrPackage ?? `@eserstack/${app.command}`,
});
