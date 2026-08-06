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
import { runtime } from "@eserstack/standards/cross-runtime";

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

/**
 * The binaries that get a tap formula.
 *
 * `noskills` and `laroux` are submodules of the `eser` CLI shipped as their own
 * entry points, so that `brew install noskills` works for someone who wants only
 * that tool. They are not separate implementations -- see BINARIES in
 * pkg/@eserstack/cli/scripts/compile.ts -- so this list must stay in step with
 * that one. Keep the class names capitalised as Homebrew expects.
 */
const FORMULAS: readonly {
  binary: string;
  className: string;
  description: string;
}[] = [
  {
    binary: "eser",
    className: "Eser",
    description: "Terminal client for Eser's work",
  },
  {
    binary: "noskills",
    className: "Noskills",
    description: "State-machine orchestrator for AI agents",
  },
  {
    binary: "laroux",
    className: "Laroux",
    description: "laroux.js framework CLI",
  },
  // A Go daemon rather than a deno-compiled CLI, but released from the same
  // pipeline at the same version, so its formula belongs here too. GoReleaser
  // used to generate this one separately, which is how the family drifted into
  // two release workflows and two asset sets.
  {
    binary: "noskills-server",
    className: "NoskillsServer",
    description:
      "noskills-server — persistent Claude Code sessions that survive reboots",
  },
];

const generateFormula = (
  spec: { binary: string; className: string; description: string },
  version: string,
  hashes: TargetHashes,
): string =>
  `class ${spec.className} < Formula
  desc "${spec.description}"
  homepage "https://github.com/eser/stack"
  version "${version}"
  license "Apache-2.0"

  on_macos do
    on_arm do
      url "https://github.com/eser/stack/releases/download/v${version}/${spec.binary}-v${version}-aarch64-apple-darwin.tar.gz"
      sha256 "${hashes.aarch64_darwin}"
    end
    on_intel do
      url "https://github.com/eser/stack/releases/download/v${version}/${spec.binary}-v${version}-x86_64-apple-darwin.tar.gz"
      sha256 "${hashes.x86_64_darwin}"
    end
  end

  on_linux do
    on_arm do
      url "https://github.com/eser/stack/releases/download/v${version}/${spec.binary}-v${version}-aarch64-unknown-linux-gnu.tar.gz"
      sha256 "${hashes.aarch64_linux}"
    end
    on_intel do
      url "https://github.com/eser/stack/releases/download/v${version}/${spec.binary}-v${version}-x86_64-unknown-linux-gnu.tar.gz"
      sha256 "${hashes.x86_64_linux}"
    end
  end

  def install
    bin.install "${spec.binary}"

    # Install the Go shared library if present in the archive (added in newer releases).
    # On macOS the library is a .dylib; on Linux it is a .so.
    if File.exist?("libeser_ajan.dylib")
      lib.install "libeser_ajan.dylib"
    elsif File.exist?("libeser_ajan.so")
      lib.install "libeser_ajan.so"
    end

    # Install the C header for FFI consumers if present.
    if File.exist?("libeser_ajan.h")
      include.install "libeser_ajan.h"
    end
  end

  test do
    assert_match version.to_s, shell_output("\#{bin}/${spec.binary} --version")

    # Verify the Go bridge is functional when the shared library is installed.
    if (lib/"libeser_ajan.dylib").exist? || (lib/"libeser_ajan.so").exist?
      assert_match(/\\d+\\.\\d+/, shell_output("\#{bin}/${spec.binary} --version"))
    end
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
  binary: string,
): string => {
  const filename = `${binary}-v${version}-${target}.tar.gz`;
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
  const versionFilePath = new URL("VERSION", repoRoot).pathname;
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

  const formulas = FORMULAS.map((spec) => ({
    spec,
    body: generateFormula(spec, version, {
      x86_64_linux: lookupHash(
        hashes,
        version,
        "x86_64-unknown-linux-gnu",
        spec.binary,
      ),
      aarch64_linux: lookupHash(
        hashes,
        version,
        "aarch64-unknown-linux-gnu",
        spec.binary,
      ),
      x86_64_darwin: lookupHash(
        hashes,
        version,
        "x86_64-apple-darwin",
        spec.binary,
      ),
      aarch64_darwin: lookupHash(
        hashes,
        version,
        "aarch64-apple-darwin",
        spec.binary,
      ),
    }),
  }));

  // deno-lint-ignore no-console
  console.log(`Generated ${formulas.length} Homebrew formulas.`);

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

  for (const { spec, body } of formulas) {
    const formulaPath = `${formulaDir}/${spec.binary}.rb`;
    await runtime.fs.writeTextFile(formulaPath, body);

    // deno-lint-ignore no-console
    console.log(`Wrote formula to ${formulaPath}`);
  }

  // 8. Commit and push
  await run(["git", "add", "Formula"], { cwd: tmpDir });

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
