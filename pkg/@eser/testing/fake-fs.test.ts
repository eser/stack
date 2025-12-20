// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import { createFakeFs } from "./fake-fs.ts";

Deno.test("createFakeFs should read text files", async () => {
  const fs = createFakeFs({
    "/app/config.json": '{"port": 3000}',
    "/app/readme.txt": "Hello World",
  });

  const config = await fs.readTextFile("/app/config.json");
  assert.assertEquals(config, '{"port": 3000}');

  const readme = await fs.readTextFile("/app/readme.txt");
  assert.assertEquals(readme, "Hello World");
});

Deno.test("createFakeFs should throw NotFound for missing files", async () => {
  const fs = createFakeFs({
    "/app/config.json": '{"port": 3000}',
  });

  await assert.assertRejects(
    () => fs.readTextFile("/app/missing.json"),
    Deno.errors.NotFound,
  );
});

Deno.test("createFakeFs should read files as bytes", async () => {
  const fs = createFakeFs({
    "/app/data.txt": "test data",
  });

  const bytes = await fs.readFile("/app/data.txt");
  const text = new TextDecoder().decode(bytes);

  assert.assertEquals(text, "test data");
});

Deno.test("createFakeFs should walk directory", async () => {
  const fs = createFakeFs({
    "/app/src/main.ts": "console.log('main')",
    "/app/src/utils.ts": "export const add = (a, b) => a + b",
    "/app/tests/main.test.ts": "test code",
    "/other/file.txt": "other",
  });

  const entries: string[] = [];
  for await (const entry of fs.walk("/app/src")) {
    entries.push(entry.path);
  }

  assert.assertEquals(entries.length, 2);
  assert.assertArrayIncludes(entries, [
    "/app/src/main.ts",
    "/app/src/utils.ts",
  ]);
});

Deno.test("createFakeFs should identify directories", () => {
  const fs = createFakeFs({
    "/app/src/main.ts": "code",
    "/app/src/utils/helper.ts": "helper",
  });

  assert.assertEquals(fs.isDirectory("/app"), true);
  assert.assertEquals(fs.isDirectory("/app/src"), true);
  assert.assertEquals(fs.isDirectory("/app/src/utils"), true);
  assert.assertEquals(fs.isDirectory("/app/src/main.ts"), false);
  assert.assertEquals(fs.isDirectory("/nonexistent"), false);
});

Deno.test("createFakeFs should check path existence", () => {
  const fs = createFakeFs({
    "/app/config.json": '{"port": 3000}',
    "/app/src/main.ts": "code",
  });

  assert.assertEquals(fs.exists("/app/config.json"), true);
  assert.assertEquals(fs.exists("/app/src/main.ts"), true);
  assert.assertEquals(fs.exists("/app"), true);
  assert.assertEquals(fs.exists("/app/src"), true);
  assert.assertEquals(fs.exists("/missing"), false);
});

Deno.test("createFakeFs walk should return proper entry properties", async () => {
  const fs = createFakeFs({
    "/app/index.ts": "code",
  });

  for await (const entry of fs.walk("/app")) {
    assert.assertEquals(entry.path, "/app/index.ts");
    assert.assertEquals(entry.name, "index.ts");
    assert.assertEquals(entry.isFile, true);
    assert.assertEquals(entry.isDirectory, false);
  }
});

Deno.test("createFakeFs should handle trailing slashes in directories", () => {
  const fs = createFakeFs({
    "/app/src/main.ts": "code",
  });

  assert.assertEquals(fs.isDirectory("/app/"), true);
  assert.assertEquals(fs.isDirectory("/app/src/"), true);
  assert.assertEquals(fs.exists("/app/"), true);
});

Deno.test("createFakeFs should handle empty files", async () => {
  const fs = createFakeFs({
    "/app/.gitkeep": "",
    "/app/empty.txt": "",
  });

  const gitkeep = await fs.readTextFile("/app/.gitkeep");
  assert.assertEquals(gitkeep, "");

  const empty = await fs.readTextFile("/app/empty.txt");
  assert.assertEquals(empty, "");
});
