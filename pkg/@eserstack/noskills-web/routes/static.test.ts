// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as staticFiles from "./static.ts";

Deno.test("serveStatic answers a binary file byte for byte", async () => {
  const dir = await runtime.fs.makeTempDir();
  // A PNG signature, then bytes that are not valid UTF-8.
  const bytes = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff, 0xfe, 0x80,
  ]);
  await runtime.fs.writeFile(runtime.path.join(dir, "icon.png"), bytes);

  const res = await staticFiles.serveStatic(dir, "icon.png");

  assert.assertEquals(res.status, 200);
  assert.assertEquals(res.headers.get("content-type"), "image/png");
  assert.assertEquals(new Uint8Array(await res.arrayBuffer()), bytes);
});

Deno.test("serveStatic answers 404 for a path outside its directory", async () => {
  const base = await runtime.fs.makeTempDir();
  const dir = runtime.path.join(base, "static");
  await runtime.fs.mkdir(dir);
  await runtime.fs.writeTextFile(runtime.path.join(base, "secret.txt"), "no");

  const res = await staticFiles.serveStatic(dir, "../secret.txt");
  await res.body?.cancel();

  assert.assertEquals(res.status, 404);
});

Deno.test("serveStatic answers 404 without a directory or a file", async () => {
  const dir = await runtime.fs.makeTempDir();

  const missing = await staticFiles.serveStatic(dir, "missing.js");
  await missing.body?.cancel();
  const noDir = await staticFiles.serveStatic(null, "client.js");
  await noDir.body?.cancel();

  assert.assertEquals(missing.status, 404);
  assert.assertEquals(noDir.status, 404);
});
