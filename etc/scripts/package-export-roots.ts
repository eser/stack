// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Prints every module the workspace packages publish, one path per line.
 *
 * The paths are the file targets of each package's package.json `exports`,
 * relative to the repository root and sorted. The `docs-lint` script passes
 * them to `deno doc --lint`, so it checks every module consumers can import,
 * not only each package's mod.ts.
 *
 * Usage: deno run --allow-read ./etc/scripts/package-export-roots.ts
 *
 * @module
 */

// The root list is the command's output.
// deno-lint-ignore-file no-console

// etc/scripts belongs to no workspace package, so no import map resolves the
// bare "@eserstack/standards/cross-runtime". The cross-runtime layer imports
// no other package, so it loads by path from here.
import * as crossRuntime from "../../pkg/@eserstack/standards/cross-runtime/mod.ts";

const { runtime } = crossRuntime;
const REPO_ROOT = runtime.path.resolve(import.meta.dirname ?? ".", "..", "..");
const PACKAGES_DIR = "pkg/@eserstack";
const MODULE_FILE = /\.[cm]?[jt]sx?$/;

/**
 * The file targets of an `exports` field: the string form, a map of sub-paths
 * to paths, and maps of conditions to paths at any depth.
 */
export const exportTargets = (value: unknown): string[] => {
  if (typeof value === "string") {
    return [value];
  }

  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  return Object.values(value).flatMap(exportTargets);
};

/**
 * The module roots of one package directory, relative to the repository root.
 * A directory without a package.json publishes nothing.
 */
const packageRoots = async (pkgDir: string): Promise<string[]> => {
  const pkgJsonPath = runtime.path.join(REPO_ROOT, pkgDir, "package.json");

  if (!(await runtime.fs.exists(pkgJsonPath))) {
    return [];
  }

  const pkg = JSON.parse(await runtime.fs.readTextFile(pkgJsonPath)) as Record<
    string,
    unknown
  >;

  return exportTargets(pkg["exports"])
    .filter((target) => MODULE_FILE.test(target))
    .map((target) => runtime.path.join(pkgDir, target));
};

const main = async (): Promise<void> => {
  const pkgDirs: string[] = [];

  for await (
    const entry of runtime.fs.readDir(
      runtime.path.join(REPO_ROOT, PACKAGES_DIR),
    )
  ) {
    if (entry.isDirectory) {
      pkgDirs.push(runtime.path.join(PACKAGES_DIR, entry.name));
    }
  }

  const roots = (await Promise.all(pkgDirs.map(packageRoots))).flat();

  console.log([...new Set(roots)].sort().join("\n"));
};

if (import.meta.main) {
  // Entry point: the await only runs when this file is executed directly.
  // deno-lint-ignore no-top-level-await
  await main();
}
