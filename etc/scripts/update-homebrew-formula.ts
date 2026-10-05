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

// The progress lines it prints are the release job's log.
// deno-lint-ignore-file no-console

import * as distUtils from "./dist-utils.ts";

// Deliberately no workspace imports: this runs from a fresh checkout in the
// release pipeline, where bare `@eserstack/*` specifiers do not resolve (they
// need the gitignored generated manifests). A broken workspace package must
// not be able to block updating the tap for a release that already exists.

// =============================================================================
// Timeouts
// =============================================================================

// Each bound fails one stalled call with a message that names it, well inside
// the release job's five-minute limit, which stays the backstop.

/** SHA256SUMS.txt is a few hundred bytes. */
const SHA256SUMS_DOWNLOAD_TIMEOUT_MS = 30_000;

/** git clone --depth 1 and git push of the small tap repository. */
const GIT_REMOTE_TIMEOUT_MS = 60_000;

/** git config, add, diff and commit, which only touch the local clone. */
const GIT_LOCAL_TIMEOUT_MS = 15_000;

// =============================================================================
// Types
// =============================================================================

/** The Rust target triples in the release archive names. */
const TARGET_TRIPLES = [
  "x86_64-unknown-linux-gnu",
  "aarch64-unknown-linux-gnu",
  "x86_64-apple-darwin",
  "aarch64-apple-darwin",
] as const;

type TargetTriple = typeof TARGET_TRIPLES[number];

/** The SHA-256 of one binary's archive for each target triple. */
type TargetHashes = Readonly<Record<TargetTriple, string>>;

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
      sha256 "${hashes["aarch64-apple-darwin"]}"
    end
    on_intel do
      url "https://github.com/eser/stack/releases/download/v${version}/${spec.binary}-v${version}-x86_64-apple-darwin.tar.gz"
      sha256 "${hashes["x86_64-apple-darwin"]}"
    end
  end

  on_linux do
    on_arm do
      url "https://github.com/eser/stack/releases/download/v${version}/${spec.binary}-v${version}-aarch64-unknown-linux-gnu.tar.gz"
      sha256 "${hashes["aarch64-unknown-linux-gnu"]}"
    end
    on_intel do
      url "https://github.com/eser/stack/releases/download/v${version}/${spec.binary}-v${version}-x86_64-unknown-linux-gnu.tar.gz"
      sha256 "${hashes["x86_64-unknown-linux-gnu"]}"
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

/**
 * Runs `cmd` and returns its trimmed stdout. The process is stopped after
 * `options.timeoutMs`. Errors carry the command line and stderr with URL
 * credentials redacted, because the clone URL holds GH_TOKEN.
 */
const run = async (
  cmd: readonly string[],
  options: { cwd?: string; timeoutMs: number },
): Promise<string> => {
  const signal = AbortSignal.timeout(options.timeoutMs);
  const result = await new Deno.Command(cmd[0]!, {
    args: cmd.slice(1),
    cwd: options.cwd,
    stdout: "piped",
    stderr: "piped",
    signal,
  }).output();

  if (result.success) {
    return new TextDecoder().decode(result.stdout).trim();
  }

  const commandLine = distUtils.redactUrlCredentials(cmd.join(" "));

  // A failed run with an aborted signal is one the timeout stopped.
  if (signal.aborted) {
    throw new Error(
      `${commandLine}: did not finish within ${options.timeoutMs} ms and was stopped; rerun the job, and check that github.com is reachable if it happens again`,
    );
  }

  const errorText = distUtils.redactUrlCredentials(
    new TextDecoder().decode(result.stderr),
  );

  throw new Error(
    `${commandLine}: exited with code ${result.code}\n${errorText}`,
  );
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

/** Looks up the archive hash of `binary` for every target triple. */
const lookupTargetHashes = (
  hashes: Map<string, string>,
  version: string,
  binary: string,
): TargetHashes =>
  Object.fromEntries(
    TARGET_TRIPLES.map((target) => [
      target,
      lookupHash(hashes, version, target, binary),
    ]),
  ) as TargetHashes;

const downloadSha256Sums = async (url: string): Promise<string> => {
  console.log(`Downloading ${url}...`);

  // The signal also bounds the body read, so a transfer that stops midway
  // times out too.
  const signal = AbortSignal.timeout(SHA256SUMS_DOWNLOAD_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal });

    if (!response.ok) {
      throw new Error(
        `download ${url}: HTTP ${response.status} ${response.statusText}`,
      );
    }

    return await response.text();
  } catch (error) {
    if (signal.aborted) {
      throw new Error(
        `download ${url}: no complete response within ${SHA256SUMS_DOWNLOAD_TIMEOUT_MS} ms; check that GitHub is reachable and rerun the job`,
        { cause: error },
      );
    }

    throw error;
  }
};

/** A SHA256SUMS.txt with a distinct placeholder hash per archive (dry-run). */
const placeholderSha256Sums = (version: string): string =>
  FORMULAS.flatMap((spec, i) =>
    TARGET_TRIPLES.map((target, j) =>
      `${
        (i * 10 + j).toString(16).padStart(64, "0")
      }  ${spec.binary}-v${version}-${target}.tar.gz`
    )
  ).join("\n") + "\n";

// =============================================================================
// Main
// =============================================================================

const main = async (): Promise<void> => {
  // --dry-run: the release preflight runs this before the release exists, so
  // there is no SHA256SUMS.txt to download and nothing to push. Exercise the
  // parsing and formula rendering on placeholder hashes, write the formulas to
  // a temp dir, and stop before touching the tap.
  const dryRun = Deno.args.includes("--dry-run");

  // 1. Validate environment
  const ghToken = Deno.env.get("GH_TOKEN");

  if (!dryRun && (ghToken === undefined || ghToken === "")) {
    throw new Error(
      "GH_TOKEN environment variable is required for pushing to the homebrew-tap repo.",
    );
  }

  // 2. Read VERSION from repo root
  const repoRoot = distUtils.repoRootFrom(import.meta.dirname);
  const version = (await Deno.readTextFile(`${repoRoot}/VERSION`)).trim();

  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`Invalid version in VERSION file: "${version}"`);
  }

  console.log(`Version: ${version}`);

  // 3. Download SHA256SUMS.txt from GitHub Release
  const sha256sumsUrl =
    `https://github.com/eser/stack/releases/download/v${version}/SHA256SUMS.txt`;

  const sha256sumsText = dryRun
    ? placeholderSha256Sums(version)
    : await downloadSha256Sums(sha256sumsUrl);

  // 4. Parse hashes
  const hashes = distUtils.parseSha256Sums(sha256sumsText);

  if (hashes.size === 0) {
    throw new Error("SHA256SUMS.txt is empty or has no valid entries.");
  }

  console.log(`Parsed ${hashes.size} hash entries.`);

  const formulas = FORMULAS.map((spec) => ({
    spec,
    body: generateFormula(
      spec,
      version,
      lookupTargetHashes(hashes, version, spec.binary),
    ),
  }));

  console.log(`Generated ${formulas.length} Homebrew formulas.`);

  if (dryRun) {
    const previewDir = await Deno.makeTempDir({ prefix: "eser-brew-dry-run-" });
    try {
      await Promise.all(
        formulas.map(({ spec, body }) =>
          Deno.writeTextFile(`${previewDir}/${spec.binary}.rb`, body)
        ),
      );
      console.log(
        `[dry-run] rendered ${formulas.length} formulas into ${previewDir}; skipping clone and push.`,
      );
    } finally {
      await Deno.remove(previewDir, { recursive: true });
    }
    return;
  }

  // 6. Clone homebrew-tap repo. The clone's remote URL holds the token, so
  // the directory is removed even when a later step fails.
  const tmpDir = await Deno.makeTempDir();
  const repoUrl =
    `https://x-access-token:${ghToken}@github.com/eser/homebrew-tap.git`;

  try {
    console.log("Cloning eser/homebrew-tap...");

    await run(["git", "clone", "--depth", "1", repoUrl, tmpDir], {
      timeoutMs: GIT_REMOTE_TIMEOUT_MS,
    });
    await run(
      ["git", "config", "user.name", "github-actions[bot]"],
      { cwd: tmpDir, timeoutMs: GIT_LOCAL_TIMEOUT_MS },
    );
    await run(
      [
        "git",
        "config",
        "user.email",
        "github-actions[bot]@users.noreply.github.com",
      ],
      { cwd: tmpDir, timeoutMs: GIT_LOCAL_TIMEOUT_MS },
    );

    // 7. Write formula
    const formulaDir = `${tmpDir}/Formula`;

    // recursive: an existing Formula directory in the tap is not an error.
    await Deno.mkdir(formulaDir, { recursive: true });

    await Promise.all(
      formulas.map(async ({ spec, body }) => {
        const formulaPath = `${formulaDir}/${spec.binary}.rb`;
        await Deno.writeTextFile(formulaPath, body);
        console.log(`Wrote formula to ${formulaPath}`);
      }),
    );

    // 8. Commit and push
    await run(["git", "add", "Formula"], {
      cwd: tmpDir,
      timeoutMs: GIT_LOCAL_TIMEOUT_MS,
    });

    // Check if there are changes to commit
    const diff = await run(
      ["git", "diff", "--cached", "--name-only"],
      { cwd: tmpDir, timeoutMs: GIT_LOCAL_TIMEOUT_MS },
    );

    if (diff === "") {
      console.log("No changes to commit; the formula is already up to date.");
    } else {
      await run(
        [
          "git",
          "commit",
          "-m",
          `chore: update eser formula to v${version}`,
        ],
        { cwd: tmpDir, timeoutMs: GIT_LOCAL_TIMEOUT_MS },
      );

      console.log("Pushing to eser/homebrew-tap...");

      await run(["git", "push", "origin", "HEAD"], {
        cwd: tmpDir,
        timeoutMs: GIT_REMOTE_TIMEOUT_MS,
      });

      console.log("Done: Homebrew formula updated.");
    }
  } finally {
    // 9. Cleanup
    await Deno.remove(tmpDir, { recursive: true });
  }
};

if (import.meta.main) {
  // Script entry point: the release job runs the file directly.
  // deno-lint-ignore no-top-level-await
  await main();
}
