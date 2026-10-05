// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "@std/testing/bdd";
import * as assert from "@std/assert";
import * as schema from "../state/schema.ts";
import * as machine from "../state/machine.ts";
import * as persistence from "../state/persistence.ts";
import * as dashboardState from "./state.ts";
import { runtime } from "@eserstack/standards/cross-runtime";

// =============================================================================
// Helpers
// =============================================================================

let tempCounter = 0;
const makeTempDir = async (): Promise<string> => {
  const base = await runtime.fs.makeTempDir();
  const dir = `${base}/noskills-confidence-test-${tempCounter++}`;
  await persistence.scaffoldEserDir(dir);
  return dir;
};

const createExecutingSpec = (): schema.StateFile => {
  let state = schema.createInitialState();
  state = machine.startSpec(state, "test", "spec/test", "test");
  state = machine.completeDiscovery(state);
  state = machine.approveDiscoveryReview(state);
  state = machine.approveSpec(state);
  return machine.startExecution(state);
};

// =============================================================================
// clampConfidence
// =============================================================================

bdd.describe("clampConfidence", () => {
  bdd.it("clamps to 1-10 range", () => {
    assert.assertEquals(machine.clampConfidence(0), 1);
    assert.assertEquals(machine.clampConfidence(-5), 1);
    assert.assertEquals(machine.clampConfidence(11), 10);
    assert.assertEquals(machine.clampConfidence(15), 10);
    assert.assertEquals(machine.clampConfidence(5), 5);
    assert.assertEquals(machine.clampConfidence(1), 1);
    assert.assertEquals(machine.clampConfidence(10), 10);
  });

  bdd.it("rounds to nearest integer", () => {
    assert.assertEquals(machine.clampConfidence(7.3), 7);
    assert.assertEquals(machine.clampConfidence(7.8), 8);
  });
});

// =============================================================================
// addConfidenceFinding
// =============================================================================

bdd.describe("addConfidenceFinding", () => {
  bdd.it("stores finding with clamped confidence", () => {
    let state = createExecutingSpec();
    state = machine.addConfidenceFinding(
      state,
      "Upload handler lacks size validation",
      9,
      "Read upload.ts:45 — no size check",
    );

    const findings = state.execution.confidenceFindings ?? [];
    assert.assertEquals(findings.length, 1);
    assert.assertEquals(
      findings[0]!.finding,
      "Upload handler lacks size validation",
    );
    assert.assertEquals(findings[0]!.confidence, 9);
    assert.assertEquals(
      findings[0]!.basis,
      "Read upload.ts:45 — no size check",
    );
  });

  bdd.it("clamps out-of-range confidence", () => {
    let state = createExecutingSpec();
    state = machine.addConfidenceFinding(state, "Low", 0, "guess");
    state = machine.addConfidenceFinding(
      state,
      "High",
      15,
      "certain based on direct code reading",
    );

    const findings = state.execution.confidenceFindings ?? [];
    assert.assertEquals(findings[0]!.confidence, 1); // clamped from 0
    assert.assertEquals(findings[1]!.confidence, 10); // clamped from 15
  });

  bdd.it("appends multiple findings", () => {
    let state = createExecutingSpec();
    state = machine.addConfidenceFinding(
      state,
      "F1",
      9,
      "verified by reading the source code directly",
    );
    state = machine.addConfidenceFinding(state, "F2", 4, "guessing");
    state = machine.addConfidenceFinding(
      state,
      "F3",
      7,
      "strong evidence from code analysis",
    );

    assert.assertEquals((state.execution.confidenceFindings ?? []).length, 3);
  });
});

// =============================================================================
// getLowConfidenceFindings
// =============================================================================

bdd.describe("getLowConfidenceFindings", () => {
  bdd.it("returns findings below threshold", () => {
    let state = createExecutingSpec();
    state = machine.addConfidenceFinding(
      state,
      "Verified",
      9,
      "read code and confirmed behavior",
    );
    state = machine.addConfidenceFinding(state, "Guess", 3, "inference");
    state = machine.addConfidenceFinding(state, "Medium", 6, "some evidence");

    const low = machine.getLowConfidenceFindings(state);
    assert.assertEquals(low.length, 1);
    assert.assertEquals(low[0]!.finding, "Guess");
  });

  bdd.it("custom threshold", () => {
    let state = createExecutingSpec();
    state = machine.addConfidenceFinding(state, "F1", 6, "ok");
    state = machine.addConfidenceFinding(
      state,
      "F2",
      8,
      "good evidence from testing",
    );

    const below7 = machine.getLowConfidenceFindings(state, 7);
    assert.assertEquals(below7.length, 1);
    assert.assertEquals(below7[0]!.confidence, 6);
  });

  bdd.it("empty when no findings", () => {
    const state = createExecutingSpec();
    assert.assertEquals(machine.getLowConfidenceFindings(state).length, 0);
  });
});

// =============================================================================
// getAverageConfidence
// =============================================================================

bdd.describe("getAverageConfidence", () => {
  bdd.it("calculates average", () => {
    let state = createExecutingSpec();
    state = machine.addConfidenceFinding(
      state,
      "F1",
      8,
      "verified via code review",
    );
    state = machine.addConfidenceFinding(state, "F2", 6, "b");
    state = machine.addConfidenceFinding(
      state,
      "F3",
      10,
      "confirmed by running all tests",
    );

    assert.assertEquals(machine.getAverageConfidence(state), 8);
  });

  bdd.it("returns null when no findings", () => {
    const state = createExecutingSpec();
    assert.assertEquals(machine.getAverageConfidence(state), null);
  });
});

// =============================================================================
// Dashboard integration
// =============================================================================

bdd.describe("dashboard confidence", () => {
  bdd.it("getSpecSummary includes confidence metrics", async () => {
    const root = await makeTempDir();
    let state = createExecutingSpec();
    state = machine.addConfidenceFinding(
      state,
      "High",
      9,
      "verified by reading source code",
    );
    state = machine.addConfidenceFinding(state, "Low", 3, "guessing");

    await runtime.fs.mkdir(
      `${root}/${persistence.paths.specDir("test")}`,
      { recursive: true },
    );
    await persistence.writeSpecState(root, "test", state);

    const summary = await dashboardState.getSpecSummary(root, "test");
    assert.assertEquals(summary.avgConfidence, 6);
    assert.assertEquals(summary.lowConfidenceItems, 1);
  });

  bdd.it("null avgConfidence when no findings", async () => {
    const root = await makeTempDir();
    const state = createExecutingSpec();

    await runtime.fs.mkdir(
      `${root}/${persistence.paths.specDir("test")}`,
      { recursive: true },
    );
    await persistence.writeSpecState(root, "test", state);

    const summary = await dashboardState.getSpecSummary(root, "test");
    assert.assertEquals(summary.avgConfidence, null);
    assert.assertEquals(summary.lowConfidenceItems, 0);
  });
});

// =============================================================================
// Compiler rule
// =============================================================================

bdd.describe("compiler confidence rule", () => {
  bdd.it("confidence scoring rule present in compiler output", async () => {
    const { compile } = await import("../context/compiler.ts");
    const state = schema.createInitialState();
    const output = await compile(state, [], []);

    const allRules = output.behavioral.rules;
    const hasConfidence = allRules.some((r) =>
      r.includes("Confidence scoring") || r.includes("confidence score")
    );
    assert.assertEquals(hasConfidence, true);
  });
});
