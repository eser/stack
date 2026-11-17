// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Release preflight: install the npm launchers `eser` and `noskills` the way a
 * user would (TASK-261, TASK-254).
 *
 * Installs the packed npm packages `eser` (pkg/@eserstack/eser-bin) and
 * `noskills` (pkg/@eserstack/noskills-bin) and the workspace packages they
 * depend on from the tarballs library-pack wrote, with this host's platform
 * packages (`pkg/@eserstack/<name>-<platform>`, with the binaries
 * `eser codebase dist npm-binaries` staged) packed with pnpm pack, as the
 * publish job's `pnpm publish` does, into a scratch project OUTSIDE the
 * repository. Then it checks that `npx noskills` and `npx eser` run the Go
 * binaries, that noskills reaches the TypeScript CLI of @eserstack/noskills
 * for the commands it forwards, and that eser finds the noskills it depends
 * on with nothing but node on PATH, as the `npx eser@latest noskills` hooks
 * of eser 4.5 need. Outside the repo, Node cannot find the platform packages
 * through the workspace links, so a launcher that resolves them wrongly fails
 * here.
 *
 * pnpm pack writes a file at mode 0644 unless the package lists it in
 * `publishConfig.executableFiles` (npm pack keeps the mode on disk), so the
 * platform packages list their binary there, and the launcher adds the
 * execute bits on its first run if an install still lost them (TASK-368). The
 * preflight packs with pnpm as the publish job does, fails unless the tarball
 * holds the binary with the execute bits, runs `npx <name> --help` first and
 * fails on an EACCES, and then checks that the installed binary is executable.
 * The plugin-bins preflight packs the noskills platform package with npm, so
 * both packers are covered.
 *
 * npm fetches the external dependencies and the other optional dependencies
 * (the ajan libraries and the other platforms' packages) from the registry;
 * for a version that is not published yet the optional ones are missing,
 * which npm skips and the checks here do not need.
 *
 * It imports no workspace package by name, only Node built-ins and the
 * scripts next to it: it checks the packages as npm installs them, so it must
 * not lean on the workspace it checks.
 *
 * Usage:
 *   go run ./cmd/eser codebase dist compile --current-only
 *   go run ./cmd/eser codebase dist npm-binaries
 *   pnpm -r build
 *   rm -rf etc/temp/npm-packs && pnpm -r --filter "./pkg/@eserstack/*" pack --pack-destination etc/temp/npm-packs
 *   node etc/scripts/preflight-npm-launchers.ts
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
import * as libraryConsumer from "./preflight-library-consumer.ts";
import * as npmConsumer from "./preflight-npm-consumer.ts";
import * as pluginBins from "./preflight-plugin-bins.ts";

/**
 * The npm launcher packages, pkg/@eserstack/<name>-bin, each with the
 * platform packages @eserstack/<name>-<platform>.
 */
const LAUNCHERS = ["eser", "noskills"] as const;

/** pnpm pack of one package directory. */
const PACK_TIMEOUT_MS = 60_000;

/** npm install of the tarballs and the registry's packages. */
const NPM_INSTALL_TIMEOUT_MS = 300_000;

/** One eser or noskills command. */
const COMMAND_TIMEOUT_MS = 30_000;

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

/** Fails with the steps to run when a file the preflight installs is missing. */
const requireFile = async (file: string, hint: string): Promise<void> => {
  try {
    await fs.stat(file);
  } catch (error) {
    if (isNotFound(error)) {
      throw new Error(`${file} is missing; ${hint}`, { cause: error });
    }
    throw error;
  }
};

/**
 * Packs the host's platform package of `launcher` with pnpm, as the publish
 * job does, and checks that the tarball keeps the binary's execute bits.
 */
const packPlatformPackage = async (
  repoRoot: string,
  launcher: string,
  packDir: string,
): Promise<string> => {
  const platformDir = `${repoRoot}/pkg/@eserstack/${launcher}-${hostPlatform()}`;
  const binaryName = `${launcher}${process.platform === "win32" ? ".exe" : ""}`;

  await requireFile(
    `${platformDir}/${binaryName}`,
    "run `go run ./cmd/eser codebase dist compile --current-only` and `go run ./cmd/eser codebase dist npm-binaries` first.",
  );

  const tarball = await packOne(platformDir, packDir);
  const packedMode = tarEntryMode(
    zlib.gunzipSync(await fs.readFile(tarball)),
    `package/${binaryName}`,
  );
  if (packedMode === null) {
    throw new Error(`${tarball} has no package/${binaryName}`);
  }
  console.log(
    `pnpm pack wrote ${launcher}'s package/${binaryName} at mode ${formatMode(packedMode)}`,
  );
  if (process.platform !== "win32" && (packedMode & 0o111) !== 0o111) {
    throw new Error(
      `pnpm pack wrote package/${binaryName} at mode ${formatMode(packedMode)}, want the execute bits 0111 set (publishConfig.executableFiles in ${platformDir}/package.json)`,
    );
  }

  return tarball;
};

/**
 * Runs `npx <launcher> --help` first, as `eser noskills --help` runs it, so
 * this run finds the binary at the mode pnpm pack wrote, and checks that the
 * launcher made the installed binary executable.
 */
const checkFirstRun = async (
  consumerDir: string,
  launcher: string,
): Promise<void> => {
  const help = await npmConsumer.run(
    ["npx", launcher, "--help"],
    consumerDir,
    COMMAND_TIMEOUT_MS,
  );
  if (`${help.stdout}${help.stderr}`.includes("EACCES")) {
    throw new Error(
      `npx ${launcher} --help hit EACCES, so the launcher ran a binary it cannot execute:\n${help.stdout}${help.stderr}`,
    );
  }
  must(help, `npx ${launcher} --help`);
  console.log(`npx ${launcher} --help → OK, no EACCES`);

  if (process.platform !== "win32") {
    const installed = `${consumerDir}/node_modules/@eserstack/${launcher}-${hostPlatform()}/${launcher}`;
    const mode = (await fs.stat(installed)).mode;
    if ((mode & 0o111) !== 0o111) {
      throw new Error(
        `${installed} is at mode ${formatMode(mode)} after the launcher ran it, want the execute bits 0111 set`,
      );
    }
    console.log(
      `installed ${launcher} binary after the first run → ${formatMode(mode)}`,
    );
  }

  const version = await npmConsumer.run(
    ["npx", launcher, "--version"],
    consumerDir,
    COMMAND_TIMEOUT_MS,
  );
  must(version, `npx ${launcher} --version`);
  console.log(`npx ${launcher} --version → ${version.stdout.trim()}`);
};

/** The noskills checks: the Go binary runs, and forwards to the TS CLI. */
const checkNoskills = async (
  consumerDir: string,
  version: string,
): Promise<void> => {
  // `npx noskills`, as a user and the hooks run it. The installed bin is
  // found locally, so npx does not reach the registry. (`npx --no noskills
  // --version` would be npx's own --version.)
  const noskills = (...args: string[]) =>
    npmConsumer.run(
      ["npx", "noskills", ...args],
      consumerDir,
      COMMAND_TIMEOUT_MS,
    );

  const printed = await noskills("--version");
  if (printed.stdout.trim() !== `noskills ${version}`) {
    throw new Error(
      `npx noskills --version printed "${printed.stdout.trim()}", want "noskills ${version}"`,
    );
  }

  const json = await noskills("version", "--json");
  must(json, "npx noskills version --json");
  const reported = JSON.parse(json.stdout) as {
    runtime?: string;
    version?: string;
  };
  if (reported.runtime !== "go" || reported.version !== version) {
    throw new Error(
      `npx noskills version --json reported ${json.stdout.trim()}; the launcher did not run the Go binary of ${version}`,
    );
  }
  console.log(`npx noskills version --json → runtime ${reported.runtime}`);

  // An unknown first word goes from the binary to the TypeScript CLI of
  // @eserstack/noskills, which the launcher names in NOSKILLS_TS_BUNDLE and
  // which prints its help.
  const forwarded = await noskills("no-such-command");
  if (!forwarded.stdout.includes("noskills <command> [options]")) {
    throw new Error(
      `npx noskills no-such-command did not reach the TypeScript CLI:\n${forwarded.stdout}${forwarded.stderr}`,
    );
  }
  console.log("npx noskills no-such-command → the TypeScript CLI's help");
};

/**
 * The eser checks: the Go binary runs, and finds the noskills it depends on
 * through ESER_PLUGIN_PATH alone (TASK-254, decision-10). The launcher runs
 * with a PATH that holds only `node`, so neither a noskills on PATH nor the
 * npx fallback can answer instead; `npx eser@latest noskills invoke-hook`, as
 * eser 4.5 wrote it into repositories, must exit 0.
 */
const checkEser = async (
  consumerDir: string,
  version: string,
): Promise<void> => {
  const printed = await npmConsumer.run(
    ["npx", "eser", "--version"],
    consumerDir,
    COMMAND_TIMEOUT_MS,
  );
  if (printed.stdout.trim() !== `eser ${version}`) {
    throw new Error(
      `npx eser --version printed "${printed.stdout.trim()}", want "eser ${version}"`,
    );
  }

  const nodeOnly = await fs.mkdtemp(`${os.tmpdir()}/eser-preflight-path-`);

  try {
    const node = `${nodeOnly}/node${process.platform === "win32" ? ".exe" : ""}`;
    await fs.symlink(process.execPath, node);

    const eser = (...args: string[]) =>
      npmConsumer.run(
        [
          process.execPath,
          `${consumerDir}/node_modules/eser/dist/eser.js`,
          ...args,
        ],
        consumerDir,
        COMMAND_TIMEOUT_MS,
        { ...process.env, PATH: nodeOnly },
      );

    const noskills = await eser("noskills", "--version");
    if (noskills.stdout.trim() !== `noskills ${version}`) {
      throw new Error(
        `eser noskills --version printed "${noskills.stdout.trim()}" with only node on PATH, want "noskills ${version}" from the noskills eser depends on:\n${noskills.stderr}`,
      );
    }
    console.log(
      `eser noskills --version with only node on PATH → ${noskills.stdout.trim()}`,
    );

    const hook = await eser("noskills", "invoke-hook", "stop");
    must(hook, "eser noskills invoke-hook stop, as a v4.5 hook runs it");
    console.log("eser noskills invoke-hook stop → exit 0");
  } finally {
    await fs.rm(nodeOnly, { recursive: true, force: true });
  }
};

const main = async (): Promise<void> => {
  const repoRoot = distUtils.repoRootFrom(import.meta.dirname);
  const manifests = await pluginBins.readWorkspaceManifests(repoRoot);
  const version = manifests.get("noskills")?.version ?? "";

  // The launchers and every workspace package they depend on, from the
  // tarballs library-pack wrote, so npm takes none of them from the registry.
  const packed = [
    ...new Set(
      LAUNCHERS.flatMap((launcher) =>
        pluginBins.workspaceClosure(launcher, manifests),
      ),
    ),
  ]
    .sort()
    .map(
      (name) =>
        `${repoRoot}/${pluginBins.PACKS_DIR}/${libraryConsumer.tarballName(
          name,
          manifests.get(name)?.version ?? version,
        )}`,
    );

  await Promise.all(
    packed.map((tarball) =>
      requireFile(
        tarball,
        "run the preflight steps library-build and library-pack first.",
      ),
    ),
  );

  // Both directories live under the OS temp dir, never under the repo.
  const packDir = await fs.mkdtemp(`${os.tmpdir()}/launchers-preflight-pack-`);
  const consumerDir = await fs.mkdtemp(
    `${os.tmpdir()}/launchers-preflight-consumer-`,
  );

  try {
    // A directory per launcher: packOne finds its tarball as the one new
    // file there.
    const platformTarballs = await Promise.all(
      LAUNCHERS.map(async (launcher) => {
        const dir = `${packDir}/${launcher}`;
        await fs.mkdir(dir);

        return await packPlatformPackage(repoRoot, launcher, dir);
      }),
    );

    const tarballs = [...packed, ...platformTarballs];

    await fs.writeFile(
      `${consumerDir}/package.json`,
      '{"name":"launchers-preflight-consumer","private":true,"version":"1.0.0"}\n',
    );

    console.log(
      `Installing ${tarballs.length} tarballs into ${consumerDir} ...`,
    );
    must(
      await npmConsumer.run(
        ["npm", "install", "--no-audit", "--no-fund", ...tarballs],
        consumerDir,
        NPM_INSTALL_TIMEOUT_MS,
      ),
      "npm install of the packed launchers",
    );

    await Promise.all(
      LAUNCHERS.map((launcher) => checkFirstRun(consumerDir, launcher)),
    );

    await checkNoskills(consumerDir, version);
    await checkEser(consumerDir, version);

    console.log("npm launchers preflight: OK");
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
