// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as xdg from "./xdg.ts";

Deno.test("getXdgCacheHome returns non-empty string", () => {
  const result = xdg.getXdgCacheHome();

  assert.assertExists(result);
  assert.assert(result.length > 0, "Cache home should not be empty");
});

Deno.test("getXdgDataHome returns non-empty string", () => {
  const result = xdg.getXdgDataHome();

  assert.assertExists(result);
  assert.assert(result.length > 0, "Data home should not be empty");
});

Deno.test("getXdgConfigHome returns non-empty string", () => {
  const result = xdg.getXdgConfigHome();

  assert.assertExists(result);
  assert.assert(result.length > 0, "Config home should not be empty");
});

Deno.test("getAppCacheDir returns path with app name", () => {
  const result = xdg.getAppCacheDir({ name: "test-app" });

  assert.assertExists(result);
  assert.assert(
    result.includes("test-app"),
    "App cache dir should include app name",
  );
});

Deno.test("getAppCacheDir with org returns path with org and app name", () => {
  const result = xdg.getAppCacheDir({ name: "test-app", org: "test-org" });

  assert.assertExists(result);
  assert.assert(
    result.includes("test-org"),
    "App cache dir should include org name",
  );
  assert.assert(
    result.includes("test-app"),
    "App cache dir should include app name",
  );
});

Deno.test("getVersionedCachePath adds version prefix", () => {
  const result = xdg.getVersionedCachePath(
    { name: "test-app" },
    "1.0.0",
    "binary",
  );

  assert.assertExists(result);
  assert.assert(
    result.includes("v1.0.0"),
    "Should normalize version to have v prefix",
  );
  assert.assert(result.includes("binary"), "Should include item name");
});

Deno.test("getVersionedCachePath preserves existing v prefix", () => {
  const result = xdg.getVersionedCachePath(
    { name: "test-app" },
    "v2.0.0",
    "data",
  );

  assert.assertExists(result);
  assert.assert(
    result.includes("v2.0.0"),
    "Should preserve existing v prefix",
  );
  // Should not have double v prefix
  assert.assert(
    !result.includes("vv2.0.0"),
    "Should not have double v prefix",
  );
});
