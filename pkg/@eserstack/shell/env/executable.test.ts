// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { assert, assertEquals, assertFalse } from "@std/assert";

import { hasExecutable, resolveExecutable } from "./executable.ts";

Deno.test("resolves a real executable on PATH", async () => {
  const resolved = await resolveExecutable("sh");

  assert(resolved !== null, "sh was not found on PATH");
  assert(resolved.endsWith("/sh"), `unexpected path: ${resolved}`);
});

Deno.test("reports absence rather than throwing", async () => {
  assertEquals(await resolveExecutable("definitely-not-installed-xyzzy"), null);
  assertFalse(await hasExecutable("definitely-not-installed-xyzzy"));
});

// A non-executable file with the right name must not be "found". Reporting it
// moves the failure to spawn time, with an error about permissions rather than
// about the missing tool — the confusion PATH lookup exists to prevent.
Deno.test("a non-executable file is not resolved", async () => {
  const dir = await Deno.makeTempDir({ prefix: "eser-exe-" });

  await Deno.writeTextFile(`${dir}/inert`, "#!/bin/sh\nexit 0\n");
  await Deno.chmod(`${dir}/inert`, 0o644);

  const previous = Deno.env.get("PATH") ?? "";

  Deno.env.set("PATH", `${dir}:${previous}`);

  try {
    assertEquals(await resolveExecutable("inert"), null);
  } finally {
    Deno.env.set("PATH", previous);
    await Deno.remove(dir, { recursive: true });
  }
});

// Resolution must never leave a PATH directory: a name is a NAME, not a path.
//
// Unlike the plugin lookup — where the `eser-` prefix means a `..` can never be
// its own path segment — nothing else stops traversal here. `<pathdir>/../x`
// really does resolve to a sibling of the PATH entry, so the guard is
// load-bearing and this test plants a reachable target to prove it.
Deno.test("a path-like name cannot escape a PATH directory", async () => {
  const base = await Deno.makeTempDir({ prefix: "eser-exe-" });
  const bin = `${base}/bin`;

  await Deno.mkdir(bin);

  // Executable, and exactly one `..` above the PATH entry.
  await Deno.writeTextFile(`${base}/victim`, "#!/bin/sh\nexit 0\n");
  await Deno.chmod(`${base}/victim`, 0o755);

  const previous = Deno.env.get("PATH") ?? "";

  Deno.env.set("PATH", bin);

  try {
    assertEquals(
      await resolveExecutable("../victim"),
      null,
      "resolution escaped the PATH directory",
    );

    for (const name of ["a/b", "..", "a\\b"]) {
      assertEquals(await resolveExecutable(name), null, `${name} resolved`);
    }
  } finally {
    Deno.env.set("PATH", previous);
    await Deno.remove(base, { recursive: true });
  }
});
