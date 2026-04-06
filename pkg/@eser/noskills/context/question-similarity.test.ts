// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Tests for the Jaccard word-overlap similarity helper used by the
 * post-ask-user-question hook.
 */

import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals } from "@std/assert";
import {
  compareQuestions,
  SIMILARITY_EXACT_THRESHOLD,
} from "./question-similarity.ts";

describe("question-similarity", () => {
  it("returns 1 for identical strings", () => {
    const text = "What does the user want to accomplish today?";
    assertEquals(compareQuestions(text, text), 1);
  });

  it("returns 0 for completely disjoint vocabulary", () => {
    assertEquals(
      compareQuestions("alpha bravo charlie", "delta echo foxtrot"),
      0,
    );
  });

  it("returns 0 when either input is empty", () => {
    assertEquals(compareQuestions("", "anything goes here"), 0);
    assertEquals(compareQuestions("anything goes here", ""), 0);
    assertEquals(compareQuestions("", ""), 0);
  });

  it("is case insensitive", () => {
    assertEquals(
      compareQuestions(
        "What does the User do",
        "what does the user DO",
      ),
      1,
    );
  });

  it("ignores punctuation", () => {
    const sim = compareQuestions(
      "What does, the user do?",
      "What does the user do",
    );
    assert(
      sim >= SIMILARITY_EXACT_THRESHOLD,
      `expected sim >= ${SIMILARITY_EXACT_THRESHOLD}, got ${sim}`,
    );
  });

  it("exports SIMILARITY_EXACT_THRESHOLD as a number", () => {
    assertEquals(typeof SIMILARITY_EXACT_THRESHOLD, "number");
    assert(SIMILARITY_EXACT_THRESHOLD > 0 && SIMILARITY_EXACT_THRESHOLD <= 1);
  });

  it("returns a partial-match score below the exact threshold for loosely related questions", () => {
    const sim = compareQuestions(
      "What does the user do today?",
      "What's happening today?",
    );
    assert(sim > 0, `expected sim > 0, got ${sim}`);
    assert(
      sim < SIMILARITY_EXACT_THRESHOLD,
      `expected sim < ${SIMILARITY_EXACT_THRESHOLD}, got ${sim}`,
    );
  });
});
