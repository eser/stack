// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as shared from "./shared.ts";

Deno.test("getPlatform returns valid platform", () => {
  const result = shared.getPlatform();

  assert.assert(
    result === "darwin" || result === "linux" || result === "windows",
    `Expected platform to be darwin, linux, or windows, got: ${result}`,
  );
});

Deno.test("getArch returns valid architecture", () => {
  const result = shared.getArch();

  assert.assert(
    result === "amd64" || result === "arm64",
    `Expected arch to be amd64 or arm64, got: ${result}`,
  );
});

Deno.test("getHomedir returns non-empty string", () => {
  const result = shared.getHomedir();

  assert.assertExists(result);
  assert.assert(result.length > 0, "Home directory should not be empty");
});

Deno.test("getTmpdir returns non-empty string", () => {
  const result = shared.getTmpdir();

  assert.assertExists(result);
  assert.assert(result.length > 0, "Temp directory should not be empty");
});

Deno.test("getPlatformInfo returns complete info", () => {
  const result = shared.getPlatformInfo();

  assert.assertExists(result.platform);
  assert.assertExists(result.arch);
  assert.assertExists(result.homedir);
  assert.assertExists(result.tmpdir);

  // Verify types match expected values
  assert.assert(
    result.platform === "darwin" || result.platform === "linux" ||
      result.platform === "windows",
  );
  assert.assert(result.arch === "amd64" || result.arch === "arm64");
});

Deno.test("getPlatformInfo platform matches getPlatform", () => {
  const info = shared.getPlatformInfo();
  const directPlatform = shared.getPlatform();

  assert.assertEquals(info.platform, directPlatform);
});

Deno.test("getPlatformInfo arch matches getArch", () => {
  const info = shared.getPlatformInfo();
  const directArch = shared.getArch();

  assert.assertEquals(info.arch, directArch);
});

Deno.test("getPlatformInfo homedir matches getHomedir", () => {
  const info = shared.getPlatformInfo();
  const directHomedir = shared.getHomedir();

  assert.assertEquals(info.homedir, directHomedir);
});

Deno.test("getPlatformInfo tmpdir matches getTmpdir", () => {
  const info = shared.getPlatformInfo();
  const directTmpdir = shared.getTmpdir();

  assert.assertEquals(info.tmpdir, directTmpdir);
});
