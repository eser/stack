// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Shared utilities for the release scripts in etc/scripts: the Nix hash
 * updater, the Homebrew formula updater and the npm consumer preflight.
 *
 * Pure functions with no I/O and no side effects, so each one has a test.
 *
 * @module
 */

/**
 * Parses a SHA256SUMS.txt file into a Map of filename → hex hash.
 *
 * Expected format: `<64-char-hex>  <filename>` (two spaces between hash and filename).
 *
 * @param text - Raw SHA256SUMS.txt content
 * @returns Map of filename to hex SHA256 hash
 */
export const parseSha256Sums = (text: string): Map<string, string> => {
  const result = new Map<string, string>();
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");

  for (const line of lines) {
    // Standard sha256sum format: <hash>  <filename> (two spaces)
    const match = line.match(/^([0-9a-f]{64})\s{1,2}(.+)$/);
    if (match === null) {
      continue;
    }

    const [, hash, filename] = match;
    result.set(filename!, hash!);
  }

  return result;
};

/**
 * Converts a hex-encoded SHA256 hash to Nix SRI format.
 *
 * @param hex - 64-character hex SHA256 hash
 * @returns SRI string like "sha256-base64..."
 * @throws Error if hex is not exactly 64 hex characters
 */
export const hexToSri = (hex: string): string => {
  if (!/^[0-9a-f]{64}$/.test(hex)) {
    throw new Error(
      `Invalid SHA256 hex hash: expected 64 hex characters, got "${
        hex.length > 80 ? hex.slice(0, 80) + "..." : hex
      }"`,
    );
  }

  // Convert hex to bytes
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }

  // Base64-encode and prefix with sha256-
  const base64 = btoa(String.fromCharCode(...bytes));

  return `sha256-${base64}`;
};

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

/**
 * Replaces the credentials in every URL in `text` with "[redacted]", so a
 * command line or tool output that carries an authenticated remote URL can go
 * into an error message or a log.
 *
 * @param text - A command line, error message or tool output
 * @returns `text` with each `scheme://credentials@host` written as
 * `scheme://[redacted]@host`
 */
export const redactUrlCredentials = (text: string): string =>
  text.replace(/:\/\/[^\s/@]+@/g, "://[redacted]@");

/**
 * Computes the SHA256 hex hash of arbitrary data.
 *
 * @param data - Binary data to hash
 * @returns 64-character lowercase hex SHA256 hash
 */
export const computeSha256 = async (data: Uint8Array): Promise<string> => {
  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    data as unknown as BufferSource,
  );
  const hashArray = new Uint8Array(hashBuffer);

  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};
