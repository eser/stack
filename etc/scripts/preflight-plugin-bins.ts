// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Release preflight: installs the three plugin bins the Go eser forwards to,
 * `eser-posts`, `laroux` and `noskills`, from their packed packages into a
 * scratch project OUTSIDE the repository, and runs them the way a user and
 * the Go eser would (TASK-252).
 *
 * - `eser-posts` comes from the @eserstack/posts library tarball, whose
 *   publishConfig.bin points at the emitted dist/main.js, and `laroux` from
 *   the tarball of the npm package `laroux` (pkg/@eserstack/laroux-bin), whose
 *   bin is its emitted dist/cli.js. Each is installed with the tarballs of its
 *   @eserstack dependencies, so npm takes them from the pack directory and not
 *   from the registry.
 * - `noskills` comes from the npm bundle that the noskills npm-build script
 *   writes into its dist/, and runs the Go binary of this host's
 *   @eserstack/noskills-<platform> package.
 *
 * The bundle and the library emit share dist/, and the library build removes
 * the bundle, so the preflight runs this script twice:
 *
 * 1. `--save-bundles`, after the npm-build steps and the noskills binary
 *    staging: packs the noskills bundle and this host's noskills platform
 *    package into etc/temp/plugin-packs with npm pack, which keeps the
 *    binary's executable bit (the pnpm-packed platform tarball in
 *    etc/temp/npm-packs has the binary at mode 0644);
 * 2. without arguments, after library-build and library-pack: installs the
 *    tarballs, checks that `eser-posts --help` prints the posts commands, and
 *    runs TestForwardReachesThePackedCLIs of cmd/eser with ESER_PACKED_BINS
 *    set to the installed bin directory, so `eser posts --help`,
 *    `eser laroux --help` and `eser noskills --help` resolve and run them.
 *
 * npm fetches the external dependencies and the optional platform packages
 * that are not packed here from the registry; an optional package of a
 * version that is not published yet is missing, which npm skips and the
 * checks do not need.
 *
 * Usage:
 *   node ./etc/scripts/preflight-plugin-bins.ts --save-bundles
 *   node ./etc/scripts/preflight-plugin-bins.ts
 *
 * @module
 */

// The progress and result lines it prints are the preflight's log.
/* oxlint-disable no-console */

import * as fs from "node:fs/promises";
import * as os from "node:os";
// etc/scripts belongs to no workspace package, so no import map resolves the
// bare "@eserstack/standards/cross-runtime". The cross-runtime layer imports
// no other package, so it loads by path from here.
import * as crossRuntime from "../../pkg/@eserstack/standards/cross-runtime/mod.ts";
import * as distUtils from "./dist-utils.ts";
import * as libraryConsumer from "./preflight-library-consumer.ts";
import * as npmConsumer from "./preflight-npm-consumer.ts";

/** Where library-pack writes every workspace tarball. */
const PACKS_DIR = "etc/temp/npm-packs";

/** Where `--save-bundles` keeps the bundle and platform tarballs. */
const BUNDLES_DIR = "etc/temp/plugin-packs";

/** The bundles: the npm package name and the directory npm-build writes. */
const BUNDLES: readonly { readonly name: string; readonly dir: string }[] = [
  { name: "noskills", dir: "pkg/@eserstack/noskills/dist" },
];

/** The library that carries the `eser-posts` bin. */
const POSTS_PACKAGE = "@eserstack/posts";

/** The workspace packages whose packed bins are installed: posts and laroux. */
const PACKED_BIN_PACKAGES: readonly string[] = [POSTS_PACKAGE, "laroux"];

/** What `eser-posts --help` prints first in its usage section. */
const POSTS_USAGE = "eser-posts <command> [options]";

/** The Go test that forwards to the installed bins. */
const GO_TEST = "TestForwardReachesThePackedCLIs";

/** npm pack of one bundle directory. */
const { runtime } = crossRuntime;

/** npm's os names, from the cross-runtime platform names. */
const NPM_OS: Readonly<Record<crossRuntime.Platform, string>> = {
  darwin: "darwin",
  linux: "linux",
  windows: "win32",
};

/** npm's cpu names, from the cross-runtime architecture names. */
const NPM_CPU: Readonly<Record<crossRuntime.Arch, string>> = {
  amd64: "x64",
  arm64: "arm64",
};

const NPM_PACK_TIMEOUT_MS = 60_000;

/** npm install of the tarballs and the registry's packages. */
const NPM_INSTALL_TIMEOUT_MS = 300_000;

/** One `eser-posts --help` run. */
const BIN_TIMEOUT_MS = 30_000;

/** go test of cmd/eser, which may compile it first. */
const GO_TEST_TIMEOUT_MS = 300_000;

/** What the script does, from its arguments. */
export type Mode = "check" | "save-bundles";

/**
 * Reads the mode: `--save-bundles`, or no argument for the check.
 *
 * @throws Error for any other argument
 */
export const parseMode = (args: readonly string[]): Mode => {
  if (args.length === 0) {
    return "check";
  }

  if (args.length === 1 && args[0] === "--save-bundles") {
    return "save-bundles";
  }

  throw new Error(
    `unknown arguments ${args.join(" ")}; usage: preflight-plugin-bins.ts [--save-bundles]`,
  );
};

/** A workspace package.json, as far as this script reads it. */
export type WorkspaceManifest = {
  readonly version?: string;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
  readonly optionalDependencies?: Readonly<Record<string, string>>;
};

/**
 * The package and every @eserstack package it reaches through
 * `dependencies`, sorted. Dev and optional dependencies are left out: npm
 * installs no dev dependencies of a dependency, and the optional platform
 * packages come from the registry or are skipped.
 *
 * @throws Error for a dependency that is no workspace package
 */
export const workspaceClosure = (
  name: string,
  manifests: ReadonlyMap<string, WorkspaceManifest>,
): string[] => {
  const seen = new Set<string>();
  const pending = [name];

  while (pending.length > 0) {
    const current = pending.pop()!;

    if (seen.has(current)) {
      continue;
    }

    const manifest = manifests.get(current);

    if (manifest === undefined) {
      throw new Error(`${current} is not a workspace package`);
    }

    seen.add(current);
    pending.push(
      ...Object.keys(manifest.dependencies ?? {}).filter((dependency) =>
        dependency.startsWith("@eserstack/"),
      ),
    );
  }

  return [...seen].sort();
};

/**
 * The platform package npm installs for a host: @eserstack/<name> with the
 * npm `<os>-<cpu>` suffix, from the cross-runtime platform and architecture.
 */
export const hostPlatformPackage = (
  name: string,
  platform: crossRuntime.Platform,
  arch: crossRuntime.Arch,
): string => `@eserstack/${name}-${NPM_OS[platform]}-${NPM_CPU[arch]}`;

const must = (result: npmConsumer.RunResult, what: string): void => {
  if (result.code !== 0) {
    throw new Error(
      `${what} failed (exit ${result.code})\n${result.stdout}${result.stderr}`,
    );
  }
};

const isNotFound = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

const readJson = async <T>(path: string, hint: string): Promise<T> => {
  try {
    return JSON.parse(await fs.readFile(path, "utf8")) as T;
  } catch (error) {
    if (isNotFound(error)) {
      throw new Error(`${path} is missing; ${hint}`, { cause: error });
    }
    throw error;
  }
};

/** Reads a package.json, or returns null when the directory has none. */
const readManifestIfAny = async (
  path: string,
): Promise<(WorkspaceManifest & { name?: string }) | null> => {
  try {
    return JSON.parse(await fs.readFile(path, "utf8")) as WorkspaceManifest & {
      name?: string;
    };
  } catch (error) {
    // directives/ holds documents only and has no package.json.
    if (isNotFound(error)) {
      return null;
    }
    throw error;
  }
};

/** Every workspace package.json under pkg/@eserstack, by package name. */
const readWorkspaceManifests = async (
  repoRoot: string,
): Promise<Map<string, WorkspaceManifest>> => {
  const pkgRoot = `${repoRoot}/pkg/@eserstack`;
  const entries = await fs.readdir(pkgRoot, { withFileTypes: true });
  const manifests = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) =>
        readManifestIfAny(`${pkgRoot}/${entry.name}/package.json`),
      ),
  );
  const byName = new Map<string, WorkspaceManifest>();

  for (const manifest of manifests) {
    if (manifest?.name !== undefined) {
      byName.set(manifest.name, manifest);
    }
  }

  return byName;
};

/** Packs one bundle into the bundles directory after checking its name. */
const packBundle = async (
  repoRoot: string,
  bundle: (typeof BUNDLES)[number],
  bundlesDir: string,
): Promise<void> => {
  const dir = `${repoRoot}/${bundle.dir}`;
  const manifest = await readJson<{ name?: string }>(
    `${dir}/package.json`,
    `run the ${bundle.name} npm-build script first`,
  );

  // The library build also writes a package.json into dist/, named after
  // the library; only the bundle is named after its bin.
  if (manifest.name !== bundle.name) {
    throw new Error(
      `${dir} holds ${manifest.name ?? "an unnamed package"}, not the ${bundle.name} bundle; run the ${bundle.name} npm-build script first`,
    );
  }

  must(
    await npmConsumer.run(
      ["npm", "pack", "--pack-destination", bundlesDir],
      dir,
      NPM_PACK_TIMEOUT_MS,
    ),
    `npm pack in ${dir}`,
  );
  console.log(`Packed the ${bundle.name} bundle into ${BUNDLES_DIR}`);
};

/**
 * Packs this host's noskills platform package with npm, as the noskills
 * launcher preflight does: npm pack keeps the binary's executable bit.
 */
const packPlatformPackage = async (
  repoRoot: string,
  bundlesDir: string,
): Promise<void> => {
  const platform = crossRuntime.getPlatform();
  const name = hostPlatformPackage(
    "noskills",
    platform,
    crossRuntime.getArch(),
  );
  const dir = `${repoRoot}/pkg/${name}`;
  const binary = `${dir}/noskills${platform === "windows" ? ".exe" : ""}`;

  try {
    await fs.stat(binary);
  } catch (error) {
    if (isNotFound(error)) {
      throw new Error(
        `${binary} is missing; run \`go run ./cmd/eser dev compile --current-only\` and \`go run ./cmd/eser dev npm-binaries\` first`,
        { cause: error },
      );
    }
    throw error;
  }

  must(
    await npmConsumer.run(
      ["npm", "pack", "--pack-destination", bundlesDir],
      dir,
      NPM_PACK_TIMEOUT_MS,
    ),
    `npm pack in ${dir}`,
  );
  console.log(`Packed ${name} into ${BUNDLES_DIR}`);
};

const saveBundles = async (repoRoot: string): Promise<void> => {
  const bundlesDir = `${repoRoot}/${BUNDLES_DIR}`;

  // Empty first, so no tarball of an earlier version is left in it.
  await fs.rm(bundlesDir, { recursive: true, force: true });
  await fs.mkdir(bundlesDir, { recursive: true });
  await Promise.all([
    ...BUNDLES.map((bundle) => packBundle(repoRoot, bundle, bundlesDir)),
    packPlatformPackage(repoRoot, bundlesDir),
  ]);
};

/** Fails with the steps to run when a tarball is missing. */
const requireTarball = async (tarball: string): Promise<void> => {
  try {
    await fs.stat(tarball);
  } catch (error) {
    if (isNotFound(error)) {
      throw new Error(
        `${tarball} is missing; run the preflight steps library-build and library-pack, and this script with --save-bundles after the npm-build steps`,
        { cause: error },
      );
    }
    throw error;
  }
};

/** The tarballs the scratch project installs, as absolute paths. */
const consumerTarballs = async (repoRoot: string): Promise<string[]> => {
  const manifests = await readWorkspaceManifests(repoRoot);
  const version = manifests.get(POSTS_PACKAGE)?.version ?? "";
  const closure = new Set(
    PACKED_BIN_PACKAGES.flatMap((name) => workspaceClosure(name, manifests)),
  );
  const packed = [...closure]
    .sort()
    .map(
      (name) =>
        `${repoRoot}/${PACKS_DIR}/${libraryConsumer.tarballName(
          name,
          manifests.get(name)?.version ?? version,
        )}`,
    );
  const bundles = [
    ...BUNDLES.map((bundle) => bundle.name),
    hostPlatformPackage(
      "noskills",
      crossRuntime.getPlatform(),
      crossRuntime.getArch(),
    ),
  ].map(
    (name) =>
      `${repoRoot}/${BUNDLES_DIR}/${libraryConsumer.tarballName(name, version)}`,
  );

  await Promise.all([...packed, ...bundles].map(requireTarball));

  return [...packed, ...bundles];
};

const check = async (repoRoot: string): Promise<void> => {
  const tarballs = await consumerTarballs(repoRoot);
  // Under the OS temp dir, never under the repo: there Node would resolve a
  // dependency the tarballs lack from the workspace's node_modules.
  const consumerDir = await fs.mkdtemp(`${os.tmpdir()}/plugin-bins-consumer-`);

  try {
    await fs.writeFile(
      `${consumerDir}/package.json`,
      '{"name":"plugin-bins-consumer","private":true,"version":"1.0.0"}\n',
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
      "npm install of the packed plugins",
    );

    // The installed bin is found locally, so npx does not reach the registry.
    const help = await npmConsumer.run(
      ["npx", "eser-posts", "--help"],
      consumerDir,
      BIN_TIMEOUT_MS,
    );
    must(help, "npx eser-posts --help");
    if (!help.stdout.includes(POSTS_USAGE)) {
      throw new Error(
        `npx eser-posts --help did not print "${POSTS_USAGE}":\n${help.stdout}${help.stderr}`,
      );
    }
    console.log(`npx eser-posts --help on Node ${runtime.version} → OK`);

    // The bins the test runs inherit its environment, PATH and node included.
    const goRun = await runtime.exec.spawn(
      "go",
      ["test", "-count=1", "-v", "-run", `^${GO_TEST}$`, "./cmd/eser"],
      {
        cwd: repoRoot,
        env: { ESER_PACKED_BINS: `${consumerDir}/node_modules/.bin` },
        stdout: "piped",
        stderr: "piped",
        signal: AbortSignal.timeout(GO_TEST_TIMEOUT_MS),
      },
    );
    const decoder = new TextDecoder();
    const goTest: npmConsumer.RunResult = {
      code: goRun.code,
      stdout: decoder.decode(goRun.stdout),
      stderr: decoder.decode(goRun.stderr),
    };
    must(goTest, `go test -run ${GO_TEST}`);
    if (!goTest.stdout.includes(`--- PASS: ${GO_TEST}`)) {
      throw new Error(
        `go test did not pass ${GO_TEST} (skipped?):\n${goTest.stdout}${goTest.stderr}`,
      );
    }
    console.log(
      "eser posts, eser laroux and eser noskills --help → the packed bins",
    );

    console.log("plugin bins preflight: OK");
  } finally {
    await fs.rm(consumerDir, { recursive: true, force: true });
  }
};

const main = async (): Promise<void> => {
  const mode = parseMode(runtime.process.args);
  const repoRoot = distUtils.repoRootFrom(import.meta.dirname);

  if (mode === "save-bundles") {
    await saveBundles(repoRoot);

    return;
  }

  await check(repoRoot);
};

if (import.meta.main) {
  // Script entry point: the preflight runs the file directly.
  // oxlint-disable-next-line node/no-top-level-await
  await main();
}
