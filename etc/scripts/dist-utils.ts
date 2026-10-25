// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Shared utilities for the release scripts in etc/scripts (the npm consumer
 * preflight). The SHA256SUMS.txt, SRI and credential helpers of the Homebrew
 * and Nix updaters moved to Go with them (pkg/ajan/codebasefx,
 * `eser dev homebrew` and `eser dev nix-hashes`).
 *
 * Pure functions with no I/O and no side effects, so each one has a test.
 *
 * @module
 */

/**
 * Resolves the repository root from the directory of a script in
 * `etc/scripts/`, two levels below it. The release scripts use this instead of
 * a path library because they run from a fresh checkout with nothing resolved
 * from a registry. Deno and Node accept "/" separators on Windows too.
 *
 * @param scriptDir - The calling script's `import.meta.dirname`
 * @returns The repository root, with "/" separators
 * @throws Error if `scriptDir` is undefined, which happens when the script is
 * not loaded from a local file
 */
export const repoRootFrom = (scriptDir: string | undefined): string => {
  if (scriptDir === undefined) {
    throw new Error(
      "Cannot locate the repository root: import.meta.dirname is undefined. Run the script from a local checkout, not from a URL.",
    );
  }

  // Drop the trailing "etc/scripts"; Windows paths may use either separator.
  return scriptDir.split(/[\\/]/).slice(0, -2).join("/");
};
