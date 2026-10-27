// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Release preflight: install the noskills npm launcher the way a user would
 * (TASK-261).
 *
 * Packs `pkg/@eserstack/noskills/dist` (the launcher, from npm-build.ts) and
 * this host's platform package (`pkg/@eserstack/noskills-<platform>`, with
 * the binary `eser dev npm-binaries` staged) with pnpm pack, as the publish
 * job's `pnpm publish` does, installs both with npm into a scratch project
 * OUTSIDE the repository, and checks that `npx noskills` runs the Go binary,
 * and that the binary reaches the TypeScript CLI the launcher carries for the
 * commands it forwards. Outside the repo, Node cannot find the platform
 * package through the workspace links, so a launcher that resolves it wrongly
 * fails here.
 *
 * pnpm pack writes a file at mode 0644 unless the package lists it in
 * `publishConfig.executableFiles` (npm pack keeps the mode on disk), so the
 * platform packages list their binary there, and the launcher adds the
 * execute bits on its first run if an install still lost them (TASK-368). The
 * preflight packs with pnpm as the publish job does, fails unless the tarball
 * holds the binary with the execute bits, runs `npx noskills --help` first and
 * fails on an EACCES, and then checks that the installed binary is executable.
 * The plugin-bins preflight packs the platform package with npm, so both
 * packers are covered.
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
import * as zlib from "node:zlib";
import * as distUtils from "./dist-utils.ts";
import * as npmConsumer from "./preflight-npm-consumer.ts";

/** pnpm pack of one package directory. */
const PACK_TIMEOUT_MS = 60_000;

/** npm install of the two tarballs and the registry's optional packages. */
const NPM_INSTALL_TIMEOUT_MS = 180_000;

/** One noskills command through npx. */
const NOSKILLS_COMMAND_TIMEOUT_MS = 30_000;

/** The size of a tar header, and the block size entry data is padded to. */
const TAR_BLOCK = 512;

/** The typeflags of a regular file: "0", or NUL in old archives. */
const TAR_REGULAR_FILE = new Set([0x30, 0x00]);

/** A NUL-terminated text field of a tar header. */
const tarField = (
  header: Uint8Array,
  offset: number,
  length: number,
): string => {
  const bytes = header.subarray(offset, offset + length);
  const end = bytes.indexOf(0);

  return new TextDecoder().decode(end === -1 ? bytes : bytes.subarray(0, end));
};

/** An octal number field of a tar header. */
const tarOctal = (
  header: Uint8Array,
  offset: number,
  length: number,
  what: string,
): number => {
  const text = tarField(header, offset, length).trim();
  const value = text === "" ? 0 : Number.parseInt(text, 8);

  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`the tar header has a malformed ${what} field "${text}"`);
  }

  return value;
};

/**
 * The permission bits of the regular file `name` in an uncompressed tar
 * archive, as its header holds them, or null when the archive has no such
 * file. Reads ustar headers, the format npm and pnpm pack write; the names
 * here are short, so the pax headers that carry long names are skipped.
 *
 * @throws Error for a header whose size or mode is not octal
 */
export const tarEntryMode = (tar: Uint8Array, name: string): number | null => {
  let offset = 0;

  while (offset + TAR_BLOCK <= tar.length) {
    const header = tar.subarray(offset, offset + TAR_BLOCK);
    const entryName = tarField(header, 0, 100);

    // The archive ends with zero blocks.
    if (entryName === "") {
      return null;
    }

    const prefix =
      tarField(header, 257, 5) === "ustar" ? tarField(header, 345, 155) : "";
    const path = prefix === "" ? entryName : `${prefix}/${entryName}`;
    const size = tarOctal(header, 124, 12, "size");

    if (path === name && TAR_REGULAR_FILE.has(header[156]!)) {
      return tarOctal(header, 100, 8, "mode") & 0o777;
    }

    offset += TAR_BLOCK + Math.ceil(size / TAR_BLOCK) * TAR_BLOCK;
  }

  return null;
};

/** A file mode as `chmod` takes it, such as 0644. */
export const formatMode = (mode: number): string =>
  `0${(mode & 0o777).toString(8).padStart(3, "0")}`;

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
      ["pnpm", "pack", "--pack-destination", packDir],
      dir,
      PACK_TIMEOUT_MS,
    ),
    `pnpm pack in ${dir}`,
  );

  const added = (await fs.readdir(packDir)).filter(
    (name) => name.endsWith(".tgz") && !before.has(name),
  );

  if (added.length !== 1) {
    throw new Error(`pnpm pack in ${dir} wrote ${added.length} tarballs`);
  }

  return `${packDir}/${added[0]!}`;
};

const main = async (): Promise<void> => {
  const repoRoot = distUtils.repoRootFrom(import.meta.dirname);
  const distDir = `${repoRoot}/pkg/@eserstack/noskills/dist`;
  const platformDir = `${repoRoot}/pkg/@eserstack/noskills-${hostPlatform()}`;
  const binaryName = `noskills${process.platform === "win32" ? ".exe" : ""}`;
  const binary = `${platformDir}/${binaryName}`;

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
    const platformTarball = await packOne(platformDir, packDir);
    const tarballs = [await packOne(distDir, packDir), platformTarball];

    const packedMode = tarEntryMode(
      zlib.gunzipSync(await fs.readFile(platformTarball)),
      `package/${binaryName}`,
    );
    if (packedMode === null) {
      throw new Error(`${platformTarball} has no package/${binaryName}`);
    }
    console.log(
      `pnpm pack wrote package/${binaryName} at mode ${formatMode(packedMode)}`,
    );
    if (process.platform !== "win32" && (packedMode & 0o111) !== 0o111) {
      throw new Error(
        `pnpm pack wrote package/${binaryName} at mode ${formatMode(packedMode)}, want the execute bits 0111 set (publishConfig.executableFiles in ${platformDir}/package.json)`,
      );
    }

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

    // `--help` first, as `eser noskills --help` runs it: this run finds the
    // binary at the mode pnpm pack wrote.
    const help = await noskills("--help");
    if (`${help.stdout}${help.stderr}`.includes("EACCES")) {
      throw new Error(
        `npx noskills --help hit EACCES, so the launcher ran a binary it cannot execute:\n${help.stdout}${help.stderr}`,
      );
    }
    must(help, "npx noskills --help");
    console.log("npx noskills --help → OK, no EACCES");

    if (process.platform !== "win32") {
      const installed = `${consumerDir}/node_modules/@eserstack/noskills-${hostPlatform()}/${binaryName}`;
      const mode = (await fs.stat(installed)).mode;
      if ((mode & 0o111) !== 0o111) {
        throw new Error(
          `${installed} is at mode ${formatMode(mode)} after the launcher ran it, want the execute bits 0111 set`,
        );
      }
      console.log(`installed binary after the first run → ${formatMode(mode)}`);
    }

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
