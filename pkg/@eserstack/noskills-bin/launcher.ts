// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The launcher of an npm package that ships a Go binary.
 *
 * The npm package holds no binary itself: it runs the one npm installed with
 * it, from the optional dependency `@eserstack/<command>-<platform>-<arch>`
 * that matches this machine, with the same arguments, standard streams and
 * exit code (TASK-261).
 *
 * It runs only under Node, as an npm bin, so it uses the node: builtins
 * directly and imports nothing else: it starts before every hook that calls
 * `npx noskills` or `npx eser`, and stays small. pkg/@eserstack/noskills-bin
 * and pkg/@eserstack/eser-bin carry the same file; a test in each keeps them
 * equal.
 *
 * @module
 */

import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as nodeModule from "node:module";
import * as path from "node:path";

// The process of the Node that runs the launcher.
const process = globalThis.process;

/** What one launcher runs. */
export type Launcher = {
  /** The binary's name, which is also the npm package's name and bin. */
  readonly command: string;
  /** The platform packages, by `<process.platform>-<process.arch>`. */
  readonly platformPackages: Readonly<Record<string, string>>;
  /** The Go command that builds the binary, such as `cmd/noskills`. */
  readonly source: string;
};

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
  launcher: Launcher,
  platform: string,
  arch: string,
  resolvePackageJson: (name: string) => string,
  exists: (file: string) => boolean,
): BinaryLookup => {
  const { command } = launcher;
  const key = `${platform}-${arch}`;
  const name = launcher.platformPackages[key];

  if (name === undefined) {
    return {
      kind: "missing",
      message: `${command}: no prebuilt binary for ${key}. The npm package ships one for ${Object.keys(
        launcher.platformPackages,
      ).join(
        ", ",
      )}; on another platform, build ${launcher.source} from https://github.com/eser/stack with Go.`,
    };
  }

  let manifest: string;
  try {
    manifest = resolvePackageJson(name);
  } catch {
    return {
      kind: "missing",
      message: `${command}: the platform package ${name} is not installed. npm installs it as an optional dependency of ${command}; reinstall ${command} without --omit=optional or --no-optional.`,
    };
  }

  const binary = path.join(
    path.dirname(manifest),
    platform === "win32" ? `${command}.exe` : command,
  );

  if (!exists(binary)) {
    return {
      kind: "missing",
      message: `${command}: ${name} has no binary at ${binary}; reinstall ${command}.`,
    };
  }

  return { kind: "found", path: binary };
};

/**
 * The execute bits for user, group and others, which npm pack keeps on the
 * binary and pnpm pack drops (TASK-368).
 */
export const EXECUTE_BITS = 0o111;

/** What the launcher reads and changes of the binary's mode. */
export type ModeAccess = {
  /** Whether the current user may execute the file. */
  readonly isExecutable: (file: string) => boolean;
  /** The file's mode, as `fs.statSync(file).mode`. */
  readonly mode: (file: string) => number;
  readonly chmod: (file: string, mode: number) => void;
};

/** Whether the binary can run, or why it cannot. */
export type Preparation =
  | { readonly kind: "ready" }
  | { readonly kind: "failed"; readonly message: string };

/**
 * Makes the binary executable when it is not. pnpm pack writes the binary of
 * a platform package at mode 0644, and the release publishes those packages
 * with pnpm, so an installed binary may lack the execute bits; the launcher
 * adds them to its mode before it runs it. Windows has no execute bit.
 */
export const ensureExecutable = (
  launcher: Launcher,
  binary: string,
  platform: string,
  access: ModeAccess,
): Preparation => {
  if (platform === "win32" || access.isExecutable(binary)) {
    return { kind: "ready" };
  }

  try {
    access.chmod(binary, access.mode(binary) | EXECUTE_BITS);
  } catch (error) {
    // A read-only install, or one another user owns, cannot be changed.
    const reason = error instanceof Error ? error.message : String(error);

    return {
      kind: "failed",
      message: `${launcher.command}: ${binary} is not executable and the launcher cannot change its mode (${reason}). Run \`chmod +x ${binary}\` as the owner of the install (with sudo for a global one), or reinstall ${launcher.command}.`,
    };
  }

  return { kind: "ready" };
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

/**
 * Runs the binary with this process's arguments and `env` added to its
 * environment, and exits with its code. `from` is the launcher bin's
 * `import.meta.url`, where the platform packages are resolved from.
 */
export const main = (
  launcher: Launcher,
  from: string,
  env: Readonly<Record<string, string>>,
): void => {
  const require = nodeModule.createRequire(from);
  const lookup = findBinary(
    launcher,
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

  const preparation = ensureExecutable(
    launcher,
    lookup.path,
    process.platform,
    {
      isExecutable: (file) => {
        try {
          fs.accessSync(file, fs.constants.X_OK);

          return true;
        } catch {
          return false;
        }
      },
      mode: (file) => fs.statSync(file).mode,
      chmod: (file, mode) => fs.chmodSync(file, mode),
    },
  );

  if (preparation.kind === "failed") {
    process.stderr.write(`${preparation.message}\n`);
    process.exitCode = 1;

    return;
  }

  const child = childProcess.spawn(lookup.path, process.argv.slice(2), {
    stdio: "inherit",
    env: { ...process.env, ...env },
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
      `${launcher.command}: cannot run ${lookup.path}: ${error.message}\n`,
    );
    process.exit(1);
  });

  child.on("exit", (code, signal) => {
    process.exit(exitCodeOf(code, signal));
  });
};
