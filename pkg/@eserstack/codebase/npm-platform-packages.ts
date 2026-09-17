// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Pins the ajan platform packages of an npm bundle to one exact version.
 *
 * The TypeScript side of `@eserstack/ajan` is compiled against one ABI: the
 * symbol table of the shared library built from the same commit. A range such
 * as `^4.1.57` in the bundle's optionalDependencies admits any older 4.x, and
 * npm happily satisfies it from a stale cached packument or from a platform
 * package that is already installed — which is how `npx eser` on 2026-09-17
 * loaded ajan-darwin-arm64 4.1.57 under eser 4.5.1, failed on seven missing
 * exports, and threw from every FFI-only path.
 *
 * The workspace package.json keeps the range (pnpm must be able to install
 * the tree before the new version exists on npm); the published manifest is
 * rewritten here to the exact version being released. npm skips an optional
 * dependency whose version cannot be resolved, so an exact pin never breaks
 * an install — it only ever yields "no native library" instead of a wrong one.
 *
 * @module
 */

/** Scope prefix of the per-platform shared-library packages. */
const PLATFORM_PACKAGE_PREFIX = "@eserstack/ajan-";

/**
 * Returns a copy of `optionalDependencies` with every `@eserstack/ajan-*`
 * entry set to exactly `version`; other entries are kept as they are.
 */
export const pinPlatformPackages = (
  optionalDependencies: Readonly<Record<string, string>> | undefined,
  version: string,
): Record<string, string> | undefined => {
  if (optionalDependencies === undefined) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(optionalDependencies).map(([name, range]) => [
      name,
      name.startsWith(PLATFORM_PACKAGE_PREFIX) ? version : range,
    ]),
  );
};
