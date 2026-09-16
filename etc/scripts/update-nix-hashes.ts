// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as path from "jsr:@std/path@^1.1.4";
import * as distUtils from "./dist-utils.ts";

// Deliberately no workspace imports: this runs from a fresh checkout in the
// release pipeline, where bare `@eserstack/*` specifiers do not resolve (they
// need the gitignored generated manifests). A broken workspace package must
// not be able to block shipping the hashes for a release that already exists.

const TARGETS = [
  "x86_64-unknown-linux-gnu",
  "aarch64-unknown-linux-gnu",
  "x86_64-apple-darwin",
  "aarch64-apple-darwin",
] as const;

const readVersion = async (repoRoot: string): Promise<string> => {
  const versionPath = path.join(repoRoot, "VERSION");
  const raw = await Deno.readTextFile(versionPath);

  return raw.trim();
};

const downloadArchive = async (url: string): Promise<Uint8Array> => {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Failed to download ${url}: ${response.status} ${response.statusText}`,
    );
  }

  return new Uint8Array(await response.arrayBuffer());
};

const computeHashes = async (
  version: string,
): Promise<Record<string, string>> => {
  const hashes: Record<string, string> = {};

  for (const target of TARGETS) {
    const url =
      `https://github.com/eser/stack/releases/download/v${version}/eser-v${version}-${target}.tar.gz`;

    // deno-lint-ignore no-console
    console.log(`Downloading ${url} ...`);

    const data = await downloadArchive(url);
    const hexHash = await distUtils.computeSha256(data);
    const sriHash = distUtils.hexToSri(hexHash);

    hashes[target] = sriHash;

    // deno-lint-ignore no-console
    console.log(`  ${target}: ${sriHash}`);
  }

  return hashes;
};

const main = async (): Promise<void> => {
  const scriptDir = path.dirname(path.fromFileUrl(import.meta.url));
  const repoRoot = path.resolve(scriptDir, "..", "..");

  const version = await readVersion(repoRoot);
  // deno-lint-ignore no-console
  console.log(`Version: ${version}`);

  // --dry-run: the release preflight runs this before the tag exists, so there
  // is nothing to download yet. Exercise everything up to the network call and
  // write nothing.
  if (Deno.args.includes("--dry-run")) {
    for (const target of TARGETS) {
      // deno-lint-ignore no-console
      console.log(
        `[dry-run] would download https://github.com/eser/stack/releases/download/v${version}/eser-v${version}-${target}.tar.gz`,
      );
    }
    // deno-lint-ignore no-console
    console.log(
      `[dry-run] would write ${path.join(repoRoot, "nix", "hashes.json")}`,
    );
    return;
  }

  const hashes = await computeHashes(version);

  const outputPath = path.join(repoRoot, "nix", "hashes.json");
  const json = JSON.stringify(hashes, null, 2) + "\n";
  await Deno.writeTextFile(outputPath, json);

  // deno-lint-ignore no-console
  console.log(`\nWrote ${outputPath}`);
};

if (import.meta.main) {
  await main();
}
