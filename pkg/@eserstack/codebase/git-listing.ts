// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The git listing behind every git-aware walk of this package.
 *
 * The native library runs `git ls-files` itself. The WASM build cannot start a
 * process, and its git-aware walk fails without a listing (TASK-366), so on
 * that backend the listing is made here, on the host, and sent with the
 * request as `gitFiles`.
 *
 * @module
 */

import * as shellExec from "@eserstack/shell/exec";
import type * as ffiTypes from "@eserstack/ajan/ffi";

// `git ls-files` returns in well under a second; the bound keeps a hung git (a
// held index lock) from stalling a validator.
const GIT_LS_FILES_TIMEOUT_MS = 30_000;

const decoder = new TextDecoder();

/**
 * List the files git tracks or would track under `root`, relative to it:
 * `git ls-files --cached --others --exclude-standard`, so .gitignore holds.
 *
 * @returns The paths, or `null` when `root` is not inside a git repository
 * @throws {Error} When git cannot run or fails for another reason; walking the
 *   filesystem instead would list the gitignored files too
 */
export const listGitFiles = async (root: string): Promise<string[] | null> => {
  let result: shellExec.CommandResult;
  try {
    result =
      await shellExec.exec`git ls-files -z --cached --others --exclude-standard`
        .cwd(root)
        .timeout(GIT_LS_FILES_TIMEOUT_MS)
        .noThrow()
        .spawn();
  } catch (error) {
    throw new Error(
      `list the files of ${root} with git: git cannot run, so .gitignore ` +
        `cannot be honoured; install git or put it on PATH`,
      { cause: error },
    );
  }

  if (!result.success) {
    const stderr = decoder.decode(result.stderr).trim();
    if (stderr.includes("not a git repository")) {
      return null;
    }

    throw new Error(
      `list the files of ${root} with git: git ls-files exited with ` +
        `${result.code}: ${stderr}`,
    );
  }

  return decoder
    .decode(result.stdout)
    .split("\0")
    .filter((path) => path !== "");
};

/** The git fields of a codebase walk or validate request. */
export type BridgeGitOptions = {
  readonly gitAware: boolean;
  readonly gitFiles?: readonly string[];
};

/**
 * The git fields for a bridge request that walks `root`.
 *
 * On the native library this is `{ gitAware }`: Go runs git. On the WASM build
 * the listing comes from {@link listGitFiles}; outside a git repository the
 * walk goes without git, as the native walk does there.
 *
 * @param lib - The loaded bridge
 * @param root - The directory the request walks (default ".")
 * @param gitAware - Whether the request asks for a git-aware walk
 */
export const bridgeGitOptions = async (
  lib: ffiTypes.FFILibrary,
  root: string | undefined,
  gitAware = true,
): Promise<BridgeGitOptions> => {
  if (!gitAware || lib.backend === "native") {
    return { gitAware };
  }

  const gitFiles = await listGitFiles(root ?? ".");

  return gitFiles === null ? { gitAware: false } : { gitAware, gitFiles };
};
