// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as semver from "@std/semver";
import {
  compareSemanticVersions,
  compareTextVersions,
  maxVersion,
} from "./versions.ts";

// =============================================================================
// compareSemanticVersions
// =============================================================================

Deno.test("compareSemanticVersions — target > current returns true", () => {
  const current = semver.parse("4.1.22");
  const target = semver.parse("4.1.23");

  assert.assertEquals(compareSemanticVersions(current, target), true);
});

Deno.test("compareSemanticVersions — target < current returns false", () => {
  const current = semver.parse("4.1.23");
  const target = semver.parse("4.1.22");

  assert.assertEquals(compareSemanticVersions(current, target), false);
});

Deno.test("compareSemanticVersions — target == current returns false", () => {
  const current = semver.parse("4.1.22");
  const target = semver.parse("4.1.22");

  assert.assertEquals(compareSemanticVersions(current, target), false);
});

Deno.test("compareSemanticVersions — range satisfied returns true", () => {
  const current = semver.parse("4.1.22");
  const target = semver.parseRange("^4.1.0");

  assert.assertEquals(compareSemanticVersions(current, target), true);
});

Deno.test("compareSemanticVersions — range not satisfied returns false", () => {
  const current = semver.parse("3.9.0");
  const target = semver.parseRange("^4.1.0");

  assert.assertEquals(compareSemanticVersions(current, target), false);
});

Deno.test("compareSemanticVersions — major bump returns true", () => {
  const current = semver.parse("4.9.9");
  const target = semver.parse("5.0.0");

  assert.assertEquals(compareSemanticVersions(current, target), true);
});

Deno.test("compareSemanticVersions — minor bump returns true", () => {
  const current = semver.parse("4.1.99");
  const target = semver.parse("4.2.0");

  assert.assertEquals(compareSemanticVersions(current, target), true);
});

// =============================================================================
// compareTextVersions
// =============================================================================

Deno.test("compareTextVersions — target > current returns true", () => {
  assert.assertEquals(compareTextVersions("4.1.22", "4.1.23"), true);
});

Deno.test("compareTextVersions — target < current returns false", () => {
  assert.assertEquals(compareTextVersions("4.1.23", "4.1.22"), false);
});

Deno.test("compareTextVersions — equal versions returns false", () => {
  assert.assertEquals(compareTextVersions("4.1.22", "4.1.22"), false);
});

Deno.test("compareTextVersions — major bump returns true", () => {
  assert.assertEquals(compareTextVersions("4.9.9", "5.0.0"), true);
});

Deno.test("compareTextVersions — minor bump returns true", () => {
  assert.assertEquals(compareTextVersions("4.1.99", "4.2.0"), true);
});

Deno.test("compareTextVersions — patch bump returns true", () => {
  assert.assertEquals(compareTextVersions("4.1.22", "4.1.23"), true);
});

Deno.test("compareTextVersions — 0.x versions work correctly", () => {
  assert.assertEquals(compareTextVersions("0.1.0", "0.2.0"), true);
  assert.assertEquals(compareTextVersions("0.2.0", "0.1.0"), false);
});

Deno.test("compareTextVersions — large version numbers", () => {
  assert.assertEquals(compareTextVersions("10.20.30", "10.20.31"), true);
  assert.assertEquals(compareTextVersions("10.20.31", "10.20.30"), false);
});

// =============================================================================
// maxVersion
// =============================================================================

Deno.test("maxVersion — major + minor returns major", () => {
  assert.assertEquals(maxVersion("major", "minor"), "major");
});

Deno.test("maxVersion — minor + major returns major", () => {
  assert.assertEquals(maxVersion("minor", "major"), "major");
});

Deno.test("maxVersion — minor + patch returns minor", () => {
  assert.assertEquals(maxVersion("minor", "patch"), "minor");
});

Deno.test("maxVersion — patch + minor returns minor", () => {
  assert.assertEquals(maxVersion("patch", "minor"), "minor");
});

Deno.test("maxVersion — patch + patch returns patch", () => {
  assert.assertEquals(maxVersion("patch", "patch"), "patch");
});

Deno.test("maxVersion — major + major returns major", () => {
  assert.assertEquals(maxVersion("major", "major"), "major");
});
