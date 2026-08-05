// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Guards the one version constraint in this repo whose violation is silent.
 *
 * `@eserstack/ajan` loads a per-platform native binary shipped as a separate npm
 * package (`@eserstack/ajan-darwin-arm64`, …) and declared as an
 * *optionalDependency*. Optional is what makes the failure quiet: when a range
 * matches nothing, pnpm omits the package rather than erroring, so the loader
 * falls through to whatever is already on disk — a stale binary against a newer
 * ABI — instead of failing the install.
 *
 * The ranges therefore cannot be pinned to the version being released:
 * the platform packages publish *after* the tag, so naming that exact version
 * deadlocked the 4.1.58 pipeline (see syncAjanVersions in versions.ts, and the
 * revert in 0d5c9cbf). They carry a floor range instead. That works until a
 * MAJOR bump, at which point `^4.1.0` stops admitting the version being
 * released and the omission goes unnoticed.
 *
 * Asserting every declared range admits the root VERSION is what makes that
 * unmissable: the bump itself trips this test, before anything is published.
 *
 * @module
 */

import { assert, assertGreater } from "@std/assert";
import * as stdPath from "@std/path";
import * as stdSemver from "@std/semver";

const repoRoot = stdPath.resolve(
  stdPath.dirname(stdPath.fromFileUrl(import.meta.url)),
  "../../..",
);

/**
 * A range written as a string literal in TypeScript, e.g.
 * `"@eserstack/ajan": "^4.1.0 || ^5.0.0"` inside a generated manifest.
 *
 * Deliberately excludes `workspace:` specifiers, which never resolve against
 * npm, and requires a caret or digit so prose mentioning a package name is not
 * mistaken for a declaration.
 */
const GENERATED_RANGE =
  /["'](@eserstack\/ajan[a-z0-9-]*)["']\s*:\s*["']([~^]?\d[^"']*)["']/g;

/** One `@eserstack/ajan*` range as declared in some package.json. */
type Declaration = {
  file: string;
  name: string;
  range: string;
};

/**
 * Collects every `@eserstack/ajan*` semver range declared in the workspace.
 *
 * `dist/` and `node_modules/` are skipped: those are build outputs and
 * installed trees, which legitimately carry exact versions rather than ranges.
 * `workspace:*` is skipped because it never resolves against npm.
 */
const collectDeclarations = async (): Promise<Declaration[]> => {
  const found: Declaration[] = [];

  const walk = async (dir: string): Promise<void> => {
    for await (const entry of Deno.readDir(dir)) {
      const full = stdPath.join(dir, entry.name);

      if (entry.isDirectory) {
        if (
          entry.name === "node_modules" || entry.name === "dist" ||
          entry.name === ".git"
        ) {
          continue;
        }

        await walk(full);

        continue;
      }

      // Ranges also live in code that GENERATES a package.json. npm-build.ts
      // stamps the published CLI's dependency on @eserstack/ajan as a literal,
      // and a walk restricted to package.json files silently exempted it -- so
      // the guard claimed to cover every declared range while missing one.
      if (entry.name.endsWith(".ts")) {
        const source = await Deno.readTextFile(full);

        for (const match of source.matchAll(GENERATED_RANGE)) {
          found.push({
            file: stdPath.relative(repoRoot, full),
            name: match[1]!,
            range: match[2]!,
          });
        }

        continue;
      }

      if (entry.name !== "package.json") {
        continue;
      }

      const parsed = JSON.parse(await Deno.readTextFile(full)) as Record<
        string,
        Record<string, string> | undefined
      >;

      for (
        const section of [
          "dependencies",
          "devDependencies",
          "optionalDependencies",
          "peerDependencies",
        ]
      ) {
        for (const [name, range] of Object.entries(parsed[section] ?? {})) {
          if (!name.startsWith("@eserstack/ajan")) {
            continue;
          }

          if (range.startsWith("workspace:")) {
            continue;
          }

          found.push({
            file: stdPath.relative(repoRoot, full),
            name,
            range,
          });
        }
      }
    }
  };

  await walk(repoRoot);

  return found;
};

Deno.test("every @eserstack/ajan range admits the version being released", async () => {
  const version = (await Deno.readTextFile(stdPath.join(repoRoot, "VERSION")))
    .trim();
  const released = stdSemver.parse(version);

  const declarations = await collectDeclarations();

  // Without this the test passes vacuously if the walk ever stops finding
  // package.json files — the failure mode a "checks all N" test is most prone
  // to, since N == 0 satisfies every assertion below.
  assertGreater(
    declarations.length,
    0,
    "no @eserstack/ajan ranges found; the walk is broken, not the ranges",
  );

  for (const declaration of declarations) {
    assert(
      stdSemver.satisfies(released, stdSemver.parseRange(declaration.range)),
      `${declaration.file}: "${declaration.name}": "${declaration.range}" ` +
        `does not admit ${version}. Widen it (e.g. add "|| ^${released.major}.0.0") ` +
        `BEFORE bumping — an optionalDependency that matches nothing ` +
        `is omitted silently, leaving a stale native binary against a new ABI.`,
    );
  }
});
