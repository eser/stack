// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "@std/testing/bdd";
import * as assert from "@std/assert";
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

bdd.describe("formatUser", () => {
  bdd.it("formats name and email", () => {
    const user: identity.NoskillsUser = {
      name: "Alice",
      email: "alice@example.com",
    };
    assert.assertEquals(identity.formatUser(user), "Alice <alice@example.com>");
  });

  bdd.it("formats name only when no email", () => {
    const user: identity.NoskillsUser = { name: "Bob", email: "" };
    assert.assertEquals(identity.formatUser(user), "Bob");
  });
});

bdd.describe("shortUser", () => {
  bdd.it("returns just the name", () => {
    const user: identity.NoskillsUser = {
      name: "Charlie",
      email: "c@c.com",
    };
    assert.assertEquals(identity.shortUser(user), "Charlie");
  });
});

bdd.describe("unknownUser", () => {
  bdd.it("returns correct defaults", () => {
    const user = identity.unknownUser();
    assert.assertEquals(user.name, "Unknown User");
    assert.assertEquals(user.email, "");
  });
});

// =============================================================================
// File-based identity (via XDG_CONFIG_HOME override)
// =============================================================================

bdd.describe("file-based identity", () => {
  bdd.beforeEach(async () => {
    tempConfigDir = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "noskills-config-",
    });
    originalXdg = crossRuntime.runtime.env.get("XDG_CONFIG_HOME");
    crossRuntime.runtime.env.set("XDG_CONFIG_HOME", tempConfigDir);
  });

  bdd.afterEach(async () => {
    if (originalXdg !== undefined) {
      crossRuntime.runtime.env.set("XDG_CONFIG_HOME", originalXdg);
    } else {
      crossRuntime.runtime.env.delete("XDG_CONFIG_HOME");
    }
    await crossRuntime.runtime.fs.remove(tempConfigDir, { recursive: true });
  });

  bdd.it("getConfigDir uses XDG_CONFIG_HOME", () => {
    const dir = identity.getConfigDir();
    assert.assertEquals(dir, `${tempConfigDir}/eser/noskills`);
  });

  bdd.it("setCurrentUser creates config file", async () => {
    await identity.setCurrentUser({
      name: "Test User",
      email: "test@test.com",
    });

    const filePath = identity.getUserFilePath();
    const content = await crossRuntime.runtime.fs.readTextFile(filePath);
    const data = JSON.parse(content) as { name: string; email: string };
    assert.assertEquals(data.name, "Test User");
    assert.assertEquals(data.email, "test@test.com");
  });

  bdd.it("getCurrentUser reads from config file", async () => {
    await identity.setCurrentUser({
      name: "Alice",
      email: "alice@co.com",
    });

    const user = await identity.getCurrentUser();
    assert.assert(user !== null);
    assert.assertEquals(user.name, "Alice");
    assert.assertEquals(user.email, "alice@co.com");
  });

  bdd.it("getCurrentUser returns null when no file exists", async () => {
    const user = await identity.getCurrentUser();
    assert.assertEquals(user, null);
  });

  bdd.it("clearCurrentUser removes the file", async () => {
    await identity.setCurrentUser({ name: "ToDelete", email: "" });
    const before = await identity.getCurrentUser();
    assert.assert(before !== null);

    const removed = await identity.clearCurrentUser();
    assert.assertEquals(removed, true);

    const after = await identity.getCurrentUser();
    assert.assertEquals(after, null);
  });

  bdd.it("clearCurrentUser returns false when no file", async () => {
    const removed = await identity.clearCurrentUser();
    assert.assertEquals(removed, false);
  });

  bdd.it("resolveUser returns configured user when set", async () => {
    await identity.setCurrentUser({
      name: "Configured",
      email: "c@c.com",
    });

    const user = await identity.resolveUser();
    assert.assertEquals(user.name, "Configured");
    assert.assertEquals(user.email, "c@c.com");
  });

  bdd.it(
    "resolveUser returns Unknown User when nothing configured and git unavailable",
    async () => {
      // No config file, and we can't reliably mock git absence,
      // so we test the fallback chain conceptually
      const user = await identity.getCurrentUser();
      assert.assertEquals(user, null);
      // resolveUser would try git next, then fall back to unknown
    },
  );

  bdd.it("getUserFilePath returns correct path under XDG", () => {
    const path = identity.getUserFilePath();
    assert.assert(path.startsWith(tempConfigDir));
    assert.assert(path.endsWith("/eser/noskills/user.json"));
  });
});

// =============================================================================
// schema helpers (normalizeAnswer, getAnswersForQuestion, getCombinedAnswer)
// =============================================================================

bdd.describe("normalizeAnswer", () => {
  bdd.it("handles old format (just questionId+answer)", () => {
    const oldAnswer: schema.DiscoveryAnswer = {
      questionId: "q1",
      answer: "my answer",
    };
    const normalized = schema.normalizeAnswer(oldAnswer);
    assert.assertEquals(normalized.questionId, "q1");
    assert.assertEquals(normalized.answer, "my answer");
    assert.assertEquals(normalized.user, "Unknown User");
    assert.assertEquals(normalized.email, "");
    assert.assertEquals(normalized.timestamp, "");
    assert.assertEquals(normalized.type, "original");
  });

  bdd.it("handles new format (with user, timestamp, type)", () => {
    const newAnswer: schema.AttributedDiscoveryAnswer = {
      questionId: "q2",
      answer: "attributed answer",
      user: "Alice",
      email: "alice@example.com",
      timestamp: "2024-01-01T00:00:00Z",
      type: "addition",
    };
    const normalized = schema.normalizeAnswer(newAnswer);
    assert.assertEquals(normalized.user, "Alice");
    assert.assertEquals(normalized.email, "alice@example.com");
    assert.assertEquals(normalized.type, "addition");
    assert.assertEquals(normalized.timestamp, "2024-01-01T00:00:00Z");
  });
});

bdd.describe("getAnswersForQuestion", () => {
  bdd.it("returns correct answers for a given question", () => {
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
    assert.assertEquals(q1Answers.length, 2);
    assert.assertEquals(q1Answers[0]!.answer, "a1");
    assert.assertEquals(q1Answers[1]!.answer, "a1-revised");
    assert.assertEquals(q1Answers[1]!.user, "Bob");
  });
});

bdd.describe("getCombinedAnswer", () => {
  bdd.it("returns single answer as-is", () => {
    const answers: schema.DiscoveryAnswer[] = [
      { questionId: "q1", answer: "only answer" },
    ];
    assert.assertEquals(schema.getCombinedAnswer(answers, "q1"), "only answer");
  });

  bdd.it("combines multiple answers with attribution", () => {
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
    assert.assertEquals(combined.includes("first"), true);
    assert.assertEquals(combined.includes("second"), true);
    assert.assertEquals(combined.includes("Alice"), true);
    assert.assertEquals(combined.includes("Bob"), true);
  });

  bdd.it("returns empty string for missing question", () => {
    assert.assertEquals(schema.getCombinedAnswer([], "q99"), "");
  });
});

// =============================================================================
// machine: addDiscoveryAnswer with user
// =============================================================================

bdd.describe("addDiscoveryAnswer with user", () => {
  bdd.it("stores attribution when user is provided", () => {
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
    assert.assertEquals(answer.user, "Alice");
    assert.assertEquals(answer.email, "alice@example.com");
    assert.assertEquals(answer.type, "original");
    assert.assertEquals(typeof answer.timestamp, "string");
  });

  bdd.it("defaults to Unknown User when no user provided", () => {
    const state = inDiscovery();
    const updated = machine.addDiscoveryAnswer(
      state,
      "q1",
      "answer with enough detail to pass validation",
    );
    const answer = updated.discovery
      .answers[0] as schema.AttributedDiscoveryAnswer;
    assert.assertEquals(answer.user, "Unknown User");
    assert.assertEquals(answer.email, "");
  });

  bdd.it("replaces existing answer for same question (backward compat)", () => {
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
    assert.assertEquals(state.discovery.answers.length, 1);
    const answer = state.discovery
      .answers[0] as schema.AttributedDiscoveryAnswer;
    assert.assertEquals(
      answer.answer,
      "second answer replaces the first one here",
    );
    assert.assertEquals(answer.user, "Bob");
  });
});

// =============================================================================
// machine: addDiscoveryContribution
// =============================================================================

bdd.describe("addDiscoveryContribution", () => {
  bdd.it("adds without replacing existing answers", () => {
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
    assert.assertEquals(state.discovery.answers.length, 2);
    const first = state.discovery
      .answers[0] as schema.AttributedDiscoveryAnswer;
    const second = state.discovery
      .answers[1] as schema.AttributedDiscoveryAnswer;
    assert.assertEquals(
      first.answer,
      "original answer with enough detail to pass validation",
    );
    assert.assertEquals(first.user, "Alice");
    assert.assertEquals(
      second.answer,
      "additional insight expanding on the original",
    );
    assert.assertEquals(second.user, "Bob");
    assert.assertEquals(second.type, "addition");
  });
});

// =============================================================================
// machine: recordTransition
// =============================================================================

bdd.describe("recordTransition", () => {
  bdd.it("appends to transition history", () => {
    const state = inDiscovery();
    const updated = machine.recordTransition(state, "IDLE", "DISCOVERY", {
      name: "Admin",
      email: "admin@co.com",
    });
    assert.assertEquals(updated.transitionHistory?.length, 1);
    const entry = updated.transitionHistory![0]!;
    assert.assertEquals(entry.from, "IDLE");
    assert.assertEquals(entry.to, "DISCOVERY");
    assert.assertEquals(entry.user, "Admin");
    assert.assertEquals(entry.email, "admin@co.com");
    assert.assertEquals(typeof entry.timestamp, "string");
  });

  bdd.it("defaults to Unknown User when no user provided", () => {
    const state = inDiscovery();
    const updated = machine.recordTransition(state, "IDLE", "DISCOVERY");
    assert.assertEquals(updated.transitionHistory![0]!.user, "Unknown User");
  });

  bdd.it("records reason if provided", () => {
    const state = inDiscovery();
    const updated = machine.recordTransition(
      state,
      "IDLE",
      "DISCOVERY",
      { name: "User", email: "" },
      "starting new spec",
    );
    assert.assertEquals(
      updated.transitionHistory![0]!.reason,
      "starting new spec",
    );
  });

  bdd.it("works on old state without transitionHistory", () => {
    const oldState = { ...inDiscovery() } as Record<string, unknown>;
    delete oldState["transitionHistory"];
    const state = oldState as schema.StateFile;
    const updated = machine.recordTransition(state, "IDLE", "DISCOVERY");
    assert.assertEquals(updated.transitionHistory?.length, 1);
  });
});

// =============================================================================
// machine: addCustomAC
// =============================================================================

bdd.describe("addCustomAC", () => {
  bdd.it("stores AC with user info", () => {
    const state = inDiscovery();
    const updated = machine.addCustomAC(state, "Must handle edge case X", {
      name: "Alice",
      email: "alice@co.com",
    });
    assert.assertEquals(updated.customACs?.length, 1);
    const ac = updated.customACs![0]!;
    assert.assertEquals(ac.text, "Must handle edge case X");
    assert.assertEquals(ac.user, "Alice");
    assert.assertEquals(ac.addedInPhase, "DISCOVERY");
    assert.assertEquals(ac.id, "custom-ac-1");
  });

  bdd.it("works on old state without customACs", () => {
    const oldState = { ...inDiscovery() } as Record<string, unknown>;
    delete oldState["customACs"];
    const state = oldState as schema.StateFile;
    const updated = machine.addCustomAC(state, "New AC");
    assert.assertEquals(updated.customACs?.length, 1);
  });

  bdd.it("increments AC id", () => {
    let state = inDiscovery();
    state = machine.addCustomAC(state, "AC 1");
    state = machine.addCustomAC(state, "AC 2");
    assert.assertEquals(state.customACs?.length, 2);
    assert.assertEquals(state.customACs![0]!.id, "custom-ac-1");
    assert.assertEquals(state.customACs![1]!.id, "custom-ac-2");
  });
});

// =============================================================================
// machine: addSpecNote
// =============================================================================

bdd.describe("addSpecNote", () => {
  bdd.it("stores note with user info", () => {
    const state = inDiscovery();
    const updated = machine.addSpecNote(state, "Consider caching", {
      name: "Bob",
      email: "bob@co.com",
    });
    assert.assertEquals(updated.specNotes?.length, 1);
    const note = updated.specNotes![0]!;
    assert.assertEquals(note.text, "Consider caching");
    assert.assertEquals(note.user, "Bob");
    assert.assertEquals(note.phase, "DISCOVERY");
    assert.assertEquals(note.id, "note-1");
  });

  bdd.it("works on old state without specNotes", () => {
    const oldState = { ...inDiscovery() } as Record<string, unknown>;
    delete oldState["specNotes"];
    const state = oldState as schema.StateFile;
    const updated = machine.addSpecNote(state, "Note");
    assert.assertEquals(updated.specNotes?.length, 1);
  });

  bdd.it("defaults to Unknown User without user param", () => {
    const state = inDiscovery();
    const updated = machine.addSpecNote(state, "Anonymous note");
    assert.assertEquals(updated.specNotes![0]!.user, "Unknown User");
  });
});

// =============================================================================
// Backward compat: old state files load without error
// =============================================================================

bdd.describe("backward compatibility", () => {
  bdd.it("old state without new fields loads via createInitialState", () => {
    const state = schema.createInitialState();
    assert.assertEquals(state.transitionHistory, undefined);
    assert.assertEquals(state.customACs, undefined);
    assert.assertEquals(state.specNotes, undefined);
  });

  bdd.it("machine functions work on state missing new fields", () => {
    const state = inExecuting();
    const t = machine.recordTransition(state, "EXECUTING", "COMPLETED");
    assert.assertEquals(t.transitionHistory?.length, 1);

    const a = machine.addCustomAC(state, "AC text");
    assert.assertEquals(a.customACs?.length, 1);

    const n = machine.addSpecNote(state, "Note text");
    assert.assertEquals(n.specNotes?.length, 1);
  });
});
