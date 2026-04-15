// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals } from "@std/assert";
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

describe("setContributors", () => {
  it("stores contributor names in discovery state", () => {
    let state = createDiscoverySpec("test");
    state = machine.setContributors(state, ["eser", "ahmet", "fatma"]);

    assertEquals(state.discovery.contributors?.length, 3);
    assertEquals(state.discovery.contributors?.[0], "eser");
    assertEquals(state.discovery.contributors?.[2], "fatma");
  });

  it("single contributor", () => {
    let state = createDiscoverySpec("test");
    state = machine.setContributors(state, ["eser"]);

    assertEquals(state.discovery.contributors?.length, 1);
  });
});

// =============================================================================
// Delegation creation
// =============================================================================

describe("addDelegation", () => {
  it("creates pending delegation", () => {
    let state = createDiscoverySpec("test");
    state = machine.addDelegation(
      state,
      "error_handling",
      "ahmet",
      "eser",
    );

    const delegations = state.discovery.delegations ?? [];
    assertEquals(delegations.length, 1);
    assertEquals(delegations[0]!.questionId, "error_handling");
    assertEquals(delegations[0]!.delegatedTo, "ahmet");
    assertEquals(delegations[0]!.delegatedBy, "eser");
    assertEquals(delegations[0]!.status, "pending");
    assertEquals(delegations[0]!.answer, undefined);
  });

  it("allows multiple delegations", () => {
    let state = createDiscoverySpec("test");
    state = machine.addDelegation(state, "q1", "ahmet", "eser");
    state = machine.addDelegation(state, "q2", "fatma", "eser");

    const delegations = state.discovery.delegations ?? [];
    assertEquals(delegations.length, 2);
    assertEquals(delegations[0]!.delegatedTo, "ahmet");
    assertEquals(delegations[1]!.delegatedTo, "fatma");
  });
});

// =============================================================================
// Answering delegation
// =============================================================================

describe("answerDelegation", () => {
  it("updates status to answered with answer text", () => {
    let state = createDiscoverySpec("test");
    state = machine.addDelegation(state, "error_handling", "ahmet", "eser");
    state = machine.answerDelegation(
      state,
      "error_handling",
      "Use Result type, no exceptions",
      "ahmet",
    );

    const delegations = state.discovery.delegations ?? [];
    assertEquals(delegations[0]!.status, "answered");
    assertEquals(delegations[0]!.answer, "Use Result type, no exceptions");
    assertEquals(delegations[0]!.answeredBy, "ahmet");
    assert(delegations[0]!.answeredAt !== undefined);
  });

  it("does not modify already-answered delegation", () => {
    let state = createDiscoverySpec("test");
    state = machine.addDelegation(state, "q1", "ahmet", "eser");
    state = machine.answerDelegation(state, "q1", "First answer", "ahmet");
    state = machine.answerDelegation(state, "q1", "Second answer", "ahmet");

    const delegations = state.discovery.delegations ?? [];
    assertEquals(delegations[0]!.answer, "First answer");
  });

  it("only answers the matching question", () => {
    let state = createDiscoverySpec("test");
    state = machine.addDelegation(state, "q1", "ahmet", "eser");
    state = machine.addDelegation(state, "q2", "fatma", "eser");
    state = machine.answerDelegation(state, "q1", "Answer for q1", "ahmet");

    const delegations = state.discovery.delegations ?? [];
    assertEquals(delegations[0]!.status, "answered");
    assertEquals(delegations[1]!.status, "pending");
  });
});

// =============================================================================
// Pending delegations gate
// =============================================================================

describe("getPendingDelegations", () => {
  it("returns only pending delegations", () => {
    let state = createDiscoverySpec("test");
    state = machine.addDelegation(state, "q1", "ahmet", "eser");
    state = machine.addDelegation(state, "q2", "fatma", "eser");
    state = machine.answerDelegation(state, "q1", "Done", "ahmet");

    const pending = machine.getPendingDelegations(state);
    assertEquals(pending.length, 1);
    assertEquals(pending[0]!.questionId, "q2");
  });

  it("returns empty when all answered", () => {
    let state = createDiscoverySpec("test");
    state = machine.addDelegation(state, "q1", "ahmet", "eser");
    state = machine.answerDelegation(state, "q1", "Done", "ahmet");

    const pending = machine.getPendingDelegations(state);
    assertEquals(pending.length, 0);
  });

  it("returns empty when no delegations", () => {
    const state = createDiscoverySpec("test");
    const pending = machine.getPendingDelegations(state);
    assertEquals(pending.length, 0);
  });
});

// =============================================================================
// Dashboard state includes delegations
// =============================================================================

describe("dashboard delegation integration", () => {
  it("getSpecSummary includes delegations", async () => {
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
    assertEquals(summary.delegations.length, 1);
    assertEquals(summary.delegations[0]!.questionId, "q1");
    assertEquals(summary.delegations[0]!.status, "pending");
  });
});

// =============================================================================
// Events
// =============================================================================

describe("delegation events", () => {
  it("delegation-created event can be written and read", async () => {
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
    assertEquals(evts.length, 1);
    assertEquals(evts[0]!.type, "delegation-created");
  });

  it("delegation-answered event can be written and read", async () => {
    const root = await makeTempDir();
    await events.appendEvent(root, {
      ts: new Date().toISOString(),
      type: "delegation-answered",
      spec: "test-spec",
      user: "ahmet",
      question: "error_handling",
    });

    const evts = await events.readEvents(root);
    assertEquals(evts.length, 1);
    assertEquals(evts[0]!.type, "delegation-answered");
  });
});

// =============================================================================
// Approve gate
// =============================================================================

describe("approve delegation gate", () => {
  it("approve is blocked when pending delegations exist", () => {
    let state = createDiscoverySpec("test");
    state = machine.addDelegation(state, "q1", "ahmet", "eser");

    const pending = machine.getPendingDelegations(state);
    assertEquals(pending.length, 1);
    // The approve command checks this and rejects — tested via command-level tests
  });

  it("approve is allowed when all delegations answered", () => {
    let state = createDiscoverySpec("test");
    state = machine.addDelegation(state, "q1", "ahmet", "eser");
    state = machine.answerDelegation(state, "q1", "Done", "ahmet");

    const pending = machine.getPendingDelegations(state);
    assertEquals(pending.length, 0);
  });
});
