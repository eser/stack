// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Release preflight: installs the packed tarballs of every library together
 * into a scratch consumer and loads them the way a user's project would, with
 * plain Node and no type stripping.
 *
 * Node refuses to strip types under node_modules, so a published library must
 * ship JavaScript and point its exports at it; this check proves the emit of
 * etc/scripts/build-library.ts and the publishConfig.exports of
 * etc/scripts/gen-library-manifests.ts do that for every library at once. It
 * runs after `pnpm -r build` and `pnpm -r pack`, and:
 *
 * 1. writes a fresh consumer under etc/temp that depends on every library's
 *    tarball, with an `overrides` map from each @eserstack name to its
 *    tarball, so the exact versions pnpm wrote in place of `workspace:*`
 *    resolve from the pack directory;
 * 2. points the @eserstack scope at an unreachable registry and installs with
 *    `pnpm install --prefer-offline`: third-party packages come from the pnpm
 *    store (or the registry when the store lacks them), and any request for an
 *    @eserstack name fails the install;
 * 3. checks that the consumer's lockfile resolves every @eserstack package
 *    from a tarball;
 * 4. imports every export sub-path of every library with
 *    `node --no-strip-types` and fails on one that does not load;
 * 5. type-checks a module that imports every sub-path with tsc 7 and
 *    skipLibCheck off, so the `types` conditions resolve and the shipped
 *    declarations check clean.
 *
 * An export that stays on its .ts source when published (laroux-react's
 * ./client/bootstrap, which laroux-bundler copies and never imports) is
 * listed and skipped: Node cannot load it from node_modules by design.
 *
 * Usage:
 *   node ./etc/scripts/preflight-library-consumer.ts [--packs <dir>]
 *
 * Options:
 *   --packs <dir>  Where `pnpm -r pack` wrote the tarballs, relative to the
 *                  repository root (default: etc/temp/npm-packs).
 *
 * @module
 */

// The progress and result lines it prints are the preflight's log.
/* oxlint-disable no-console */

// etc/scripts belongs to no workspace package, so no import map resolves the
// bare "@eserstack/standards/cross-runtime". The cross-runtime layer imports
// no other package, so it loads by path from here.
import * as crossRuntime from "../../pkg/@eserstack/standards/cross-runtime/mod.ts";
import * as libraryManifests from "./gen-library-manifests.ts";

const { runtime } = crossRuntime;
const REPO_ROOT = runtime.path.resolve(import.meta.dirname ?? ".", "..", "..");
const PACKAGES_DIR = "pkg/@eserstack";
const CONSUMER_DIR = "etc/temp/library-consumer";
const DEFAULT_PACKS_DIR = "etc/temp/npm-packs";

/** The scope every workspace package is published under. */
const SCOPE = "@eserstack";

/**
 * The registry the consumer is given for the @eserstack scope: the discard
 * port of the loopback address, where nothing listens, so a request for an
 * @eserstack name fails at once instead of reaching npm.
 */
export const UNREACHABLE_REGISTRY = "http://127.0.0.1:9/";

/** pnpm install of every tarball and their third-party dependencies. */
const INSTALL_TIMEOUT_MS = 240_000;

/** One node or tsc run in the consumer. */
const RUN_TIMEOUT_MS = 120_000;

/** The options the check reads from its arguments. */
export type ConsumerOptions = {
  readonly packsDir: string;
};

/**
 * Reads `--packs <dir>`, in either the spaced or the `=` form.
 *
 * @throws Error for an unknown argument or a missing value
 */
export const parseOptions = (args: readonly string[]): ConsumerOptions => {
  let packsDir: string | null = null;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    const [flag, inline] = arg.split(/=(.*)/s, 2);

    if (flag !== "--packs") {
      throw new Error(
        `unknown argument ${arg}; usage: preflight-library-consumer.ts [--packs <dir>]`,
      );
    }

    const value = inline ?? args[(index += 1)];

    if (value === undefined || value === "") {
      throw new Error(`${flag} needs a value`);
    }

    packsDir = value;
  }

  return { packsDir: packsDir ?? DEFAULT_PACKS_DIR };
};

/**
 * The file name `pnpm pack` gives a package's tarball:
 * "@eserstack/primitives" at 5.0.0 becomes "eserstack-primitives-5.0.0.tgz".
 */
export const tarballName = (packageName: string, version: string): string =>
  `${packageName.replace(/^@/, "").replace("/", "-")}-${version}.tgz`;

/** The specifiers of one package, split by whether Node can load them. */
export type PackageSpecifiers = {
  /** Sub-paths whose published target carries conditions (emitted files). */
  readonly importable: readonly string[];
  /** Sub-paths that stay on a source file when published. */
  readonly sourceOnly: readonly string[];
};

/**
 * The specifiers a consumer imports a package by, one per export sub-path of
 * its published (packed) manifest: "." is the package name, "./x" is
 * "<name>/x". A sub-path whose target is a plain string is a source export
 * (LibraryOptions.sourceExports in gen-library-manifests.ts).
 */
export const exportSpecifiers = (
  packageName: string,
  exports: unknown,
): PackageSpecifiers => {
  const entries: [string, unknown][] =
    typeof exports === "string"
      ? [[".", exports]]
      : exports !== null && typeof exports === "object"
        ? Object.entries(exports)
        : [];
  const importable: string[] = [];
  const sourceOnly: string[] = [];

  for (const [subPath, target] of entries) {
    const specifier =
      subPath === "." ? packageName : `${packageName}/${subPath.slice(2)}`;

    (typeof target === "string" ? sourceOnly : importable).push(specifier);
  }

  return { importable, sourceOnly };
};

/** One workspace package and its tarball in the pack directory. */
export type PackedPackage = {
  readonly name: string;
  /** The absolute path of its tarball. */
  readonly tarball: string;
  /** A library: installed and imported, not only an override target. */
  readonly library: boolean;
  /** Its `@types/*` devDependencies, which its declarations may reference. */
  readonly typePackages: Readonly<Record<string, string>>;
};

/**
 * The package.json of the consumer: every library as a dependency, and the
 * `@types/*` packages the libraries develop against as devDependencies, the
 * way a TypeScript project that uses those libraries installs them itself.
 */
export const consumerManifest = (
  packages: readonly PackedPackage[],
): Record<string, unknown> => {
  const dependencies: Record<string, string> = {};
  const devDependencies: Record<string, string> = {};

  for (const pkg of packages) {
    if (pkg.library) {
      dependencies[pkg.name] = `file:${pkg.tarball}`;
    }

    for (const [name, range] of Object.entries(pkg.typePackages)) {
      devDependencies[name] ??= range;
    }
  }

  return {
    name: "library-consumer",
    private: true,
    type: "module",
    dependencies,
    devDependencies,
  };
};

/**
 * The pnpm-workspace.yaml of the consumer, which makes it a workspace root of
 * its own: the `overrides` map sends every @eserstack name, at whatever
 * version a packed manifest asks for, to its tarball. Install scripts stay
 * off; no library needs one to load, and pnpm then lists them instead of
 * failing the install.
 */
export const consumerWorkspaceYaml = (
  packages: readonly PackedPackage[],
): string =>
  [
    "strictDepBuilds: false",
    "overrides:",
    ...packages.map(
      (pkg) =>
        `  ${JSON.stringify(pkg.name)}: ${JSON.stringify(`file:${pkg.tarball}`)}`,
    ),
    "",
  ].join("\n");

/** The .npmrc of the consumer: the @eserstack scope on no registry. */
export const consumerNpmrc = (): string =>
  `${SCOPE}:registry=${UNREACHABLE_REGISTRY}\n`;

/**
 * The @eserstack entries of a pnpm lockfile that do not resolve from a
 * `file:` tarball, as "<name>@<reference>". Empty when every one does.
 */
export const registryResolved = (lockfile: string): string[] => {
  const found = new Set<string>();
  // A package or snapshot key: '@eserstack/fp@file:../npm-packs/x.tgz':
  const packageKey = /^\s+'?(@eserstack\/[a-z0-9-]+)@([^'\s]+?)'?:\s*$/u;
  // An importer dependency: its name, then `specifier:` and `version:`.
  const importerKey = /^\s+'?(@eserstack\/[a-z0-9-]+)'?:\s*$/u;
  const lines = lockfile.split("\n");

  for (const [index, line] of lines.entries()) {
    const keyed = packageKey.exec(line);

    if (keyed !== null) {
      if (!keyed[2]!.startsWith("file:")) {
        found.add(`${keyed[1]}@${keyed[2]}`);
      }
      continue;
    }

    const named = importerKey.exec(line);
    const version = /^\s+version:\s*(\S+)/u.exec(lines[index + 2] ?? "");

    if (
      named !== null &&
      version !== null &&
      !version[1]!.startsWith("file:")
    ) {
      found.add(`${named[1]}@${version[1]}`);
    }
  }

  return [...found].sort();
};

/**
 * The consumer module that node runs: it imports every specifier and prints
 * how many values each one exports. A module of types only exports none at
 * run time; the type check covers it.
 */
export const runtimeCheckSource = (specifiers: readonly string[]): string =>
  [
    `const specifiers = ${JSON.stringify(specifiers)};`,
    "for (const specifier of specifiers) {",
    "  const names = Object.keys(await import(specifier));",
    "  console.log(`${specifier}: ${names.length} value export(s)`);",
    "}",
    "",
  ].join("\n");

/** The consumer module that tsc checks: one type import per specifier. */
export const typeCheckSource = (specifiers: readonly string[]): string =>
  [
    ...specifiers.map(
      (specifier, index) =>
        `import type * as module${index} from ${JSON.stringify(specifier)};`,
    ),
    "",
    `export type Modules = [${specifiers.map((_, index) => `typeof module${index}`).join(", ")}];`,
    "",
  ].join("\n");

/** The tsconfig of the consumer: what a strict nodenext project sets. */
const CONSUMER_TSCONFIG = {
  compilerOptions: {
    target: "esnext",
    lib: ["esnext", "dom"],
    module: "nodenext",
    moduleResolution: "nodenext",
    types: [],
    strict: true,
    noEmit: true,
    skipLibCheck: false,
  },
  files: ["check.ts"],
};

type Manifest = libraryManifests.Manifest & {
  readonly version?: string;
  readonly devDependencies?: Readonly<Record<string, string>>;
};

/** Runs a command in the consumer and fails with its output when it fails. */
const run = async (
  cmd: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<string> => {
  const result = await runtime.exec.spawn(cmd, args, {
    cwd,
    stdout: "piped",
    stderr: "piped",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const decoder = new TextDecoder();
  const output = `${decoder.decode(result.stdout)}${decoder.decode(result.stderr)}`;

  if (!result.success) {
    throw new Error(
      `${[cmd, ...args].join(" ")} in ${cwd} exited with code ${result.code}:\n${output}`,
    );
  }

  return output;
};

const readManifest = async (path: string): Promise<Manifest> =>
  JSON.parse(await runtime.fs.readTextFile(path)) as Manifest;

/**
 * Every workspace package with its tarball. A published package without a
 * tarball fails here; a private one (test-kit) only becomes an override
 * target when it was packed, because only devDependencies name it.
 */
const packedPackages = async (packsDir: string): Promise<PackedPackage[]> => {
  const dirNames: string[] = [];

  for await (const entry of runtime.fs.readDir(
    runtime.path.join(REPO_ROOT, PACKAGES_DIR),
  )) {
    if (entry.isDirectory) {
      dirNames.push(entry.name);
    }
  }

  dirNames.sort();

  const packages = await Promise.all(
    dirNames.map(async (dirName): Promise<PackedPackage | null> => {
      const manifestPath = runtime.path.join(
        REPO_ROOT,
        PACKAGES_DIR,
        dirName,
        "package.json",
      );

      if (!(await runtime.fs.exists(manifestPath))) {
        return null;
      }

      const manifest = await readManifest(manifestPath);
      const name = manifest.name ?? "";
      const tarball = runtime.path.join(
        REPO_ROOT,
        packsDir,
        tarballName(name, manifest.version ?? ""),
      );

      if (!(await runtime.fs.exists(tarball))) {
        if (manifest.private === true) {
          return null;
        }

        throw new Error(
          `${tarball} is missing; run pnpm -r build and pnpm -r pack --pack-destination ${packsDir} first`,
        );
      }

      return {
        name,
        tarball,
        library: libraryManifests.isLibrary(manifest),
        typePackages: Object.fromEntries(
          Object.entries(manifest.devDependencies ?? {}).filter(([dep]) =>
            dep.startsWith("@types/"),
          ),
        ),
      };
    }),
  );

  return packages.filter((pkg) => pkg !== null);
};

const main = async (): Promise<void> => {
  const options = parseOptions(runtime.process.args);
  const packages = await packedPackages(options.packsDir);
  const libraries = packages.filter((pkg) => pkg.library);
  const consumerDir = runtime.path.join(REPO_ROOT, CONSUMER_DIR);

  // A fresh consumer every run, so nothing from an earlier install hides a
  // file the new tarballs lack.
  if (await runtime.fs.exists(consumerDir)) {
    await runtime.fs.remove(consumerDir, { recursive: true });
  }
  await runtime.fs.mkdir(consumerDir, { recursive: true });

  await Promise.all([
    runtime.fs.writeTextFile(
      runtime.path.join(consumerDir, "package.json"),
      `${JSON.stringify(consumerManifest(packages), null, 2)}\n`,
    ),
    runtime.fs.writeTextFile(
      runtime.path.join(consumerDir, "pnpm-workspace.yaml"),
      consumerWorkspaceYaml(packages),
    ),
    runtime.fs.writeTextFile(
      runtime.path.join(consumerDir, ".npmrc"),
      consumerNpmrc(),
    ),
  ]);

  console.log(
    `Installing ${libraries.length} libraries from ${options.packsDir}, with the ${SCOPE} scope on ${UNREACHABLE_REGISTRY}...`,
  );
  // The consumer's own pnpm-workspace.yaml keeps it out of the repository's
  // workspace.
  await run(
    "pnpm",
    ["install", "--prefer-offline"],
    consumerDir,
    INSTALL_TIMEOUT_MS,
  );

  const fromRegistry = registryResolved(
    await runtime.fs.readTextFile(
      runtime.path.join(consumerDir, "pnpm-lock.yaml"),
    ),
  );

  if (fromRegistry.length > 0) {
    throw new Error(
      `these ${SCOPE} packages did not resolve from a tarball: ${fromRegistry.join(", ")}`,
    );
  }

  console.log(`Every ${SCOPE} package resolved from its tarball.`);

  // The specifiers come from the installed, packed manifests: those carry the
  // publishConfig.exports that npm users get.
  const installed = await Promise.all(
    libraries.map(async (library) =>
      exportSpecifiers(
        library.name,
        (
          await readManifest(
            runtime.path.join(
              consumerDir,
              "node_modules",
              library.name,
              "package.json",
            ),
          )
        ).exports,
      ),
    ),
  );
  const importable = installed.flatMap((specifiers) => specifiers.importable);
  const sourceOnly = installed.flatMap((specifiers) => specifiers.sourceOnly);

  await Promise.all([
    runtime.fs.writeTextFile(
      runtime.path.join(consumerDir, "check.mjs"),
      runtimeCheckSource(importable),
    ),
    runtime.fs.writeTextFile(
      runtime.path.join(consumerDir, "check.ts"),
      typeCheckSource(importable),
    ),
    runtime.fs.writeTextFile(
      runtime.path.join(consumerDir, "tsconfig.json"),
      `${JSON.stringify(CONSUMER_TSCONFIG, null, 2)}\n`,
    ),
  ]);

  for (const specifier of sourceOnly) {
    console.log(`Skipping ${specifier}: it is published as a source file.`);
  }

  console.log(
    `Importing ${importable.length} export(s) with node --no-strip-types...`,
  );
  console.log(
    (
      await run(
        runtime.process.execPath(),
        ["--no-strip-types", "check.mjs"],
        consumerDir,
        RUN_TIMEOUT_MS,
      )
    ).trimEnd(),
  );

  console.log("Type-checking the declarations with tsc...");
  await run(
    runtime.process.execPath(),
    [
      runtime.path.join(REPO_ROOT, "node_modules", "typescript", "bin", "tsc"),
      "-p",
      "tsconfig.json",
    ],
    consumerDir,
    RUN_TIMEOUT_MS,
  );

  console.log(
    `\n${libraries.length} libraries install from their tarballs with no ${SCOPE} registry request and load from node_modules without type stripping.`,
  );
};

if (import.meta.main) {
  // Entry point: the await only runs when this file is executed directly.
  // oxlint-disable-next-line node/no-top-level-await
  await main();
}
