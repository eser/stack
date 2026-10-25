// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";

import * as executable from "./executable.ts";

nodeTest.test("resolves a real executable on PATH", async () => {
  const resolved = await executable.resolveExecutable("sh");

  assert.assert(resolved !== null, "sh was not found on PATH");
  assert.assert(resolved.endsWith("/sh"), `unexpected path: ${resolved}`);
});

nodeTest.test("reports absence rather than throwing", async () => {
  assert.assertEquals(
    await executable.resolveExecutable("definitely-not-installed-xyzzy"),
    null,
  );
  assert.assertFalse(
    await executable.hasExecutable("definitely-not-installed-xyzzy"),
  );
});

// A non-executable file with the right name must not be "found". Reporting it
// moves the failure to spawn time, with an error about permissions rather than
// about the missing tool — the confusion PATH lookup exists to prevent.
nodeTest.test("a non-executable file is not resolved", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "eser-exe-"));

  await fs.writeFile(`${dir}/inert`, "#!/bin/sh\nexit 0\n");
  await fs.chmod(`${dir}/inert`, 0o644);

  const previous = process.env["PATH"] ?? "";

  process.env["PATH"] = `${dir}:${previous}`;

  try {
    assert.assertEquals(await executable.resolveExecutable("inert"), null);
  } finally {
    process.env["PATH"] = previous;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

// Resolution must never leave a PATH directory: a name is a NAME, not a path.
//
// Unlike the plugin lookup — where the `eser-` prefix means a `..` can never be
// its own path segment — nothing else stops traversal here. `<pathdir>/../x`
// really does resolve to a sibling of the PATH entry, so the guard is
// load-bearing and this test plants a reachable target to prove it.
nodeTest.test("a path-like name cannot escape a PATH directory", async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "eser-exe-"));
  const bin = `${base}/bin`;

  await fs.mkdir(bin);

  // Executable, and exactly one `..` above the PATH entry.
  await fs.writeFile(`${base}/victim`, "#!/bin/sh\nexit 0\n");
  await fs.chmod(`${base}/victim`, 0o755);

  const previous = process.env["PATH"] ?? "";

  process.env["PATH"] = bin;

  try {
    assert.assertEquals(
      await executable.resolveExecutable("../victim"),
      null,
      "resolution escaped the PATH directory",
    );

    const names = ["a/b", "..", "a\\b"];
    const resolved = await Promise.all(
      names.map((name) => executable.resolveExecutable(name)),
    );

    for (const [i, name] of names.entries()) {
      assert.assertEquals(resolved[i], null, `${name} resolved`);
    }
  } finally {
    process.env["PATH"] = previous;
    await fs.rm(base, { recursive: true, force: true });
  }
});
