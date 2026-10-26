// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Release preflight: installs the packed tarball of a library into a scratch
 * consumer and loads it the way a user's project would, with plain Node and
 * no type stripping.
 *
 * Node refuses to strip types under node_modules, so a published library must
 * ship JavaScript and point its exports at it; this check proves the emit of
 * etc/scripts/build-library.ts and the publishConfig.exports of
 * etc/scripts/gen-library-manifests.ts do that. It runs after `pnpm -r build`
 * and `pnpm -r pack`, and:
 *
 * 1. installs the package's tarball from the pack directory into a fresh
 *    consumer under etc/temp with `pnpm install --offline`, outside the
 *    workspace, so no registry is asked;
 * 2. imports every export sub-path with `node --no-strip-types` and fails on a
 *    sub-path that does not load;
 * 3. type-checks a module that imports every sub-path with tsc 7 and
 *    skipLibCheck off, so the `types` conditions resolve and the shipped
 *    declarations check clean.
 *
 * It checks one package at a time and only packages without @eserstack
 * dependencies: a tarball with workspace dependencies needs the `overrides`
 * map of TASK-236 to resolve them from the other tarballs.
 *
 * Usage:
 *   node ./etc/scripts/preflight-library-consumer.ts [--package <name>] [--packs <dir>]
 *
 * Options:
 *   --package <name>  The library to check (default: @eserstack/primitives).
 *   --packs <dir>     Where `pnpm -r pack` wrote the tarballs, relative to the
 *                     repository root (default: etc/temp/npm-packs).
 *
 * @module
 */

// The progress and result lines it prints are the preflight's log.
/* oxlint-disable no-console */

// etc/scripts belongs to no workspace package, so no import map resolves the
// bare "@eserstack/standards/cross-runtime". The cross-runtime layer imports
// no other package, so it loads by path from here.
import * as crossRuntime from "../../pkg/@eserstack/standards/cross-runtime/mod.ts";

const { runtime } = crossRuntime;
const REPO_ROOT = runtime.path.resolve(import.meta.dirname ?? ".", "..", "..");
const PACKAGES_DIR = "pkg/@eserstack";
const CONSUMERS_DIR = "etc/temp/library-consumer";

/** The default package: it has no workspace dependencies. */
const DEFAULT_PACKAGE = "@eserstack/primitives";
const DEFAULT_PACKS_DIR = "etc/temp/npm-packs";

/** pnpm install of one local tarball with no dependencies. */
const INSTALL_TIMEOUT_MS = 120_000;

/** One node or tsc run in the consumer. */
const RUN_TIMEOUT_MS = 60_000;

/** The options the check reads from its arguments. */
export type ConsumerOptions = {
  readonly packageName: string;
  readonly packsDir: string;
};

/**
 * Reads `--package <name>` and `--packs <dir>`, in either the spaced or the
 * `=` form.
 *
 * @throws Error for an unknown argument or a missing value
 */
export const parseOptions = (args: readonly string[]): ConsumerOptions => {
  const values: Record<string, string> = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    const [flag, inline] = arg.split(/=(.*)/s, 2);

    if (flag !== "--package" && flag !== "--packs") {
      throw new Error(
        `unknown argument ${arg}; usage: preflight-library-consumer.ts [--package <name>] [--packs <dir>]`,
      );
    }

    const value = inline ?? args[(index += 1)];

    if (value === undefined || value === "") {
      throw new Error(`${flag} needs a value`);
    }

    values[flag] = value;
  }

  return {
    packageName: values["--package"] ?? DEFAULT_PACKAGE,
    packsDir: values["--packs"] ?? DEFAULT_PACKS_DIR,
  };
};

/**
 * The file name `pnpm pack` gives a package's tarball:
 * "@eserstack/primitives" at 5.0.0 becomes "eserstack-primitives-5.0.0.tgz".
 */
export const tarballName = (packageName: string, version: string): string =>
  `${packageName.replace(/^@/, "").replace("/", "-")}-${version}.tgz`;

/**
 * The specifiers a consumer imports a package by, one per export sub-path:
 * "." is the package name, "./x" is "<name>/x".
 */
export const exportSpecifiers = (
  packageName: string,
  exports: unknown,
): string[] => {
  const subPaths =
    typeof exports === "string"
      ? ["."]
      : exports !== null && typeof exports === "object"
        ? Object.keys(exports)
        : [];

  return subPaths.map((subPath) =>
    subPath === "." ? packageName : `${packageName}/${subPath.slice(2)}`,
  );
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

type Manifest = {
  readonly version?: string;
  readonly exports?: unknown;
  readonly dependencies?: Readonly<Record<string, string>>;
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

/** The directory of a workspace package by its name. */
const findPackageDir = async (packageName: string): Promise<string> => {
  for await (const entry of runtime.fs.readDir(
    runtime.path.join(REPO_ROOT, PACKAGES_DIR),
  )) {
    const manifestPath = runtime.path.join(
      REPO_ROOT,
      PACKAGES_DIR,
      entry.name,
      "package.json",
    );

    if (
      entry.isDirectory &&
      (await runtime.fs.exists(manifestPath)) &&
      (
        JSON.parse(await runtime.fs.readTextFile(manifestPath)) as {
          name?: string;
        }
      ).name === packageName
    ) {
      return runtime.path.dirname(manifestPath);
    }
  }

  throw new Error(`no workspace package is named ${packageName}`);
};

const main = async (): Promise<void> => {
  const options = parseOptions(runtime.process.args);
  const pkgDir = await findPackageDir(options.packageName);
  const manifest = JSON.parse(
    await runtime.fs.readTextFile(runtime.path.join(pkgDir, "package.json")),
  ) as Manifest;
  const workspaceDeps = Object.keys(manifest.dependencies ?? {}).filter(
    (name) => name.startsWith("@eserstack/"),
  );

  if (workspaceDeps.length > 0) {
    throw new Error(
      `${options.packageName} depends on ${workspaceDeps.join(", ")}; a lone tarball cannot resolve them`,
    );
  }

  const tarball = runtime.path.join(
    REPO_ROOT,
    options.packsDir,
    tarballName(options.packageName, manifest.version ?? ""),
  );

  if (!(await runtime.fs.exists(tarball))) {
    throw new Error(
      `${tarball} is missing; run pnpm -r build and pnpm -r pack --pack-destination ${options.packsDir} first`,
    );
  }

  const consumerDir = runtime.path.join(
    REPO_ROOT,
    CONSUMERS_DIR,
    options.packageName.replace(/^@/, "").replace("/", "-"),
  );

  // A fresh consumer every run, so nothing from an earlier install hides a
  // file the new tarball lacks.
  if (await runtime.fs.exists(consumerDir)) {
    await runtime.fs.remove(consumerDir, { recursive: true });
  }
  await runtime.fs.mkdir(consumerDir, { recursive: true });

  const specifiers = exportSpecifiers(options.packageName, manifest.exports);

  await Promise.all([
    runtime.fs.writeTextFile(
      runtime.path.join(consumerDir, "package.json"),
      `${JSON.stringify(
        {
          name: "library-consumer",
          private: true,
          type: "module",
          dependencies: { [options.packageName]: `file:${tarball}` },
        },
        null,
        2,
      )}\n`,
    ),
    runtime.fs.writeTextFile(
      runtime.path.join(consumerDir, "check.mjs"),
      runtimeCheckSource(specifiers),
    ),
    runtime.fs.writeTextFile(
      runtime.path.join(consumerDir, "check.ts"),
      typeCheckSource(specifiers),
    ),
    runtime.fs.writeTextFile(
      runtime.path.join(consumerDir, "tsconfig.json"),
      `${JSON.stringify(CONSUMER_TSCONFIG, null, 2)}\n`,
    ),
  ]);

  console.log(`Installing ${runtime.path.relative(REPO_ROOT, tarball)}...`);
  // --ignore-workspace: the consumer lives below the workspace root but is no
  // member of it. --offline: the tarball has no dependencies to fetch.
  await run(
    "pnpm",
    ["install", "--ignore-workspace", "--offline", "--lockfile=false"],
    consumerDir,
    INSTALL_TIMEOUT_MS,
  );

  console.log("Importing every export with node --no-strip-types...");
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
    `\n${options.packageName} installs and loads from node_modules without type stripping.`,
  );
};

if (import.meta.main) {
  // Entry point: the await only runs when this file is executed directly.
  // oxlint-disable-next-line node/no-top-level-await
  await main();
}
