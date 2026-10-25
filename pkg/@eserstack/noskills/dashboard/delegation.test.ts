// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "@std/testing/bdd";
import * as assert from "@eserstack/test-kit/assert";
import * as schema from "../state/schema.ts";
import * as machine from "../state/machine.ts";
import * as persistence from "../state/persistence.ts";
import * as dashboardState from "./state.ts";
import * as events from "./events.ts";
import { runtime } from "@eserstack/standards/cross-runtime";

// =============================================================================
// Helpers
// =============================================================================

let tempCounter = 0;
const makeTempDir = async (): Promise<string> => {
  const base = await runtime.fs.makeTempDir();
  const dir = `${base}/noskills-delegation-test-${tempCounter++}`;
  await persistence.scaffoldEserDir(dir);
  return dir;
};

const createDiscoverySpec = (name: string): schema.StateFile => {
  const state = schema.createInitialState();
  return machine.startSpec(state, name, `spec/${name}`, "test description");
};

// =============================================================================
// Contributors
// =============================================================================

bdd.describe("setContributors", () => {
  bdd.it("stores contributor names in discovery state", () => {
    let state = createDiscoverySpec("test");
    state = machine.setContributors(state, ["eser", "ahmet", "fatma"]);

    assert.assertEquals(state.discovery.contributors?.length, 3);
    assert.assertEquals(state.discovery.contributors?.[0], "eser");
    assert.assertEquals(state.discovery.contributors?.[2], "fatma");
  });

  bdd.it("single contributor", () => {
    let state = createDiscoverySpec("test");
    state = machine.setContributors(state, ["eser"]);

    assert.assertEquals(state.discovery.contributors?.length, 1);
  });
});

// =============================================================================
// Delegation creation
// =============================================================================

bdd.describe("addDelegation", () => {
  bdd.it("creates pending delegation", () => {
    let state = createDiscoverySpec("test");
    state = machine.addDelegation(state, "error_handling", "ahmet", "eser");

    const delegations = state.discovery.delegations ?? [];
    assert.assertEquals(delegations.length, 1);
    assert.assertEquals(delegations[0]!.questionId, "error_handling");
    assert.assertEquals(delegations[0]!.delegatedTo, "ahmet");
    assert.assertEquals(delegations[0]!.delegatedBy, "eser");
    assert.assertEquals(delegations[0]!.status, "pending");
    assert.assertEquals(delegations[0]!.answer, undefined);
  });

  bdd.it("allows multiple delegations", () => {
    let state = createDiscoverySpec("test");
    state = machine.addDelegation(state, "q1", "ahmet", "eser");
    state = machine.addDelegation(state, "q2", "fatma", "eser");

    const delegations = state.discovery.delegations ?? [];
    assert.assertEquals(delegations.length, 2);
    assert.assertEquals(delegations[0]!.delegatedTo, "ahmet");
    assert.assertEquals(delegations[1]!.delegatedTo, "fatma");
  });
});

// =============================================================================
// Answering delegation
// =============================================================================

bdd.describe("answerDelegation", () => {
  bdd.it("updates status to answered with answer text", () => {
    let state = createDiscoverySpec("test");
    state = machine.addDelegation(state, "error_handling", "ahmet", "eser");
    state = machine.answerDelegation(
      state,
      "error_handling",
      "Use Result type, no exceptions",
      "ahmet",
    );

    const delegations = state.discovery.delegations ?? [];
    assert.assertEquals(delegations[0]!.status, "answered");
    assert.assertEquals(
      delegations[0]!.answer,
      "Use Result type, no exceptions",
    );
    assert.assertEquals(delegations[0]!.answeredBy, "ahmet");
    assert.assert(delegations[0]!.answeredAt !== undefined);
  });

  bdd.it("does not modify already-answered delegation", () => {
    let state = createDiscoverySpec("test");
    state = machine.addDelegation(state, "q1", "ahmet", "eser");
    state = machine.answerDelegation(state, "q1", "First answer", "ahmet");
    state = machine.answerDelegation(state, "q1", "Second answer", "ahmet");

    const delegations = state.discovery.delegations ?? [];
    assert.assertEquals(delegations[0]!.answer, "First answer");
  });

  bdd.it("only answers the matching question", () => {
    let state = createDiscoverySpec("test");
    state = machine.addDelegation(state, "q1", "ahmet", "eser");
    state = machine.addDelegation(state, "q2", "fatma", "eser");
    state = machine.answerDelegation(state, "q1", "Answer for q1", "ahmet");

    const delegations = state.discovery.delegations ?? [];
    assert.assertEquals(delegations[0]!.status, "answered");
    assert.assertEquals(delegations[1]!.status, "pending");
  });
});

// =============================================================================
// Pending delegations gate
// =============================================================================

bdd.describe("getPendingDelegations", () => {
  bdd.it("returns only pending delegations", () => {
    let state = createDiscoverySpec("test");
    state = machine.addDelegation(state, "q1", "ahmet", "eser");
    state = machine.addDelegation(state, "q2", "fatma", "eser");
    state = machine.answerDelegation(state, "q1", "Done", "ahmet");

    const pending = machine.getPendingDelegations(state);
    assert.assertEquals(pending.length, 1);
    assert.assertEquals(pending[0]!.questionId, "q2");
  });

  bdd.it("returns empty when all answered", () => {
    let state = createDiscoverySpec("test");
    state = machine.addDelegation(state, "q1", "ahmet", "eser");
    state = machine.answerDelegation(state, "q1", "Done", "ahmet");

    const pending = machine.getPendingDelegations(state);
    assert.assertEquals(pending.length, 0);
  });

  bdd.it("returns empty when no delegations", () => {
    const state = createDiscoverySpec("test");
    const pending = machine.getPendingDelegations(state);
    assert.assertEquals(pending.length, 0);
  });
});

// =============================================================================
// Dashboard state includes delegations
// =============================================================================

bdd.describe("dashboard delegation integration", () => {
  bdd.it("getSpecSummary includes delegations", async () => {
    const root = await makeTempDir();
    let state = createDiscoverySpec("delegation-spec");
    state = machine.addDelegation(state, "q1", "ahmet", "eser");

    await runtime.fs.mkdir(
      `${root}/${persistence.paths.specDir("delegation-spec")}`,
      { recursive: true },
    );
    await persistence.writeSpecState(root, "delegation-spec", state);

    const summary = await dashboardState.getSpecSummary(
      root,
      "delegation-spec",
    );
    assert.assertEquals(summary.delegations.length, 1);
    assert.assertEquals(summary.delegations[0]!.questionId, "q1");
    assert.assertEquals(summary.delegations[0]!.status, "pending");
  });
});

// =============================================================================
// Events
// =============================================================================

bdd.describe("delegation events", () => {
  bdd.it("delegation-created event can be written and read", async () => {
    const root = await makeTempDir();
    await events.appendEvent(root, {
      ts: new Date().toISOString(),
      type: "delegation-created",
      spec: "test-spec",
      user: "eser",
      question: "error_handling",
      from: "eser",
      to: "ahmet",
    });

    const evts = await events.readEvents(root);
    assert.assertEquals(evts.length, 1);
    assert.assertEquals(evts[0]!.type, "delegation-created");
  });

  bdd.it("delegation-answered event can be written and read", async () => {
    const root = await makeTempDir();
    await events.appendEvent(root, {
      ts: new Date().toISOString(),
      type: "delegation-answered",
      spec: "test-spec",
      user: "ahmet",
      question: "error_handling",
    });

    const evts = await events.readEvents(root);
    assert.assertEquals(evts.length, 1);
    assert.assertEquals(evts[0]!.type, "delegation-answered");
  });
});

// =============================================================================
// Approve gate
// =============================================================================

bdd.describe("approve delegation gate", () => {
  bdd.it("approve is blocked when pending delegations exist", () => {
    let state = createDiscoverySpec("test");
    state = machine.addDelegation(state, "q1", "ahmet", "eser");

    const pending = machine.getPendingDelegations(state);
    assert.assertEquals(pending.length, 1);
    // The approve command checks this and rejects — tested via command-level tests
  });

  bdd.it("approve is allowed when all delegations answered", () => {
    let state = createDiscoverySpec("test");
    state = machine.addDelegation(state, "q1", "ahmet", "eser");
    state = machine.answerDelegation(state, "q1", "Done", "ahmet");

    const pending = machine.getPendingDelegations(state);
    assert.assertEquals(pending.length, 0);
  });
});
