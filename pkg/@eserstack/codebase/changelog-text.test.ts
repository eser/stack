// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as changelogText from "./changelog-text.ts";

// Every path is built from this file's directory, so the tests do not depend
// on the working directory the suite runs from.
const testDir = import.meta.dirname;
if (testDir === undefined) {
  throw new Error(
    "changelog-text.test.ts must run from a local file: it reads sources " +
      "relative to its own directory.",
  );
}

const repoRoot = runtime.path.resolve(testDir, "../../..");

const importSpecifiers = (source: string): string[] =>
  [...source.matchAll(/^\s*(?:import|export)[^;]*?from\s+"([^"]+)"/gm)].map(
    (m) => m[1]!,
  );

Deno.test("changelog-text.ts imports nothing", async () => {
  const source = await runtime.fs.readTextFile(
    runtime.path.join(testDir, "changelog-text.ts"),
  );
  assert.assertEquals(importSpecifiers(source), []);
});

Deno.test("release notes extractor imports only node built-ins and the parser", async () => {
  const source = await runtime.fs.readTextFile(
    runtime.path.join(repoRoot, "etc/scripts/release-notes-from-changelog.ts"),
  );
  for (const spec of importSpecifiers(source)) {
    assert.assert(
      spec.startsWith("node:") ||
        spec === "../../pkg/@eserstack/codebase/changelog-text.ts",
      `unexpected import ${spec}`,
    );
  }
});

// The release-notes job holds contents: write. It must not resolve and run
// registry packages, and must not leave the token in .git/config.
Deno.test("release-notes job installs nothing and does not persist credentials", async () => {
  const workflow = await runtime.fs.readTextFile(
    runtime.path.join(repoRoot, ".github/workflows/build.yml"),
  );
  const start = workflow.indexOf("\n  release-notes:\n");
  assert.assert(start !== -1, "release-notes job not found");
  const rest = workflow.slice(start + 1);
  const next = rest.search(/\n {2}[a-z0-9-]+:\n/);
  const job = next === -1 ? rest : rest.slice(0, next);

  assert.assert(!/\b(npm|pnpm|yarn|bun)\s+(install|add|i|ci)\b/.test(job));
  assert.assert(!/\bnpx\b/.test(job));
  assert.assert(/persist-credentials:\s*false/.test(job));
  assert.assert(job.includes("etc/scripts/release-notes-from-changelog.ts"));
});

Deno.test("parseChangelogText still reads both heading styles", () => {
  const entries = changelogText.parseChangelogText(
    "# Changelog\n\n## 2.0.0 - 2026-01-02\n\n- b\n\n## [v1.0.0] - 2026-01-01\n\n- a\n",
  );
  assert.assertEquals(entries.map((e) => e.tag), ["v2.0.0", "v1.0.0"]);
});
