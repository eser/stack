// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Tests for `noskills spec <name> followup`: answering and skipping the
 * follow-ups `next` hands out one at a time, against a temporary project
 * passed as the root.
 */

import * as bdd from "@std/testing/bdd";
import * as assert from "@eserstack/test-kit/assert";
import * as results from "@eserstack/primitives/results";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as followup from "./followup.ts";
import * as machine from "../state/machine.ts";
import * as persistence from "../state/persistence.ts";
import * as questions from "../context/questions.ts";
import * as schema from "../state/schema.ts";

const SPEC = "upload";

/** A spec in DISCOVERY with every base answer in and two follow-ups pending. */
const answeredWithFollowUps = (): schema.StateFile => {
  let state = machine.startSpec(
    schema.createInitialState(),
    SPEC,
    `spec/${SPEC}`,
  );
  for (const q of questions.QUESTIONS) {
    state = machine.addDiscoveryAnswer(
      state,
      q.id,
      `Answer for ${q.id} with enough detail`,
    );
  }
  state = machine.addFollowUp(
    state,
    "reversibility",
    "What is the rollback plan?",
    "agent",
  );

  return machine.addFollowUp(
    state,
    "user_impact",
    "Which users notice the change first?",
    "agent",
  );
};

bdd.describe("noskills followup: settling follow-ups", () => {
  let root: string;

  bdd.beforeEach(async () => {
    root = await runtime.fs.makeTempDir({ prefix: "nos_followup_" });
    await runtime.fs.mkdir(`${root}/${persistence.paths.specDir(SPEC)}`, {
      recursive: true,
    });
    await persistence.writeStateAndSpec(root, answeredWithFollowUps());
  });

  bdd.afterEach(async () => {
    await runtime.fs.remove(root, { recursive: true });
  });

  bdd.it("answers one follow-up and keeps discovery open", async () => {
    const result = await followup.main(
      ["reversibilitya", "--answer=A versioned bucket", `--spec=${SPEC}`],
      root,
    );

    assert.assertEquals(results.isOk(result), true);
    const state = await persistence.readSpecState(root, SPEC);
    assert.assertEquals(state.phase, "DISCOVERY");
    assert.assertEquals(
      machine.getPendingFollowUps(state).map((f) => f.id),
      ["user_impacta"],
    );
  });

  bdd.it("completes discovery once the last one is settled", async () => {
    await followup.main(
      ["reversibilitya", "--answer=A versioned bucket", `--spec=${SPEC}`],
      root,
    );
    const result = await followup.main(
      ["user_impacta", "--skip", `--spec=${SPEC}`],
      root,
    );

    assert.assertEquals(results.isOk(result), true);
    const specState = await persistence.readSpecState(root, SPEC);
    const activeState = await persistence.readState(root);
    assert.assertEquals(specState.phase, "DISCOVERY_REFINEMENT");
    assert.assertEquals(activeState.phase, "DISCOVERY_REFINEMENT");
  });

  bdd.it("refuses an id that names no pending follow-up", async () => {
    const result = await followup.main(
      ["status_quoa", "--answer=Nothing to add", `--spec=${SPEC}`],
      root,
    );

    assert.assertEquals(results.isFail(result), true);
    const state = await persistence.readSpecState(root, SPEC);
    assert.assertEquals(machine.getPendingFollowUps(state).length, 2);
  });
});
