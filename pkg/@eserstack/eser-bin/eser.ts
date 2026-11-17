#!/usr/bin/env -S node
// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The `eser` bin of the npm package `eser`.
 *
 * It runs the Go eser binary of this machine's platform package
 * (launcher.ts, TASK-254). The binary forwards `eser noskills`, `eser laroux`
 * and `eser posts` to their own bins, which it looks up on PATH and in each
 * directory of ESER_PLUGIN_PATH. This package depends on `noskills` at its own
 * version, so the hooks v4.5.x wrote into repositories
 * (`npx eser@latest noskills ...`) find noskills without a global install and
 * without the network (decision-10): the launcher adds every `node_modules/.bin`
 * above itself, where npm links the noskills bin, to ESER_PLUGIN_PATH.
 *
 * Usage:
 *   npx eser <command> [options]
 *
 * @module
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as process from "node:process";
import * as launcher from "./launcher.ts";

/** The launcher of the Go eser. */
export const ESER: launcher.Launcher = {
  command: "eser",
  platformPackages: {
    "darwin-arm64": "@eserstack/eser-darwin-arm64",
    "darwin-x64": "@eserstack/eser-darwin-x64",
    "linux-arm64": "@eserstack/eser-linux-arm64",
    "linux-x64": "@eserstack/eser-linux-x64",
    "win32-x64": "@eserstack/eser-win32-x64",
  },
  source: "cmd/eser",
};

/** The environment variable the Go eser reads plugin directories from. */
export const PLUGIN_PATH_ENV = "ESER_PLUGIN_PATH";

/**
 * Every `node_modules/.bin` directory at or above `start` that `exists`,
 * nearest first: where npm, npx and pnpm link the bins of this package's
 * dependencies.
 */
export const binDirectories = (
  start: string,
  exists: (dir: string) => boolean,
): string[] => {
  const found: string[] = [];
  let dir = path.resolve(start);

  for (;;) {
    const bin = path.join(dir, "node_modules", ".bin");

    if (exists(bin)) {
      found.push(bin);
    }

    const parent = path.dirname(dir);

    if (parent === dir) {
      return found;
    }

    dir = parent;
  }
};

/**
 * ESER_PLUGIN_PATH for the binary: the user's value first, then `dirs`, joined
 * with the platform's path list separator.
 */
export const pluginPath = (
  current: string | undefined,
  dirs: readonly string[],
  delimiter: string,
): string =>
  [...(current === undefined || current === "" ? [] : [current]), ...dirs].join(
    delimiter,
  );

if (import.meta.main) {
  const dirs = binDirectories(import.meta.dirname, (dir) => {
    try {
      return fs.statSync(dir).isDirectory();
    } catch {
      return false;
    }
  });

  launcher.main(ESER, import.meta.url, {
    [PLUGIN_PATH_ENV]: pluginPath(
      process.env[PLUGIN_PATH_ENV],
      dirs,
      path.delimiter,
    ),
  });
}
