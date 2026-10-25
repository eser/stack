// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as schema from "./schema.ts";

// =============================================================================
// createInitialState
// =============================================================================

bdd.describe("createInitialState", () => {
  bdd.it("returns IDLE phase with empty arrays and zero iteration", () => {
    const state = schema.createInitialState();

    assert.assertEquals(state.phase, "IDLE");
    assert.assertEquals(state.version, "0.1.0");
    assert.assertEquals(state.spec, null);
    assert.assertEquals(state.branch, null);
    assert.assertEquals(state.discovery.answers.length, 0);
    assert.assertEquals(state.discovery.completed, false);
    assert.assertEquals(state.specState.path, null);
    assert.assertEquals(state.specState.status, "none");
    assert.assertEquals(state.execution.iteration, 0);
    assert.assertEquals(state.execution.lastProgress, null);
    assert.assertEquals(state.decisions.length, 0);
    assert.assertEquals(state.lastCalledAt, null);
  });
});

// =============================================================================
// createInitialManifest
// =============================================================================

bdd.describe("createInitialManifest", () => {
  bdd.it("stores provided concerns, tools, and project traits", () => {
    const config = schema.createInitialManifest(
      ["open-source", "long-lived"],
      ["claude-code", "cursor"],
      ["anthropic", "openai"],
      {
        languages: ["typescript", "go"],
        frameworks: ["react"],
        ci: ["github-actions"],
        testRunner: "deno",
      },
    );

    assert.assertEquals(config.concerns.length, 2);
    assert.assertEquals(config.concerns[0], "open-source");
    assert.assertEquals(config.tools.length, 2);
    assert.assertEquals(config.providers.length, 2);
    assert.assertEquals(config.project.languages.length, 2);
    assert.assertEquals(config.project.testRunner, "deno");
    assert.assertEquals(config.maxIterationsBeforeRestart, 15);
  });
});
