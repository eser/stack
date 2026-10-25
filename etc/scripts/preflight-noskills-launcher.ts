// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Release preflight: install the noskills npm launcher the way a user would
 * (TASK-261).
 *
 * Packs `pkg/@eserstack/noskills/dist` (the launcher, from npm-build.ts) and
 * this host's platform package (`pkg/@eserstack/noskills-<platform>`, with
 * the binary `eser dev npm-binaries` staged), installs both with npm into a
 * scratch project OUTSIDE the repository, and checks that `npx noskills` runs
 * the Go binary, and that the binary reaches the TypeScript CLI the launcher
 * carries for the commands it forwards. Outside the repo, Node cannot find
 * the platform package through the workspace links, so a launcher that
 * resolves it wrongly fails here.
 *
 * npm fetches the other optional dependencies (the ajan libraries and the
 * other platforms' packages) from the registry; for a version that is not
 * published yet they are missing, which npm skips and the checks here do not
 * need.
 *
 * Deliberately no workspace or registry imports, only Node built-ins and the
 * scripts next to it: it checks the packages as npm installs them, so it must
 * not lean on the workspace it checks.
 *
 * Usage:
 *   go run ./cmd/eser dev compile --current-only
 *   go run ./cmd/eser dev npm-binaries
 *   node pkg/@eserstack/noskills/scripts/npm-build.ts
 *   node etc/scripts/preflight-noskills-launcher.ts
 *
 * @module
 */

// The progress and result lines it prints are the preflight's log.
/* oxlint-disable no-console */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as process from "node:process";
import * as distUtils from "./dist-utils.ts";
import * as npmConsumer from "./preflight-npm-consumer.ts";

/** npm pack of one package directory. */
const NPM_PACK_TIMEOUT_MS = 60_000;

/** npm install of the two tarballs and the registry's optional packages. */
const NPM_INSTALL_TIMEOUT_MS = 180_000;

/** One noskills command through npx. */
const NOSKILLS_COMMAND_TIMEOUT_MS = 30_000;

const must = (result: npmConsumer.RunResult, what: string): void => {
  if (result.code !== 0) {
    throw new Error(
      `${what} failed (exit ${result.code})\n${result.stdout}${result.stderr}`,
    );
  }
};

/** The `<process.platform>-<process.arch>` suffix of this host's package. */
const hostPlatform = (): string => `${process.platform}-${process.arch}`;

const isNotFound = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

const packOne = async (dir: string, packDir: string): Promise<string> => {
  const before = new Set(await fs.readdir(packDir));

  must(
    await npmConsumer.run(
      ["npm", "pack", "--pack-destination", packDir],
      dir,
      NPM_PACK_TIMEOUT_MS,
    ),
    `npm pack in ${dir}`,
  );

  const added = (await fs.readdir(packDir)).filter(
    (name) => name.endsWith(".tgz") && !before.has(name),
  );

  if (added.length !== 1) {
    throw new Error(`npm pack in ${dir} wrote ${added.length} tarballs`);
  }

  return `${packDir}/${added[0]!}`;
};

const main = async (): Promise<void> => {
  const repoRoot = distUtils.repoRootFrom(import.meta.dirname);
  const distDir = `${repoRoot}/pkg/@eserstack/noskills/dist`;
  const platformDir = `${repoRoot}/pkg/@eserstack/noskills-${hostPlatform()}`;
  const binary = `${platformDir}/noskills${
    process.platform === "win32" ? ".exe" : ""
  }`;

  let packed: { version: string };
  try {
    packed = JSON.parse(await fs.readFile(`${distDir}/package.json`, "utf8"));
  } catch (error) {
    if (isNotFound(error)) {
      throw new Error(
        `${distDir} has no package.json; run pkg/@eserstack/noskills/scripts/npm-build.ts first.`,
        { cause: error },
      );
    }
    throw error;
  }

  try {
    await fs.stat(binary);
  } catch (error) {
    if (isNotFound(error)) {
      throw new Error(
        `${binary} is missing; run \`go run ./cmd/eser dev compile --current-only\` and \`go run ./cmd/eser dev npm-binaries\` first.`,
        { cause: error },
      );
    }
    throw error;
  }

  // Both directories live under the OS temp dir, never under the repo.
  const packDir = await fs.mkdtemp(`${os.tmpdir()}/noskills-preflight-pack-`);
  const consumerDir = await fs.mkdtemp(
    `${os.tmpdir()}/noskills-preflight-consumer-`,
  );

  try {
    const tarballs = [
      await packOne(distDir, packDir),
      await packOne(platformDir, packDir),
    ];

    await fs.writeFile(
      `${consumerDir}/package.json`,
      '{"name":"noskills-preflight-consumer","private":true,"version":"1.0.0"}\n',
    );

    console.log(`Installing ${tarballs.join(" and ")} into ${consumerDir} ...`);
    must(
      await npmConsumer.run(
        ["npm", "install", "--no-audit", "--no-fund", ...tarballs],
        consumerDir,
        NPM_INSTALL_TIMEOUT_MS,
      ),
      "npm install of the packed launcher",
    );

    // `npx noskills`, as a user and the v4.5.x hooks run it. The installed
    // bin is found locally, so npx does not reach the registry. (`npx --no
    // noskills --version` would be npx's own --version.)
    const noskills = (...args: string[]) =>
      npmConsumer.run(
        ["npx", "noskills", ...args],
        consumerDir,
        NOSKILLS_COMMAND_TIMEOUT_MS,
      );

    const version = await noskills("--version");
    must(version, "npx noskills --version");
    if (version.stdout.trim() !== `noskills ${packed.version}`) {
      throw new Error(
        `npx noskills --version printed "${version.stdout.trim()}", want "noskills ${packed.version}"`,
      );
    }
    console.log(`npx noskills --version → ${version.stdout.trim()}`);

    const json = await noskills("version", "--json");
    must(json, "npx noskills version --json");
    const reported = JSON.parse(json.stdout) as {
      runtime?: string;
      version?: string;
    };
    if (reported.runtime !== "go" || reported.version !== packed.version) {
      throw new Error(
        `npx noskills version --json reported ${json.stdout.trim()}; the launcher did not run the Go binary of ${packed.version}`,
      );
    }
    console.log(`npx noskills version --json → runtime ${reported.runtime}`);

    // An unknown first word goes from the binary to the TypeScript CLI
    // bundle the launcher names in NOSKILLS_TS_BUNDLE, which prints its help.
    const forwarded = await noskills("no-such-command");
    if (!forwarded.stdout.includes("noskills <command> [options]")) {
      throw new Error(
        `npx noskills no-such-command did not reach the TypeScript CLI:\n${forwarded.stdout}${forwarded.stderr}`,
      );
    }
    console.log("npx noskills no-such-command → the TypeScript CLI's help");

    console.log("noskills launcher preflight: OK");
  } finally {
    await fs.rm(packDir, { recursive: true, force: true });
    await fs.rm(consumerDir, { recursive: true, force: true });
  }
};

if (import.meta.main) {
  // Script entry point: the preflight runs the file directly.
  // oxlint-disable-next-line node/no-top-level-await
  await main();
}
