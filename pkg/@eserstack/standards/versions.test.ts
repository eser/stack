// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as semver from "@std/semver";
import * as versions from "./versions.ts";

// =============================================================================
// compareSemanticVersions
// =============================================================================

nodeTest.test("compareSemanticVersions — target > current returns true", () => {
  const current = semver.parse("4.1.22");
  const target = semver.parse("4.1.23");

  assert.assertEquals(versions.compareSemanticVersions(current, target), true);
});

nodeTest.test(
  "compareSemanticVersions — target < current returns false",
  () => {
    const current = semver.parse("4.1.23");
    const target = semver.parse("4.1.22");

    assert.assertEquals(
      versions.compareSemanticVersions(current, target),
      false,
    );
  },
);

nodeTest.test(
  "compareSemanticVersions — target == current returns false",
  () => {
    const current = semver.parse("4.1.22");
    const target = semver.parse("4.1.22");

    assert.assertEquals(
      versions.compareSemanticVersions(current, target),
      false,
    );
  },
);

nodeTest.test("compareSemanticVersions — range satisfied returns true", () => {
  const current = semver.parse("4.1.22");
  const target = semver.parseRange("^4.1.0");

  assert.assertEquals(versions.compareSemanticVersions(current, target), true);
});

nodeTest.test(
  "compareSemanticVersions — range not satisfied returns false",
  () => {
    const current = semver.parse("3.9.0");
    const target = semver.parseRange("^4.1.0");

    assert.assertEquals(
      versions.compareSemanticVersions(current, target),
      false,
    );
  },
);

nodeTest.test("compareSemanticVersions — major bump returns true", () => {
  const current = semver.parse("4.9.9");
  const target = semver.parse("5.0.0");

  assert.assertEquals(versions.compareSemanticVersions(current, target), true);
});

nodeTest.test("compareSemanticVersions — minor bump returns true", () => {
  const current = semver.parse("4.1.99");
  const target = semver.parse("4.2.0");

  assert.assertEquals(versions.compareSemanticVersions(current, target), true);
});

// =============================================================================
// compareTextVersions
// =============================================================================

nodeTest.test("compareTextVersions — target > current returns true", () => {
  assert.assertEquals(versions.compareTextVersions("4.1.22", "4.1.23"), true);
});

nodeTest.test("compareTextVersions — target < current returns false", () => {
  assert.assertEquals(versions.compareTextVersions("4.1.23", "4.1.22"), false);
});

nodeTest.test("compareTextVersions — equal versions returns false", () => {
  assert.assertEquals(versions.compareTextVersions("4.1.22", "4.1.22"), false);
});

nodeTest.test("compareTextVersions — major bump returns true", () => {
  assert.assertEquals(versions.compareTextVersions("4.9.9", "5.0.0"), true);
});

nodeTest.test("compareTextVersions — minor bump returns true", () => {
  assert.assertEquals(versions.compareTextVersions("4.1.99", "4.2.0"), true);
});

nodeTest.test("compareTextVersions — patch bump returns true", () => {
  assert.assertEquals(versions.compareTextVersions("4.1.22", "4.1.23"), true);
});

nodeTest.test("compareTextVersions — 0.x versions work correctly", () => {
  assert.assertEquals(versions.compareTextVersions("0.1.0", "0.2.0"), true);
  assert.assertEquals(versions.compareTextVersions("0.2.0", "0.1.0"), false);
});

nodeTest.test("compareTextVersions — large version numbers", () => {
  assert.assertEquals(
    versions.compareTextVersions("10.20.30", "10.20.31"),
    true,
  );
  assert.assertEquals(
    versions.compareTextVersions("10.20.31", "10.20.30"),
    false,
  );
});

// =============================================================================
// maxVersion
// =============================================================================

nodeTest.test("maxVersion — major + minor returns major", () => {
  assert.assertEquals(versions.maxVersion("major", "minor"), "major");
});

nodeTest.test("maxVersion — minor + major returns major", () => {
  assert.assertEquals(versions.maxVersion("minor", "major"), "major");
});

nodeTest.test("maxVersion — minor + patch returns minor", () => {
  assert.assertEquals(versions.maxVersion("minor", "patch"), "minor");
});

nodeTest.test("maxVersion — patch + minor returns minor", () => {
  assert.assertEquals(versions.maxVersion("patch", "minor"), "minor");
});

nodeTest.test("maxVersion — patch + patch returns patch", () => {
  assert.assertEquals(versions.maxVersion("patch", "patch"), "patch");
});

nodeTest.test("maxVersion — major + major returns major", () => {
  assert.assertEquals(versions.maxVersion("major", "major"), "major");
});
