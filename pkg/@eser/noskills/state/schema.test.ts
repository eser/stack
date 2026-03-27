// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import * as schema from "./schema.ts";

// =============================================================================
// createInitialState
// =============================================================================

describe("createInitialState", () => {
  it("returns IDLE phase with empty arrays and zero iteration", () => {
    const state = schema.createInitialState();

    assertEquals(state.phase, "IDLE");
    assertEquals(state.version, "0.1.0");
    assertEquals(state.spec, null);
    assertEquals(state.branch, null);
    assertEquals(state.discovery.answers.length, 0);
    assertEquals(state.discovery.completed, false);
    assertEquals(state.specState.path, null);
    assertEquals(state.specState.status, "none");
    assertEquals(state.execution.iteration, 0);
    assertEquals(state.execution.lastProgress, null);
    assertEquals(state.decisions.length, 0);
  });
});

// =============================================================================
// createInitialManifest
// =============================================================================

describe("createInitialManifest", () => {
  it("stores provided concerns, tools, and project traits", () => {
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

    assertEquals(config.concerns.length, 2);
    assertEquals(config.concerns[0], "open-source");
    assertEquals(config.tools.length, 2);
    assertEquals(config.providers.length, 2);
    assertEquals(config.project.languages.length, 2);
    assertEquals(config.project.testRunner, "deno");
  });
});
