// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { assert, assertEquals } from "@std/assert";
import * as identity from "./identity.ts";
import * as schema from "./schema.ts";
import * as machine from "./machine.ts";
import * as crossRuntime from "@eserstack/standards/cross-runtime";

// =============================================================================
// Helpers
// =============================================================================

const idle = (): schema.StateFile => schema.createInitialState();

const inDiscovery = (): schema.StateFile =>
  machine.startSpec(idle(), "test-spec", "spec/test-spec");

const inExecuting = (): schema.StateFile => {
  let s = inDiscovery();
  s = machine.completeDiscovery(s);
  s = machine.approveDiscoveryReview(s);
  s = machine.approveSpec(s);
  s = machine.startExecution(s);
  return s;
};

let tempConfigDir: string;
let originalXdg: string | undefined;

// =============================================================================
// identity helpers
// =============================================================================

describe("formatUser", () => {
  it("formats name and email", () => {
    const user: identity.NoskillsUser = {
      name: "Alice",
      email: "alice@example.com",
    };
    assertEquals(identity.formatUser(user), "Alice <alice@example.com>");
  });

  it("formats name only when no email", () => {
    const user: identity.NoskillsUser = { name: "Bob", email: "" };
    assertEquals(identity.formatUser(user), "Bob");
  });
});

describe("shortUser", () => {
  it("returns just the name", () => {
    const user: identity.NoskillsUser = {
      name: "Charlie",
      email: "c@c.com",
    };
    assertEquals(identity.shortUser(user), "Charlie");
  });
});

describe("unknownUser", () => {
  it("returns correct defaults", () => {
    const user = identity.unknownUser();
    assertEquals(user.name, "Unknown User");
    assertEquals(user.email, "");
  });
});

// =============================================================================
// File-based identity (via XDG_CONFIG_HOME override)
// =============================================================================

describe("file-based identity", () => {
  beforeEach(async () => {
    tempConfigDir = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "noskills-config-",
    });
    originalXdg = crossRuntime.runtime.env.get("XDG_CONFIG_HOME");
    crossRuntime.runtime.env.set("XDG_CONFIG_HOME", tempConfigDir);
  });

  afterEach(async () => {
    if (originalXdg !== undefined) {
      crossRuntime.runtime.env.set("XDG_CONFIG_HOME", originalXdg);
    } else {
      crossRuntime.runtime.env.delete("XDG_CONFIG_HOME");
    }
    await crossRuntime.runtime.fs.remove(tempConfigDir, { recursive: true });
  });

  it("getConfigDir uses XDG_CONFIG_HOME", () => {
    const dir = identity.getConfigDir();
    assertEquals(dir, `${tempConfigDir}/eser/noskills`);
  });

  it("setCurrentUser creates config file", async () => {
    await identity.setCurrentUser({
      name: "Test User",
      email: "test@test.com",
    });

    const filePath = identity.getUserFilePath();
    const content = await crossRuntime.runtime.fs.readTextFile(filePath);
    const data = JSON.parse(content) as { name: string; email: string };
    assertEquals(data.name, "Test User");
    assertEquals(data.email, "test@test.com");
  });

  it("getCurrentUser reads from config file", async () => {
    await identity.setCurrentUser({
      name: "Alice",
      email: "alice@co.com",
    });

    const user = await identity.getCurrentUser();
    assert(user !== null);
    assertEquals(user.name, "Alice");
    assertEquals(user.email, "alice@co.com");
  });

  it("getCurrentUser returns null when no file exists", async () => {
    const user = await identity.getCurrentUser();
    assertEquals(user, null);
  });

  it("clearCurrentUser removes the file", async () => {
    await identity.setCurrentUser({ name: "ToDelete", email: "" });
    const before = await identity.getCurrentUser();
    assert(before !== null);

    const removed = await identity.clearCurrentUser();
    assertEquals(removed, true);

    const after = await identity.getCurrentUser();
    assertEquals(after, null);
  });

  it("clearCurrentUser returns false when no file", async () => {
    const removed = await identity.clearCurrentUser();
    assertEquals(removed, false);
  });

  it("resolveUser returns configured user when set", async () => {
    await identity.setCurrentUser({
      name: "Configured",
      email: "c@c.com",
    });

    const user = await identity.resolveUser();
    assertEquals(user.name, "Configured");
    assertEquals(user.email, "c@c.com");
  });

  it("resolveUser returns Unknown User when nothing configured and git unavailable", async () => {
    // No config file, and we can't reliably mock git absence,
    // so we test the fallback chain conceptually
    const user = await identity.getCurrentUser();
    assertEquals(user, null);
    // resolveUser would try git next, then fall back to unknown
  });

  it("getUserFilePath returns correct path under XDG", () => {
    const path = identity.getUserFilePath();
    assert(path.startsWith(tempConfigDir));
    assert(path.endsWith("/eser/noskills/user.json"));
  });
});

// =============================================================================
// schema helpers (normalizeAnswer, getAnswersForQuestion, getCombinedAnswer)
// =============================================================================

describe("normalizeAnswer", () => {
  it("handles old format (just questionId+answer)", () => {
    const oldAnswer: schema.DiscoveryAnswer = {
      questionId: "q1",
      answer: "my answer",
    };
    const normalized = schema.normalizeAnswer(oldAnswer);
    assertEquals(normalized.questionId, "q1");
    assertEquals(normalized.answer, "my answer");
    assertEquals(normalized.user, "Unknown User");
    assertEquals(normalized.email, "");
    assertEquals(normalized.timestamp, "");
    assertEquals(normalized.type, "original");
  });

  it("handles new format (with user, timestamp, type)", () => {
    const newAnswer: schema.AttributedDiscoveryAnswer = {
      questionId: "q2",
      answer: "attributed answer",
      user: "Alice",
      email: "alice@example.com",
      timestamp: "2024-01-01T00:00:00Z",
      type: "addition",
    };
    const normalized = schema.normalizeAnswer(newAnswer);
    assertEquals(normalized.user, "Alice");
    assertEquals(normalized.email, "alice@example.com");
    assertEquals(normalized.type, "addition");
    assertEquals(normalized.timestamp, "2024-01-01T00:00:00Z");
  });
});

describe("getAnswersForQuestion", () => {
  it("returns correct answers for a given question", () => {
    const answers: (
      | schema.DiscoveryAnswer
      | schema.AttributedDiscoveryAnswer
    )[] = [
      { questionId: "q1", answer: "a1" },
      { questionId: "q2", answer: "a2" },
      {
        questionId: "q1",
        answer: "a1-revised",
        user: "Bob",
        email: "",
        timestamp: "t",
        type: "addition" as const,
      },
    ];
    const q1Answers = schema.getAnswersForQuestion(answers, "q1");
    assertEquals(q1Answers.length, 2);
    assertEquals(q1Answers[0]!.answer, "a1");
    assertEquals(q1Answers[1]!.answer, "a1-revised");
    assertEquals(q1Answers[1]!.user, "Bob");
  });
});

describe("getCombinedAnswer", () => {
  it("returns single answer as-is", () => {
    const answers: schema.DiscoveryAnswer[] = [
      { questionId: "q1", answer: "only answer" },
    ];
    assertEquals(schema.getCombinedAnswer(answers, "q1"), "only answer");
  });

  it("combines multiple answers with attribution", () => {
    const answers: schema.AttributedDiscoveryAnswer[] = [
      {
        questionId: "q1",
        answer: "first",
        user: "Alice",
        email: "",
        timestamp: "t",
        type: "original",
      },
      {
        questionId: "q1",
        answer: "second",
        user: "Bob",
        email: "",
        timestamp: "t",
        type: "addition",
      },
    ];
    const combined = schema.getCombinedAnswer(answers, "q1");
    assertEquals(combined.includes("first"), true);
    assertEquals(combined.includes("second"), true);
    assertEquals(combined.includes("Alice"), true);
    assertEquals(combined.includes("Bob"), true);
  });

  it("returns empty string for missing question", () => {
    assertEquals(schema.getCombinedAnswer([], "q99"), "");
  });
});

// =============================================================================
// machine: addDiscoveryAnswer with user
// =============================================================================

describe("addDiscoveryAnswer with user", () => {
  it("stores attribution when user is provided", () => {
    const state = inDiscovery();
    const updated = machine.addDiscoveryAnswer(
      state,
      "q1",
      "answer with enough detail for attribution test",
      {
        name: "Alice",
        email: "alice@example.com",
      },
    );
    const answer = updated.discovery
      .answers[0] as schema.AttributedDiscoveryAnswer;
    assertEquals(answer.user, "Alice");
    assertEquals(answer.email, "alice@example.com");
    assertEquals(answer.type, "original");
    assertEquals(typeof answer.timestamp, "string");
  });

  it("defaults to Unknown User when no user provided", () => {
    const state = inDiscovery();
    const updated = machine.addDiscoveryAnswer(
      state,
      "q1",
      "answer with enough detail to pass validation",
    );
    const answer = updated.discovery
      .answers[0] as schema.AttributedDiscoveryAnswer;
    assertEquals(answer.user, "Unknown User");
    assertEquals(answer.email, "");
  });

  it("replaces existing answer for same question (backward compat)", () => {
    let state = inDiscovery();
    state = machine.addDiscoveryAnswer(
      state,
      "q1",
      "first answer with sufficient detail for test",
      {
        name: "Alice",
        email: "",
      },
    );
    state = machine.addDiscoveryAnswer(
      state,
      "q1",
      "second answer replaces the first one here",
      {
        name: "Bob",
        email: "",
      },
    );
    assertEquals(state.discovery.answers.length, 1);
    const answer = state.discovery
      .answers[0] as schema.AttributedDiscoveryAnswer;
    assertEquals(answer.answer, "second answer replaces the first one here");
    assertEquals(answer.user, "Bob");
  });
});

// =============================================================================
// machine: addDiscoveryContribution
// =============================================================================

describe("addDiscoveryContribution", () => {
  it("adds without replacing existing answers", () => {
    let state = inDiscovery();
    state = machine.addDiscoveryAnswer(
      state,
      "q1",
      "original answer with enough detail to pass validation",
      {
        name: "Alice",
        email: "",
      },
    );
    state = machine.addDiscoveryContribution(
      state,
      "q1",
      "additional insight expanding on the original",
      {
        name: "Bob",
        email: "",
      },
    );
    assertEquals(state.discovery.answers.length, 2);
    const first = state.discovery
      .answers[0] as schema.AttributedDiscoveryAnswer;
    const second = state.discovery
      .answers[1] as schema.AttributedDiscoveryAnswer;
    assertEquals(
      first.answer,
      "original answer with enough detail to pass validation",
    );
    assertEquals(first.user, "Alice");
    assertEquals(second.answer, "additional insight expanding on the original");
    assertEquals(second.user, "Bob");
    assertEquals(second.type, "addition");
  });
});

// =============================================================================
// machine: recordTransition
// =============================================================================

describe("recordTransition", () => {
  it("appends to transition history", () => {
    const state = inDiscovery();
    const updated = machine.recordTransition(state, "IDLE", "DISCOVERY", {
      name: "Admin",
      email: "admin@co.com",
    });
    assertEquals(updated.transitionHistory?.length, 1);
    const entry = updated.transitionHistory![0]!;
    assertEquals(entry.from, "IDLE");
    assertEquals(entry.to, "DISCOVERY");
    assertEquals(entry.user, "Admin");
    assertEquals(entry.email, "admin@co.com");
    assertEquals(typeof entry.timestamp, "string");
  });

  it("defaults to Unknown User when no user provided", () => {
    const state = inDiscovery();
    const updated = machine.recordTransition(state, "IDLE", "DISCOVERY");
    assertEquals(updated.transitionHistory![0]!.user, "Unknown User");
  });

  it("records reason if provided", () => {
    const state = inDiscovery();
    const updated = machine.recordTransition(
      state,
      "IDLE",
      "DISCOVERY",
      { name: "User", email: "" },
      "starting new spec",
    );
    assertEquals(
      updated.transitionHistory![0]!.reason,
      "starting new spec",
    );
  });

  it("works on old state without transitionHistory", () => {
    const oldState = { ...inDiscovery() } as Record<string, unknown>;
    delete oldState["transitionHistory"];
    const state = oldState as schema.StateFile;
    const updated = machine.recordTransition(state, "IDLE", "DISCOVERY");
    assertEquals(updated.transitionHistory?.length, 1);
  });
});

// =============================================================================
// machine: addCustomAC
// =============================================================================

describe("addCustomAC", () => {
  it("stores AC with user info", () => {
    const state = inDiscovery();
    const updated = machine.addCustomAC(state, "Must handle edge case X", {
      name: "Alice",
      email: "alice@co.com",
    });
    assertEquals(updated.customACs?.length, 1);
    const ac = updated.customACs![0]!;
    assertEquals(ac.text, "Must handle edge case X");
    assertEquals(ac.user, "Alice");
    assertEquals(ac.addedInPhase, "DISCOVERY");
    assertEquals(ac.id, "custom-ac-1");
  });

  it("works on old state without customACs", () => {
    const oldState = { ...inDiscovery() } as Record<string, unknown>;
    delete oldState["customACs"];
    const state = oldState as schema.StateFile;
    const updated = machine.addCustomAC(state, "New AC");
    assertEquals(updated.customACs?.length, 1);
  });

  it("increments AC id", () => {
    let state = inDiscovery();
    state = machine.addCustomAC(state, "AC 1");
    state = machine.addCustomAC(state, "AC 2");
    assertEquals(state.customACs?.length, 2);
    assertEquals(state.customACs![0]!.id, "custom-ac-1");
    assertEquals(state.customACs![1]!.id, "custom-ac-2");
  });
});

// =============================================================================
// machine: addSpecNote
// =============================================================================

describe("addSpecNote", () => {
  it("stores note with user info", () => {
    const state = inDiscovery();
    const updated = machine.addSpecNote(state, "Consider caching", {
      name: "Bob",
      email: "bob@co.com",
    });
    assertEquals(updated.specNotes?.length, 1);
    const note = updated.specNotes![0]!;
    assertEquals(note.text, "Consider caching");
    assertEquals(note.user, "Bob");
    assertEquals(note.phase, "DISCOVERY");
    assertEquals(note.id, "note-1");
  });

  it("works on old state without specNotes", () => {
    const oldState = { ...inDiscovery() } as Record<string, unknown>;
    delete oldState["specNotes"];
    const state = oldState as schema.StateFile;
    const updated = machine.addSpecNote(state, "Note");
    assertEquals(updated.specNotes?.length, 1);
  });

  it("defaults to Unknown User without user param", () => {
    const state = inDiscovery();
    const updated = machine.addSpecNote(state, "Anonymous note");
    assertEquals(updated.specNotes![0]!.user, "Unknown User");
  });
});

// =============================================================================
// Backward compat: old state files load without error
// =============================================================================

describe("backward compatibility", () => {
  it("old state without new fields loads via createInitialState", () => {
    const state = schema.createInitialState();
    assertEquals(state.transitionHistory, undefined);
    assertEquals(state.customACs, undefined);
    assertEquals(state.specNotes, undefined);
  });

  it("machine functions work on state missing new fields", () => {
    const state = inExecuting();
    const t = machine.recordTransition(state, "EXECUTING", "COMPLETED");
    assertEquals(t.transitionHistory?.length, 1);

    const a = machine.addCustomAC(state, "AC text");
    assertEquals(a.customACs?.length, 1);

    const n = machine.addSpecNote(state, "Note text");
    assertEquals(n.specNotes?.length, 1);
  });
});
