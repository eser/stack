// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * External subcommand resolution — the `eser <name>` → `eser-<name>` rule.
 *
 * This is git's plugin convention, generically: any executable named
 * `eser-<name>` on PATH becomes `eser <name>`, with no registration and no
 * change to this CLI. `git lfs` works because `git-lfs` is on PATH; the same
 * holds for `docker compose` and `kubectl <plugin>`.
 *
 * It exists here because the stack ships Go binaries this TypeScript CLI cannot
 * absorb. `eser-acp` is the ACP shim: a Go program that speaks JSON-RPC on
 * stdio and is spawned by Go (`pkg/ajan/aifx`, `pkg/ajan/noskillsserverfx`) via
 * `exec.LookPath`. Reimplementing it as a TypeScript submodule would mean a Go
 * caller spawning a JS runtime that FFIs back into Go — so the binary stays a
 * binary, and this rule is what makes it reachable by the name a user expects.
 *
 * Resolution order in the CLI's fallback is: built-in modules, then manifest
 * scripts, then this. Project-local intent wins over an installed plugin.
 *
 * @module
 */

import * as shellExec from "@eserstack/shell/exec";
import { getPlatform, runtime } from "@eserstack/standards/cross-runtime";

/** Prefix an executable must carry to be reachable as a subcommand. */
export const PLUGIN_PREFIX = "eser-";

/**
 * Resolves the executable backing `eser <name>`, or null when there is none.
 *
 * PATH is walked here rather than shelling out to `which`. Two reasons, both
 * practical: a lookup per unknown subcommand should not cost a subprocess, and
 * the shared exec path runs through the Go native library, which caches the
 * environment it was started with — so a PATH exported after load is not
 * observed, which makes `which` both slower and less accurate than reading the
 * variable directly.
 */
export const resolvePlugin = async (name: string): Promise<string | null> => {
  // Reject path-like names early.
  //
  // This is defence in depth, NOT the thing that prevents traversal — the
  // prefix already does that. Every candidate is `<dir>/eser-<name>`, so a
  // `..` in the name lands inside the component `eser-..` and is never its own
  // path segment. The guard exists so that stays true if candidate
  // construction is ever changed, and so `eser ../x` fails as a bad subcommand
  // rather than as a mysterious missing file.
  if (name.includes("/") || name.includes("\\") || name.includes("..")) {
    return null;
  }

  const binary = `${PLUGIN_PREFIX}${name}`;
  const isWindows = getPlatform() === "windows";
  const pathValue = runtime.env.get("PATH") ?? runtime.env.get("Path") ?? "";

  if (pathValue === "") {
    return null;
  }

  // PATHEXT is what makes `eser foo` find `eser-foo.cmd` on Windows; an empty
  // suffix covers every POSIX case and a Windows binary named without one.
  const extensions = isWindows
    ? ["", ...(runtime.env.get("PATHEXT") ?? ".COM;.EXE;.BAT;.CMD").split(";")]
    : [""];

  const separator = isWindows ? "\\" : "/";

  for (const dir of pathValue.split(isWindows ? ";" : ":")) {
    if (dir === "") {
      continue;
    }

    for (const extension of extensions) {
      const candidate = `${dir}${separator}${binary}${
        isWindows ? extension : extension.toLowerCase()
      }`;

      if (await isExecutableFile(candidate)) {
        return candidate;
      }
    }
  }

  return null;
};

/**
 * Reports whether path is a file this process could execute.
 *
 * The mode check matters: a non-executable file with the right name would
 * otherwise be "found" and then fail at spawn with a confusing error, which is
 * the failure mode PATH lookup exists to prevent.
 */
const isExecutableFile = async (path: string): Promise<boolean> => {
  try {
    // runtime.fs.stat, not the Deno global. This module ships inside the npm
    // CLI, which runs under Node -- there `Deno` is undefined, the ReferenceError
    // was swallowed by this very catch, and every lookup silently returned
    // false. The whole `eser <name>` dispatch was dead on the published binary
    // while passing its Deno-only tests.
    const info = await runtime.fs.stat(path);

    if (!info.isFile) {
      return false;
    }

    // Windows has no execute bit; existence plus a PATHEXT match is the test.
    if (getPlatform() === "windows") {
      return true;
    }

    // null means the platform did not report mode. Treating that as "not
    // executable" would make resolution fail closed on any runtime whose stat
    // omits it, so only an explicitly clear execute bit rejects.
    return info.mode === null || (info.mode & 0o111) !== 0;
  } catch {
    return false;
  }
};

/**
 * Runs a resolved plugin, returning its exit code.
 *
 * stdio is inherited, not captured. A plugin may speak a binary protocol on
 * stdin/stdout, where buffering or re-encoding would corrupt the stream, and an
 * interactive one needs to keep its TTY.
 */
export const runPlugin = async (
  executable: string,
  args: readonly string[],
  options?: { readonly cwd?: string },
): Promise<number> => {
  const builder = new shellExec.CommandBuilder(executable, [...args], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    // Undefined means inherit, which is what a plugin should do: `eser foo` runs
    // where the user is standing. The override exists for callers that cannot
    // rely on the process cwd being stable -- notably tests, since chdir is
    // process-global and Deno runs test files concurrently, so an unrelated
    // suite can delete the directory out from under a spawn.
    cwd: options?.cwd,
  });

  const result = await builder.noThrow().spawn();

  return result.code;
};
