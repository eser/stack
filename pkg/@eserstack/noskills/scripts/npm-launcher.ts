// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// An npm bin that runs only under Node, so it imports the node: builtins
// directly (see the module comment).
// deno-lint-ignore-file no-external-import

/**
 * The `noskills` command of the npm package (TASK-261).
 *
 * The npm package is a launcher: it runs the Go noskills binary that npm
 * installed with it, from the optional dependency
 * `@eserstack/noskills-<platform>-<arch>` that matches this machine, with the
 * same arguments, standard streams and exit code. npm-build.ts bundles this
 * file into `dist/noskills.js`.
 *
 * The package also carries the TypeScript CLI bundle, `ts/noskills.js`. The
 * launcher names it in NOSKILLS_TS_BUNDLE, and the binary runs it for the
 * commands that are not ported to Go yet (`watch`, `manager`, `web`).
 *
 * The launcher runs only under Node, as an npm bin, so it uses the node:
 * builtins directly and imports nothing else: it starts before every hook
 * that calls `npx noskills`, and stays small.
 *
 * @module
 */

import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as nodeModule from "node:module";
import * as path from "node:path";
import * as url from "node:url";

// The process of the Node that runs the launcher.
const process = globalThis.process;

/** The platform packages, by `<process.platform>-<process.arch>`. */
export const PLATFORM_PACKAGES: Readonly<Record<string, string>> = {
  "darwin-arm64": "@eserstack/noskills-darwin-arm64",
  "darwin-x64": "@eserstack/noskills-darwin-x64",
  "linux-arm64": "@eserstack/noskills-linux-arm64",
  "linux-x64": "@eserstack/noskills-linux-x64",
  "win32-x64": "@eserstack/noskills-win32-x64",
};

/** The environment variable that names the TypeScript CLI bundle. */
export const TS_BUNDLE_ENV = "NOSKILLS_TS_BUNDLE";

/** Where the binary is, or why there is none. */
export type BinaryLookup =
  | { readonly kind: "found"; readonly path: string }
  | { readonly kind: "missing"; readonly message: string };

/**
 * Finds the binary of the platform package for `platform` and `arch`.
 * `resolvePackageJson` returns the path of a package's package.json, or
 * throws when the package is not installed.
 */
export const findBinary = (
  platform: string,
  arch: string,
  resolvePackageJson: (name: string) => string,
  exists: (file: string) => boolean,
): BinaryLookup => {
  const key = `${platform}-${arch}`;
  const name = PLATFORM_PACKAGES[key];

  if (name === undefined) {
    return {
      kind: "missing",
      message:
        `noskills: no prebuilt binary for ${key}. The npm package ships one for ${
          Object.keys(PLATFORM_PACKAGES).join(", ")
        }; on another platform, build cmd/noskills from https://github.com/eser/stack with Go.`,
    };
  }

  let manifest: string;
  try {
    manifest = resolvePackageJson(name);
  } catch {
    return {
      kind: "missing",
      message:
        `noskills: the platform package ${name} is not installed. npm installs it as an optional dependency of noskills; reinstall noskills without --omit=optional or --no-optional.`,
    };
  }

  const binary = path.join(
    path.dirname(manifest),
    platform === "win32" ? "noskills.exe" : "noskills",
  );

  if (!exists(binary)) {
    return {
      kind: "missing",
      message:
        `noskills: ${name} has no binary at ${binary}; reinstall noskills.`,
    };
  }

  return { kind: "found", path: binary };
};

/**
 * The exit code the launcher ends with: the binary's, or the shell's
 * 128 + n for a binary that a signal ended.
 */
export const exitCodeOf = (
  code: number | null,
  signal: string | null,
): number => {
  if (code !== null) {
    return code;
  }

  const number = signal === null ? undefined : nodeSignalNumber(signal);

  return number === undefined ? 1 : 128 + number;
};

const nodeSignalNumber = (signal: string): number | undefined => {
  const numbers: Record<string, number> = {
    SIGHUP: 1,
    SIGINT: 2,
    SIGQUIT: 3,
    SIGKILL: 9,
    SIGTERM: 15,
  };

  return numbers[signal];
};

/** Runs the binary with this process's arguments and exits with its code. */
export const main = (): void => {
  const require = nodeModule.createRequire(import.meta.url);
  const lookup = findBinary(
    process.platform,
    process.arch,
    (name) => require.resolve(`${name}/package.json`),
    (file) => fs.existsSync(file),
  );

  if (lookup.kind === "missing") {
    process.stderr.write(`${lookup.message}\n`);
    process.exitCode = 1;

    return;
  }

  const here = path.dirname(url.fileURLToPath(import.meta.url));
  const child = childProcess.spawn(lookup.path, process.argv.slice(2), {
    stdio: "inherit",
    env: {
      ...process.env,
      [TS_BUNDLE_ENV]: path.join(here, "ts", "noskills.js"),
    },
  });

  // The launcher waits for the binary, which handles the signals itself (a
  // `noskills run` turn is cancelled cleanly), so a signal is passed on and
  // does not end the launcher. A terminal's Ctrl+C reaches the binary twice
  // that way, which it ignores after the first. On Windows the console gives
  // Ctrl+C to the binary itself, and kill() would end it at once.
  const forward = (signal: "SIGINT" | "SIGTERM" | "SIGHUP") => () => {
    if (process.platform !== "win32") {
      child.kill(signal);
    }
  };

  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    process.on(signal, forward(signal));
  }

  child.on("error", (error) => {
    process.stderr.write(
      `noskills: cannot run ${lookup.path}: ${error.message}\n`,
    );
    process.exit(1);
  });

  child.on("exit", (code, signal) => {
    process.exit(exitCodeOf(code, signal));
  });
};
