// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Homebrew formula updater — downloads SHA256SUMS.txt from a GitHub Release,
 * generates the Ruby formula, and pushes it to the homebrew-tap repo.
 *
 * Requires the GH_TOKEN environment variable to authenticate with GitHub.
 *
 * Usage:
 *   deno run --allow-all etc/scripts/update-homebrew-formula.ts
 *
 * @module
 */

import * as distUtils from "./dist-utils.ts";
import { runtime } from "@eser/standards/cross-runtime";

// =============================================================================
// Types
// =============================================================================

type TargetHashes = {
  readonly x86_64_linux: string;
  readonly aarch64_linux: string;
  readonly x86_64_darwin: string;
  readonly aarch64_darwin: string;
};

// =============================================================================
// Formula template
// =============================================================================

const generateFormula = (version: string, hashes: TargetHashes): string =>
  `class Eser < Formula
  desc "Terminal client for Eser's work"
  homepage "https://github.com/eser/stack"
  version "${version}"
  license "Apache-2.0"

  on_macos do
    on_arm do
      url "https://github.com/eser/stack/releases/download/v${version}/eser-v${version}-aarch64-apple-darwin.tar.gz"
      sha256 "${hashes.aarch64_darwin}"
    end
    on_intel do
      url "https://github.com/eser/stack/releases/download/v${version}/eser-v${version}-x86_64-apple-darwin.tar.gz"
      sha256 "${hashes.x86_64_darwin}"
    end
  end

  on_linux do
    on_arm do
      url "https://github.com/eser/stack/releases/download/v${version}/eser-v${version}-aarch64-unknown-linux-gnu.tar.gz"
      sha256 "${hashes.aarch64_linux}"
    end
    on_intel do
      url "https://github.com/eser/stack/releases/download/v${version}/eser-v${version}-x86_64-unknown-linux-gnu.tar.gz"
      sha256 "${hashes.x86_64_linux}"
    end
  end

  def install
    bin.install "eser"
  end

  test do
    assert_match version.to_s, shell_output("\#{bin}/eser version --bare")
  end
end
`;

// =============================================================================
// Shell helper
// =============================================================================

const run = async (
  cmd: string[],
  options?: { cwd?: string },
): Promise<string> => {
  const result = await runtime.exec.spawn(
    cmd[0]!,
    cmd.slice(1),
    {
      cwd: options?.cwd,
      stdout: "piped",
      stderr: "piped",
    },
  );

  if (!result.success) {
    const errorText = new TextDecoder().decode(result.stderr);
    throw new Error(
      `Command failed (exit ${result.code}): ${cmd.join(" ")}\n${errorText}`,
    );
  }

  return new TextDecoder().decode(result.stdout).trim();
};

// =============================================================================
// Lookup helper
// =============================================================================

const lookupHash = (
  hashes: Map<string, string>,
  version: string,
  target: string,
): string => {
  const filename = `eser-v${version}-${target}.tar.gz`;
  const hash = hashes.get(filename);

  if (hash === undefined) {
    throw new Error(
      `Missing hash for ${filename} in SHA256SUMS.txt. Available entries: ${
        [...hashes.keys()].join(", ")
      }`,
    );
  }

  return hash;
};

// =============================================================================
// Main
// =============================================================================

const main = async (): Promise<void> => {
  // 1. Validate environment
  const ghToken = runtime.env.get("GH_TOKEN");

  if (ghToken === undefined || ghToken === "") {
    throw new Error(
      "GH_TOKEN environment variable is required for pushing to the homebrew-tap repo.",
    );
  }

  // 2. Read VERSION from repo root
  const repoRoot = new URL("../../", import.meta.url);
  const versionFilePath = new URL("VERSION", repoRoot).toString();
  const version = (await runtime.fs.readTextFile(versionFilePath)).trim();

  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`Invalid version in VERSION file: "${version}"`);
  }

  // deno-lint-ignore no-console
  console.log(`Version: ${version}`);

  // 3. Download SHA256SUMS.txt from GitHub Release
  const sha256sumsUrl =
    `https://github.com/eser/stack/releases/download/v${version}/SHA256SUMS.txt`;

  // deno-lint-ignore no-console
  console.log(`Downloading ${sha256sumsUrl}...`);

  const response = await fetch(sha256sumsUrl);

  if (!response.ok) {
    throw new Error(
      `Failed to download SHA256SUMS.txt: ${response.status} ${response.statusText}`,
    );
  }

  const sha256sumsText = await response.text();

  // 4. Parse hashes
  const hashes = distUtils.parseSha256Sums(sha256sumsText);

  if (hashes.size === 0) {
    throw new Error("SHA256SUMS.txt is empty or has no valid entries.");
  }

  // deno-lint-ignore no-console
  console.log(`Parsed ${hashes.size} hash entries.`);

  const targetHashes: TargetHashes = {
    x86_64_linux: lookupHash(hashes, version, "x86_64-unknown-linux-gnu"),
    aarch64_linux: lookupHash(hashes, version, "aarch64-unknown-linux-gnu"),
    x86_64_darwin: lookupHash(hashes, version, "x86_64-apple-darwin"),
    aarch64_darwin: lookupHash(hashes, version, "aarch64-apple-darwin"),
  };

  // 5. Generate formula
  const formula = generateFormula(version, targetHashes);

  // deno-lint-ignore no-console
  console.log("Generated Homebrew formula.");

  // 6. Clone homebrew-tap repo
  const tmpDir = await runtime.fs.makeTempDir();
  const repoUrl =
    `https://x-access-token:${ghToken}@github.com/eser/homebrew-tap.git`;

  // deno-lint-ignore no-console
  console.log("Cloning eser/homebrew-tap...");

  await run(["git", "clone", "--depth", "1", repoUrl, tmpDir]);
  await run(
    ["git", "config", "user.name", "github-actions[bot]"],
    { cwd: tmpDir },
  );
  await run(
    [
      "git",
      "config",
      "user.email",
      "github-actions[bot]@users.noreply.github.com",
    ],
    { cwd: tmpDir },
  );

  // 7. Write formula
  const formulaDir = `${tmpDir}/Formula`;

  try {
    await runtime.fs.mkdir(formulaDir, { recursive: true });
  } catch {
    // Directory may already exist — that's fine
  }

  const formulaPath = `${formulaDir}/eser.rb`;
  await runtime.fs.writeTextFile(formulaPath, formula);

  // deno-lint-ignore no-console
  console.log(`Wrote formula to ${formulaPath}`);

  // 8. Commit and push
  await run(["git", "add", "Formula/eser.rb"], { cwd: tmpDir });

  // Check if there are changes to commit
  const diff = await run(
    ["git", "diff", "--cached", "--name-only"],
    { cwd: tmpDir },
  );

  if (diff === "") {
    // deno-lint-ignore no-console
    console.log("No changes to commit — formula is already up to date.");
  } else {
    await run(
      [
        "git",
        "commit",
        "-m",
        `chore: update eser formula to v${version}`,
      ],
      { cwd: tmpDir },
    );

    // deno-lint-ignore no-console
    console.log("Pushing to eser/homebrew-tap...");

    await run(["git", "push", "origin", "HEAD"], { cwd: tmpDir });

    // deno-lint-ignore no-console
    console.log("Done — Homebrew formula updated.");
  }

  // 9. Cleanup
  await runtime.fs.remove(tmpDir, { recursive: true });
};

if (import.meta.main) {
  await main();
}
