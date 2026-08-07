// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The release asset name is a contract between three files that never import
 * each other.
 *
 * `compile.ts` writes the archives, `etc/scripts/install.sh` downloads them on
 * POSIX, and `etc/scripts/install.ps1` downloads them on Windows. Nothing
 * type-checks across that boundary, and when it drifted the failure was a 404
 * at install time on a user's machine — the last thing anyone runs and the
 * first thing they hit.
 *
 * @module
 */

import { assertEquals, assertStringIncludes } from "@std/assert";

// Resolved from this file's own URL rather than via @std/path, which the cli
// package does not depend on.
const repoRoot = new URL("../../../../", import.meta.url);

const read = (relative: string): Promise<string> =>
  Deno.readTextFile(new URL(relative, repoRoot));

Deno.test("compile.ts and both installers agree on the asset name", async () => {
  const [compile, sh, ps1] = await Promise.all([
    read("pkg/@eserstack/cli/scripts/compile.ts"),
    read("etc/scripts/install.sh"),
    read("etc/scripts/install.ps1"),
  ]);

  // <binary>-v<version>-<triple>. Asserted on the template rather than a built
  // artifact so this runs without a release.
  assertStringIncludes(compile, "`${binary.name}-v${version}-${target}`");
  assertStringIncludes(compile, "`${goBinary.name}-v${version}-${target}`");

  // TAG carries its own leading "v" (it comes straight from the release tag),
  // so the shell form has no literal "v" of its own.
  assertStringIncludes(sh, 'ARCHIVE="${BINARY}-${TAG}-${TARGET}.tar.gz"');

  // Version is stripped of the "v" when parsed, so PowerShell re-adds it.
  assertStringIncludes(ps1, '"$Product-v$Version-');

  // Checksums live in one file for the whole family; `checksums.txt` was the
  // GoReleaser name and no longer exists.
  assertStringIncludes(sh, "SHA256SUMS.txt");
  assertStringIncludes(ps1, "SHA256SUMS.txt");
  assertEquals(sh.includes("checksums.txt"), false);
  assertEquals(ps1.includes("checksums.txt"), false);
});

// Every product the build emits must be installable, and vice versa. A binary
// added to one list and forgotten in the other is how `noskills-server` ended
// up shipped-but-uninstallable.
Deno.test("every built binary is accepted by the installer", async () => {
  const [compile, sh, ps1] = await Promise.all([
    read("pkg/@eserstack/cli/scripts/compile.ts"),
    read("etc/scripts/install.sh"),
    read("etc/scripts/install.ps1"),
  ]);

  const built = [
    ...compile.matchAll(/name: "([a-z-]+)",\s*\n?\s*(?:entry|main):/g),
  ]
    .map((m) => m[1]!)
    .sort();

  assertEquals(
    built,
    ["eser", "laroux", "noskills", "noskills-server"],
    "BINARIES/GO_BINARIES changed; update the installers to match",
  );

  // Parsed from the accept-lists, not searched for in the whole file: every
  // product name also appears in prose, so a substring check passes even when
  // the product has been dropped from the list that matters.
  const shAccepts = sh.match(/^\s*(eser\|[a-z|-]+)\)\s*;;/m)?.[1]?.split("|") ??
    [];
  const ps1Accepts =
    ps1.match(/ValidateSet\(([^)]*)\)/)?.[1]?.match(/'([a-z-]+)'/g)?.map((q) =>
      q.replaceAll("'", "")
    ) ?? [];

  assertEquals([...shAccepts].sort(), built, "install.sh accept-list drifted");
  assertEquals(
    [...ps1Accepts].sort(),
    built,
    "install.ps1 ValidateSet drifted",
  );
});
