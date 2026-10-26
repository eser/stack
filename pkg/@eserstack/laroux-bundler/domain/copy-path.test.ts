// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as copyPath from "./copy-path.ts";

/** Run fn in a fresh temp directory and remove it afterwards. */
async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await runtime.fs.makeTempDir({ prefix: "laroux-copy-" });
  try {
    await fn(dir);
  } finally {
    await runtime.fs.remove(dir, { recursive: true });
  }
}

nodeTest.test(
  "copyPath copies a directory tree and overwrites existing files",
  async () => {
    await withTempDir(async (dir) => {
      const src = runtime.path.join(dir, "public");
      const dest = runtime.path.join(dir, "dist");
      await runtime.fs.ensureDir(runtime.path.join(src, "images/icons"));
      await runtime.fs.writeTextFile(
        runtime.path.join(src, "robots.txt"),
        "new",
      );
      await runtime.fs.writeTextFile(
        runtime.path.join(src, "images/icons/logo.svg"),
        "<svg/>",
      );
      await runtime.fs.ensureDir(dest);
      await runtime.fs.writeTextFile(
        runtime.path.join(dest, "robots.txt"),
        "old",
      );

      await copyPath.copyPath(src, dest);

      assert.assertEquals(
        await runtime.fs.readTextFile(runtime.path.join(dest, "robots.txt")),
        "new",
      );
      assert.assertEquals(
        await runtime.fs.readTextFile(
          runtime.path.join(dest, "images/icons/logo.svg"),
        ),
        "<svg/>",
      );
    });
  },
);

nodeTest.test("copyPath copies a file into a new directory", async () => {
  await withTempDir(async (dir) => {
    const src = runtime.path.join(dir, "messages.json");
    const dest = runtime.path.join(dir, "server/app/messages.json");
    await runtime.fs.writeTextFile(src, "{}");

    await copyPath.copyPath(src, dest);

    assert.assertEquals(await runtime.fs.readTextFile(dest), "{}");
  });
});

nodeTest.test("copyPath fails to copy a file onto a directory", async () => {
  await withTempDir(async (dir) => {
    const src = runtime.path.join(dir, "client");
    const dest = runtime.path.join(dir, "dist/client");
    await runtime.fs.writeTextFile(src, "not a directory");
    await runtime.fs.ensureDir(dest);

    await assert.assertRejects(() => copyPath.copyPath(src, dest));
  });
});
