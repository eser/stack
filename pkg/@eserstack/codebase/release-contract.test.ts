// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The release flow rests on contracts that live outside the type system.
 *
 * `git add` pathspecs are strings matched against the working tree, so an entry
 * that no longer matches a tracked file is only discovered when someone runs
 * `eser codebase release` — after the version bump is already written to disk.
 * The per-package deno.json pathspec was exactly that: the JSR manifests are
 * generated and gitignored, `git add` exited 128 on them, and every release
 * attempt died half-applied.
 *
 * The order of the two pushes is likewise nothing but statement order. CI
 * triggers on the tag alone, so a tag pushed before the commit hands the
 * pipeline a ref pointing at history the remote does not have.
 *
 * Neither of those, nor the commit-message shape releases are found by, nor the
 * `gh release delete` that keeps unrelease from stranding a Release, produces a
 * compile error when it breaks. So this file reads release.ts as text and
 * parses the constructs out of it.
 *
 * @module
 */

import { assertEquals, assertStringIncludes } from "@std/assert";

// Resolved from this file's own URL: these tests read sources rather than
// import them, so surviving any cwd matters more than a module specifier.
const repoRoot = new URL("../../../", import.meta.url);

const read = (relative: string): Promise<string> =>
  Deno.readTextFile(new URL(relative, repoRoot));

const releaseSourcePath = "pkg/@eserstack/codebase/release.ts";

/**
 * Drop comments before searching for a construct.
 *
 * release.ts documents each of these contracts in prose directly above the code
 * implementing it, so "pushReleaseTag(", "gh release delete" and friends all
 * appear twice. Matching the comment would let this file pass while the code it
 * describes was gone — a vacuous release test is worse than no release test.
 */
const stripComments = (source: string): string =>
  source
    // Line comments go first. Several of them quote git pathspecs such as
    // `pkg/@eserstack/*/deno.json`, and the `/*` … `*/` inside one reads as a
    // block comment that swallows the code below it.
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n")
    // Block comments only where one opens the line: a `/*` mid-line is the same
    // kind of pathspec, this time in a string literal.
    .replace(/^[ \t]*\/\*[\s\S]*?\*\/[ \t]*$/gm, "");

/** Slice one `export const <name> = async (…)` declaration out of a source. */
const functionBody = (source: string, name: string): string => {
  const start = source.indexOf(`export const ${name} = async (`);
  assertEquals(start >= 0, true, `release.ts no longer declares ${name}()`);

  const rest = source.slice(start);
  const end = rest.indexOf("\nexport const ", 1);

  return end === -1 ? rest : rest.slice(0, end);
};

/** Pull the quoted pathspecs out of the `filesToStage` array literal. */
const parseStagedPathspecs = (source: string): string[] => {
  const literal = source.match(/const filesToStage = \[([^\]]*)\]/)?.[1];
  assertEquals(
    literal !== undefined,
    true,
    "release.ts no longer builds a filesToStage array",
  );

  return [...literal!.matchAll(/"([^"]+)"/g)].map((match) => match[1]!);
};

// =============================================================================
// What the release commit stages
// =============================================================================

Deno.test("release stages exactly the four version-bearing pathspecs", async () => {
  const source = stripComments(await read(releaseSourcePath));

  // Order is asserted too: this is the list handed to `git add` one entry at a
  // time, so it is the list a reader has to reconcile against the working tree.
  assertEquals(parseStagedPathspecs(source), [
    "VERSION",
    "CHANGELOG.md",
    "pkg/*/package.json",
    "package.json",
  ]);
});

Deno.test("release stages no generated JSR manifest", async () => {
  const source = stripComments(await read(releaseSourcePath));
  const staged = parseStagedPathspecs(source);

  assertEquals(
    staged.filter((pathspec) => pathspec.endsWith("deno.json")),
    [],
    "pkg/*/deno.json is gitignored; staging it exits 128 and aborts the " +
      "release after the version bump is already on disk",
  );

  // The other half of that contract, in the file that creates it.
  assertStringIncludes(await read(".gitignore"), "/pkg/@eserstack/*/deno.json");
});

// =============================================================================
// The release commit message
// =============================================================================

Deno.test("the release commit message is 'chore(codebase): release v<version>'", async () => {
  const body = functionBody(
    stripComments(await read(releaseSourcePath)),
    "release",
  );

  // Resolved through the tag binding rather than matched whole: the message is
  // built from `tag`, so the effective template is only pinned by expanding it.
  const tagTemplate = body.match(/const tag = `([^`]+)`/)?.[1];
  const messageTemplate = body.match(/const commitMessage = `([^`]+)`/)?.[1];

  assertEquals(tagTemplate, "v${version}");
  assertEquals(
    messageTemplate?.replace("${tag}", tagTemplate ?? ""),
    "chore(codebase): release v${version}",
  );
});

// =============================================================================
// Push order
// =============================================================================

Deno.test("release pushes the commit before it pushes the tag", async () => {
  const body = functionBody(
    stripComments(await read(releaseSourcePath)),
    "release",
  );

  const commitPush = body.indexOf("gitPushHead()");
  const tagPush = body.indexOf("pushReleaseTag(");

  assertEquals(commitPush >= 0, true, "release() no longer pushes the commit");
  assertEquals(tagPush >= 0, true, "release() no longer pushes the tag");
  assertEquals(
    commitPush < tagPush,
    true,
    "the tag push must come last: CI publishes from the tag, so a tag pushed " +
      "over unpushed history builds a ref the remote cannot resolve",
  );
});

// =============================================================================
// Commands release.ts must and must not run
// =============================================================================

Deno.test("release.ts never commits with --allow-empty", async () => {
  // Deliberately searched over the raw file, comments included: this is an
  // absence check, so the widest search is the strictest one. rerelease used to
  // re-fire the pipeline with an empty commit; it re-pushes the tag now.
  const source = await read(releaseSourcePath);

  assertEquals(source.includes("--allow-empty"), false);
});

Deno.test("unrelease deletes the GitHub Release, and does it before the tag", async () => {
  const source = stripComments(await read(releaseSourcePath));

  assertStringIncludes(source, "exec`gh release delete ${tag} --yes`");

  const body = functionBody(source, "unrelease");
  const releaseDelete = body.indexOf("deleteGitHubRelease(tag)");
  const tagDelete = body.indexOf("gitDeleteTag(tag)");

  assertEquals(
    releaseDelete >= 0,
    true,
    "unrelease() no longer deletes the GitHub Release",
  );
  assertEquals(
    releaseDelete < tagDelete,
    true,
    "gh resolves a Release by its tag, so deleting the tag first strands the " +
      "Release with no way to reach it",
  );
});

/**
 * The version the caller asks for must survive the FFI hop.
 *
 * `changelog-gen.ts` serialises an options object; Go decodes it into a struct
 * whose field is bound by a `json:` tag. Nothing checks that the two spell the
 * key the same way — rename either side and everything still compiles, every
 * other test still passes, and `req.Version` quietly decodes to "". Go then
 * falls back to patch-bumping the latest tag, which is verbatim the bug that
 * stamped a "## [v4.1.61]" heading onto the v4.3.0 release.
 */
Deno.test("the changelog version key matches the Go struct tag", async () => {
  const ts = stripComments(
    await read("pkg/@eserstack/codebase/changelog-gen.ts"),
  );
  const go = await read("pkg/@eserstack/ajan/bridge.go");

  // The key as it goes onto the wire, read out of the payload literal rather
  // than from the file at large — "version" appears throughout both sources.
  const payload = ts.slice(
    ts.indexOf("EserAjanCodebaseGenerateChangelog("),
  ).slice(0, 400);

  assertStringIncludes(
    payload,
    "version: options.version",
    "changelog-gen.ts stopped sending the caller's version",
  );

  // …and the key the Go side binds to that field.
  const request = go.slice(go.indexOf("type codebaseChangelogRequest struct"));
  const field = request.slice(0, request.indexOf("}"));

  assertStringIncludes(
    field,
    `json:"version,omitempty"`,
    "bridge.go's codebaseChangelogRequest no longer decodes the `version` key",
  );
});
