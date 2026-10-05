// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// The progress lines and the dry-run plan it prints are the release job's log.
// deno-lint-ignore-file no-console

import * as distUtils from "./dist-utils.ts";

// Deliberately no workspace or registry imports: this runs from a fresh
// checkout in the release pipeline, where bare `@eserstack/*` specifiers do not
// resolve (they need the gitignored generated manifests). A broken workspace
// package must not be able to block shipping the hashes for a release that
// already exists.

const TARGETS = [
  "x86_64-unknown-linux-gnu",
  "aarch64-unknown-linux-gnu",
  "x86_64-apple-darwin",
  "aarch64-apple-darwin",
] as const;

/**
 * How long one release archive may take to download, headers and body. A
 * healthy download takes seconds; a stalled one fails here instead of holding
 * the release job until its time limit.
 */
const ARCHIVE_DOWNLOAD_TIMEOUT_MS = 60_000;

const readVersion = async (repoRoot: string): Promise<string> => {
  const raw = await Deno.readTextFile(`${repoRoot}/VERSION`);

  return raw.trim();
};

const downloadArchive = async (url: string): Promise<Uint8Array> => {
  // The signal also bounds the body read, so a transfer that stops midway
  // times out too.
  const signal = AbortSignal.timeout(ARCHIVE_DOWNLOAD_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal });

    if (!response.ok) {
      throw new Error(
        `download ${url}: HTTP ${response.status} ${response.statusText}`,
      );
    }

    return new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    if (signal.aborted) {
      throw new Error(
        `download ${url}: no complete response within ${ARCHIVE_DOWNLOAD_TIMEOUT_MS} ms; check that GitHub is reachable and rerun the job`,
        { cause: error },
      );
    }

    throw error;
  }
};

const computeHashes = async (
  version: string,
): Promise<Record<string, string>> => {
  const hashes: Record<string, string> = {};

  for (const target of TARGETS) {
    const url =
      `https://github.com/eser/stack/releases/download/v${version}/eser-v${version}-${target}.tar.gz`;

    console.log(`Downloading ${url} ...`);

    // One archive at a time: each is held in memory whole while it is hashed,
    // so sequential downloads keep peak memory at a single archive.
    // deno-lint-ignore no-await-in-loop
    const data = await downloadArchive(url);
    // Hashed before the next download starts, for the same memory bound.
    // deno-lint-ignore no-await-in-loop
    const hexHash = await distUtils.computeSha256(data);
    const sriHash = distUtils.hexToSri(hexHash);

    hashes[target] = sriHash;

    console.log(`  ${target}: ${sriHash}`);
  }

  return hashes;
};

const main = async (): Promise<void> => {
  const repoRoot = distUtils.repoRootFrom(import.meta.dirname);
  const outputPath = `${repoRoot}/nix/hashes.json`;

  const version = await readVersion(repoRoot);
  console.log(`Version: ${version}`);

  // --dry-run: the release preflight runs this before the tag exists, so there
  // is nothing to download yet. Exercise everything up to the network call and
  // write nothing.
  if (Deno.args.includes("--dry-run")) {
    for (const target of TARGETS) {
      console.log(
        `[dry-run] would download https://github.com/eser/stack/releases/download/v${version}/eser-v${version}-${target}.tar.gz`,
      );
    }
    console.log(`[dry-run] would write ${outputPath}`);
    return;
  }

  const hashes = await computeHashes(version);

  const json = JSON.stringify(hashes, null, 2) + "\n";
  await Deno.writeTextFile(outputPath, json);

  console.log(`\nWrote ${outputPath}`);
};

if (import.meta.main) {
  // Script entry point: the release job runs the file directly.
  // deno-lint-ignore no-top-level-await
  await main();
}
