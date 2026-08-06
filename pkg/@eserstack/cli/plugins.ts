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
import * as shellEnv from "@eserstack/shell/env";

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
  // Defence in depth, NOT the thing that prevents traversal — the prefix already
  // does that. Every candidate is `<dir>/eser-<name>`, so a `..` in the name
  // lands inside the component `eser-..` and is never its own path segment. The
  // guard keeps that true if candidate construction ever changes, and makes
  // `eser ../x` fail as a bad subcommand rather than a mysterious missing file.
  if (name.includes("/") || name.includes("\\") || name.includes("..")) {
    return null;
  }

  // The PATH walk itself lives in @eserstack/shell/env, shared with every other
  // caller that needs to know whether a binary exists. This module only owns
  // the naming convention.
  return await shellEnv.resolveExecutable(`${PLUGIN_PREFIX}${name}`);
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
