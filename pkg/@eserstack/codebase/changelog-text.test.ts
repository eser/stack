// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { assert, assertEquals } from "@std/assert";
import * as path from "@std/path";
import { parseChangelogText } from "./changelog-text.ts";

const repoRoot = path.resolve(import.meta.dirname!, "../../..");

const importSpecifiers = (source: string): string[] =>
  [...source.matchAll(/^\s*(?:import|export)[^;]*?from\s+"([^"]+)"/gm)].map(
    (m) => m[1]!,
  );

Deno.test("changelog-text.ts imports nothing", async () => {
  const source = await Deno.readTextFile(
    path.join(import.meta.dirname!, "changelog-text.ts"),
  );
  assertEquals(importSpecifiers(source), []);
});

Deno.test("release notes extractor imports only node built-ins and the parser", async () => {
  const source = await Deno.readTextFile(
    path.join(repoRoot, "etc/scripts/release-notes-from-changelog.ts"),
  );
  for (const spec of importSpecifiers(source)) {
    assert(
      spec.startsWith("node:") ||
        spec === "../../pkg/@eserstack/codebase/changelog-text.ts",
      `unexpected import ${spec}`,
    );
  }
});

// The release-notes job holds contents: write. It must not resolve and run
// registry packages, and must not leave the token in .git/config.
Deno.test("release-notes job installs nothing and does not persist credentials", async () => {
  const workflow = await Deno.readTextFile(
    path.join(repoRoot, ".github/workflows/build.yml"),
  );
  const start = workflow.indexOf("\n  release-notes:\n");
  assert(start !== -1, "release-notes job not found");
  const rest = workflow.slice(start + 1);
  const next = rest.search(/\n {2}[a-z0-9-]+:\n/);
  const job = next === -1 ? rest : rest.slice(0, next);

  assert(!/\b(npm|pnpm|yarn|bun)\s+(install|add|i|ci)\b/.test(job));
  assert(!/\bnpx\b/.test(job));
  assert(/persist-credentials:\s*false/.test(job));
  assert(job.includes("etc/scripts/release-notes-from-changelog.ts"));
});

Deno.test("parseChangelogText still reads both heading styles", () => {
  const entries = parseChangelogText(
    "# Changelog\n\n## 2.0.0 - 2026-01-02\n\n- b\n\n## [v1.0.0] - 2026-01-01\n\n- a\n",
  );
  assertEquals(entries.map((e) => e.tag), ["v2.0.0", "v1.0.0"]);
});
