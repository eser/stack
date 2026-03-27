// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import * as compiler from "./compiler.ts";
import * as schema from "../state/schema.ts";
import * as machine from "../state/machine.ts";
import { loadDefaultConcerns } from "./concerns.ts";

// =============================================================================
// Helpers
// =============================================================================

const allConcerns = await loadDefaultConcerns();
const noRules: readonly string[] = [];
const noConcerns: readonly schema.ConcernDefinition[] = [];
const someRules = ["Use Deno", "No global state"];

const moveFast = allConcerns.find((c) => c.id === "move-fast")!;
const compliance = allConcerns.find((c) => c.id === "compliance")!;
const openSource = allConcerns.find((c) => c.id === "open-source")!;

const idle = (): schema.StateFile => schema.createInitialState();

const inDiscovery = (): schema.StateFile =>
  machine.startSpec(idle(), "test-spec", "spec/test-spec");

const inSpecDraft = (): schema.StateFile =>
  machine.completeDiscovery(inDiscovery());

const inSpecApproved = (): schema.StateFile =>
  machine.approveSpec(inSpecDraft());

const inExecuting = (): schema.StateFile =>
  machine.startExecution(inSpecApproved());

const inBlocked = (): schema.StateFile =>
  machine.blockExecution(inExecuting(), "need API key");

const inDone = (): schema.StateFile =>
  machine.transition(inExecuting(), "DONE");

// =============================================================================
// compile
// =============================================================================

describe("compile", () => {
  it("IDLE returns IdleOutput with instruction", () => {
    const output = compiler.compile(idle(), noConcerns, noRules);

    assertEquals(output.phase, "IDLE");
    assertEquals("instruction" in output, true);
  });

  it("DISCOVERY with unanswered returns DiscoveryOutput with next question", () => {
    const output = compiler.compile(inDiscovery(), noConcerns, noRules);

    assertEquals(output.phase, "DISCOVERY");
    const discovery = output as compiler.DiscoveryOutput;
    assertEquals(discovery.question.id, "status_quo");
    assertEquals(discovery.transition.remainingQuestions, 5);
  });

  it("DISCOVERY includes rules and concern reminders in context", () => {
    const output = compiler.compile(
      inDiscovery(),
      [openSource],
      someRules,
    ) as compiler.DiscoveryOutput;

    assertEquals(output.context.rules.length, 2);
    assertEquals(output.context.concernReminders.length > 0, true);
  });

  it("DISCOVERY includes concern extras in question", () => {
    const output = compiler.compile(
      inDiscovery(),
      [openSource],
      noRules,
    ) as compiler.DiscoveryOutput;

    // open-source adds an extra to status_quo question
    assertEquals(output.question.extras.length > 0, true);
  });

  it("SPEC_DRAFT returns SpecDraftOutput with specPath", () => {
    const output = compiler.compile(inSpecDraft(), noConcerns, noRules);

    assertEquals(output.phase, "SPEC_DRAFT");
    const specDraft = output as compiler.SpecDraftOutput;
    assertEquals(specDraft.specPath, ".eser/specs/test-spec/spec.md");
    assertEquals(specDraft.transition.onApprove, "noskills approve");
  });

  it("SPEC_APPROVED returns SpecApprovedOutput with onStart transition", () => {
    const output = compiler.compile(inSpecApproved(), noConcerns, noRules);

    assertEquals(output.phase, "SPEC_APPROVED");
    const approved = output as compiler.SpecApprovedOutput;
    assertEquals(approved.specPath, ".eser/specs/test-spec/spec.md");
    assertEquals(approved.transition.onStart.includes("noskills next"), true);
  });

  it("EXECUTING returns ExecutionOutput with iteration", () => {
    const output = compiler.compile(inExecuting(), noConcerns, noRules);

    assertEquals(output.phase, "EXECUTING");
    const exec = output as compiler.ExecutionOutput;
    assertEquals(exec.transition.iteration, 0);
  });

  it("EXECUTING with tensions includes concernTensions array", () => {
    const output = compiler.compile(
      inExecuting(),
      [moveFast, compliance],
      noRules,
    ) as compiler.ExecutionOutput;

    assertEquals(output.concernTensions !== undefined, true);
    assertEquals(output.concernTensions!.length, 1);
  });

  it("BLOCKED returns BlockedOutput with reason", () => {
    const output = compiler.compile(inBlocked(), noConcerns, noRules);

    assertEquals(output.phase, "BLOCKED");
    const blocked = output as compiler.BlockedOutput;
    assertEquals(blocked.reason, "BLOCKED: need API key");
  });

  it("DONE returns DoneOutput with summary", () => {
    const output = compiler.compile(inDone(), noConcerns, noRules);

    assertEquals(output.phase, "DONE");
    const done = output as compiler.DoneOutput;
    assertEquals(done.summary.spec, "test-spec");
    assertEquals(done.summary.iterations, 0);
    assertEquals(done.summary.decisionsCount, 0);
  });

  it("UNINITIALIZED falls through to IdleOutput", () => {
    const state = { ...idle(), phase: "UNINITIALIZED" as schema.Phase };
    const output = compiler.compile(state, noConcerns, noRules);

    assertEquals(output.phase, "IDLE");
  });
});
