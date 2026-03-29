// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Tests for `noskills purge` command.
 *
 * The purge command heavily depends on filesystem and TUI at runtime,
 * so these tests focus on structural/smoke checks and the pure logic
 * path that does not touch the filesystem (agent mode without --force).
 */

import { describe, it } from "@std/testing/bdd";
import * as assert from "@std/assert";
import * as results from "@eser/primitives/results";
import { main } from "./purge.ts";

// =============================================================================
// Module structure
// =============================================================================

describe("noskills purge: module structure", () => {
  it("exports main as a function", () => {
    assert.assertExists(main);
    assert.assertEquals(typeof main, "function");
  });
});

// =============================================================================
// Agent mode without --force
// =============================================================================

describe("noskills purge: agent mode without --force", () => {
  it("returns exit code 1", async () => {
    const result = await main(["--agent"]);

    assert.assertEquals(results.isFail(result), true);

    if (results.isFail(result)) {
      assert.assertEquals(result.error.exitCode, 1);
    }
  });

  it("fails even with extra args alongside --agent", async () => {
    const result = await main(["--agent", "--some-flag"]);

    assert.assertEquals(results.isFail(result), true);

    if (results.isFail(result)) {
      assert.assertEquals(result.error.exitCode, 1);
    }
  });
});

// =============================================================================
// Agent mode with --force (filesystem-dependent, shallow check)
// =============================================================================

describe("noskills purge: agent mode with --force", () => {
  it("returns ok result (succeeds even if nothing to purge)", async () => {
    // --force + --agent runs deleteAllCategories which touches fs.
    // SKIP if live noskills state exists — this test must NOT nuke real project state.
    const { existsSync } = await import("node:fs");
    if (existsSync(".eser/.state/state.json")) {
      return; // Live project — skip destructive test
    }

    const result = await main(["--agent", "--force"]);

    assert.assertEquals(results.isOk(result), true);
  });
});
