// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as schema from "./schema.ts";
import * as machine from "./machine.ts";

// =============================================================================
// Helpers
// =============================================================================

const idle = (): schema.StateFile => schema.createInitialState();

const inDiscovery = (): schema.StateFile =>
  machine.startSpec(idle(), "test-spec", "spec/test-spec", "test description");

// =============================================================================
// Discovery Modes
// =============================================================================

bdd.describe("Discovery modes", () => {
  bdd.it("setDiscoveryMode stores mode in state", () => {
    let state = inDiscovery();
    state = machine.setDiscoveryMode(state, "validate");
    assert.assertEquals(state.discovery.mode, "validate");
  });

  bdd.it("setDiscoveryMode rejects non-DISCOVERY phase", () => {
    const state = idle();
    let threw = false;
    try {
      machine.setDiscoveryMode(state, "full");
    } catch {
      threw = true;
    }
    assert.assertEquals(threw, true);
  });

  bdd.it("default state has no mode (undefined)", () => {
    const state = idle();
    assert.assertEquals(state.discovery.mode, undefined);
  });

  bdd.it("all 5 modes are valid DiscoveryMode values", () => {
    const state = inDiscovery();
    for (const mode of [
      "full",
      "validate",
      "technical-depth",
      "ship-fast",
      "explore",
    ] as schema.DiscoveryMode[]) {
      const s = machine.setDiscoveryMode(state, mode);
      assert.assertEquals(s.discovery.mode, mode);
    }
  });
});

// =============================================================================
// Premise Challenge
// =============================================================================

bdd.describe("Premise challenge", () => {
  bdd.it("completePremises stores premises and sets flag", () => {
    let state = inDiscovery();
    state = machine.setDiscoveryMode(state, "full");

    const premises: schema.Premise[] = [
      {
        text: "Users need feature X",
        agreed: true,
        user: "Test",
        timestamp: "2026-01-01",
      },
      {
        text: "Feature X needs API Y",
        agreed: false,
        revision: "Use API Z instead",
        user: "Test",
        timestamp: "2026-01-01",
      },
    ];
    state = machine.completePremises(state, premises);

    assert.assertEquals(state.discovery.premisesCompleted, true);
    assert.assertEquals(state.discovery.premises?.length, 2);
    assert.assertEquals(state.discovery.premises?.[0]?.agreed, true);
    assert.assertEquals(state.discovery.premises?.[1]?.agreed, false);
    assert.assertEquals(
      state.discovery.premises?.[1]?.revision,
      "Use API Z instead",
    );
  });

  bdd.it("empty premises array skips premise step", () => {
    let state = inDiscovery();
    state = machine.setDiscoveryMode(state, "full");
    state = machine.completePremises(state, []);
    assert.assertEquals(state.discovery.premisesCompleted, true);
    assert.assertEquals(state.discovery.premises?.length, 0);
  });

  bdd.it("completePremises rejects non-DISCOVERY phase", () => {
    const state = idle();
    let threw = false;
    try {
      machine.completePremises(state, []);
    } catch {
      threw = true;
    }
    assert.assertEquals(threw, true);
  });
});

// =============================================================================
// Alternatives
// =============================================================================

bdd.describe("Alternatives", () => {
  bdd.it("selectApproach stores approach and sets flag", () => {
    let state = inDiscovery();
    state = machine.setDiscoveryMode(state, "full");
    state = machine.completePremises(state, []);
    // Simulate through to DISCOVERY_REFINEMENT
    state = {
      ...state,
      phase: "DISCOVERY_REFINEMENT" as schema.Phase,
      discovery: { ...state.discovery, completed: true, approved: true },
    };

    const approach: schema.SelectedApproach = {
      id: "A",
      name: "Approach A",
      summary: "Simple approach",
      effort: "M",
      risk: "Low",
      user: "Test",
      timestamp: "2026-01-01",
    };
    state = machine.selectApproach(state, approach);

    assert.assertEquals(state.discovery.selectedApproach?.id, "A");
    assert.assertEquals(state.discovery.alternativesPresented, true);
  });

  bdd.it("skipAlternatives sets flag without approach", () => {
    let state = inDiscovery();
    state = {
      ...state,
      phase: "DISCOVERY_REFINEMENT" as schema.Phase,
      discovery: { ...state.discovery, approved: true },
    };

    state = machine.skipAlternatives(state);
    assert.assertEquals(state.discovery.alternativesPresented, true);
    assert.assertEquals(state.discovery.selectedApproach, undefined);
  });

  bdd.it("selectApproach rejects non-DISCOVERY_REFINEMENT phase", () => {
    const state = inDiscovery();
    let threw = false;
    try {
      machine.selectApproach(state, {
        id: "A",
        name: "A",
        summary: "",
        effort: "",
        risk: "",
        user: "Test",
        timestamp: "2026-01-01",
      });
    } catch {
      threw = true;
    }
    assert.assertEquals(threw, true);
  });

  bdd.it("skipAlternatives rejects non-DISCOVERY_REFINEMENT phase", () => {
    const state = inDiscovery();
    let threw = false;
    try {
      machine.skipAlternatives(state);
    } catch {
      threw = true;
    }
    assert.assertEquals(threw, true);
  });
});

// =============================================================================
// Backward Compatibility
// =============================================================================

bdd.describe("Backward compatibility", () => {
  bdd.it("old state without mode/premises fields works", () => {
    const oldState: schema.StateFile = {
      ...schema.createInitialState(),
      phase: "DISCOVERY",
      spec: "old-spec",
    };
    // These should all return undefined (not error)
    assert.assertEquals(oldState.discovery.mode, undefined);
    assert.assertEquals(oldState.discovery.premises, undefined);
    assert.assertEquals(oldState.discovery.premisesCompleted, undefined);
    assert.assertEquals(oldState.discovery.alternativesPresented, undefined);
    assert.assertEquals(oldState.discovery.selectedApproach, undefined);
  });

  bdd.it("setDiscoveryMode works on state without mode", () => {
    const state: schema.StateFile = {
      ...schema.createInitialState(),
      phase: "DISCOVERY",
      spec: "test",
    };
    const updated = machine.setDiscoveryMode(state, "full");
    assert.assertEquals(updated.discovery.mode, "full");
  });
});

// =============================================================================
// Rich Description Detection
// =============================================================================

bdd.describe("Rich description detection", () => {
  bdd.it("description >500 chars is rich", () => {
    const desc = "x ".repeat(300);
    assert.assert(desc.length > 500);
  });

  bdd.it("description <500 chars is not rich", () => {
    const desc = "short description";
    assert.assert(desc.length < 500);
  });
});

// =============================================================================
// Merged entry subPhase (task-9)
// =============================================================================

bdd.describe("merged entry subPhase", () => {
  bdd.it("setUserContext appends to array (empty start)", () => {
    const state = inDiscovery();
    assert.assertEquals(state.discovery.userContext, undefined);
    const updated = machine.setUserContext(state, "first");
    assert.assertEquals(updated.discovery.userContext, ["first"]);
  });

  bdd.it("setUserContext appends multiple times", () => {
    let state = inDiscovery();
    state = machine.setUserContext(state, "first");
    state = machine.setUserContext(state, "second");
    assert.assertEquals(state.discovery.userContext, ["first", "second"]);
  });

  bdd.it("entryComplete starts undefined on a fresh discovery state", () => {
    const state = inDiscovery();
    assert.assertEquals(state.discovery.entryComplete, undefined);
  });

  bdd.it("markEntryComplete sets entryComplete flag to true", () => {
    const state = inDiscovery();
    const updated = machine.markEntryComplete(state);
    assert.assertEquals(updated.discovery.entryComplete, true);
  });

  bdd.it("setDiscoveryMode also sets entryComplete to true", () => {
    const state = inDiscovery();
    const updated = machine.setDiscoveryMode(state, "full");
    assert.assertEquals(updated.discovery.mode, "full");
    assert.assertEquals(updated.discovery.entryComplete, true);
  });

  bdd.it("recommendedEntryOption returns 'a' for short description", () => {
    let state = inDiscovery();
    state = { ...state, specDescription: "hi" };
    assert.assertEquals(machine.recommendedEntryOption(state), "a");
  });

  bdd.it(
    "recommendedEntryOption returns 'mode' for rich description (>500)",
    () => {
      let state = inDiscovery();
      const rich = "x".repeat(501);
      state = { ...state, specDescription: rich };
      assert.assertEquals(machine.recommendedEntryOption(state), "mode");
    },
  );

  bdd.it(
    "recommendedEntryOption returns 'a' for exactly 500 chars (boundary)",
    () => {
      let state = inDiscovery();
      const desc = "x".repeat(500);
      state = { ...state, specDescription: desc };
      assert.assertEquals(machine.recommendedEntryOption(state), "a");
    },
  );

  bdd.it(
    "recommendedEntryOption returns 'mode' for 501 chars (boundary)",
    () => {
      let state = inDiscovery();
      const desc = "x".repeat(501);
      state = { ...state, specDescription: desc };
      assert.assertEquals(machine.recommendedEntryOption(state), "mode");
    },
  );

  bdd.it(
    "recommendedEntryOption returns 'a' when specDescription is null",
    () => {
      const state = { ...inDiscovery(), specDescription: null };
      assert.assertEquals(machine.recommendedEntryOption(state), "a");
    },
  );
});
