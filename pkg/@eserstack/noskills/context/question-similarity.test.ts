// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Tests for the Jaccard word-overlap similarity helper used by the
 * post-ask-user-question hook.
 */

import * as bdd from "@std/testing/bdd";
import * as assert from "@eserstack/test-kit/assert";
import * as questionSimilarity from "./question-similarity.ts";

bdd.describe("question-similarity", () => {
  bdd.it("returns 1 for identical strings", () => {
    const text = "What does the user want to accomplish today?";
    assert.assertEquals(questionSimilarity.compareQuestions(text, text), 1);
  });

  bdd.it("returns 0 for completely disjoint vocabulary", () => {
    assert.assertEquals(
      questionSimilarity.compareQuestions(
        "alpha bravo charlie",
        "delta echo foxtrot",
      ),
      0,
    );
  });

  bdd.it("returns 0 when either input is empty", () => {
    assert.assertEquals(
      questionSimilarity.compareQuestions("", "anything goes here"),
      0,
    );
    assert.assertEquals(
      questionSimilarity.compareQuestions("anything goes here", ""),
      0,
    );
    assert.assertEquals(questionSimilarity.compareQuestions("", ""), 0);
  });

  bdd.it("is case insensitive", () => {
    assert.assertEquals(
      questionSimilarity.compareQuestions(
        "What does the User do",
        "what does the user DO",
      ),
      1,
    );
  });

  bdd.it("ignores punctuation", () => {
    const sim = questionSimilarity.compareQuestions(
      "What does, the user do?",
      "What does the user do",
    );
    assert.assert(
      sim >= questionSimilarity.SIMILARITY_EXACT_THRESHOLD,
      `expected sim >= ${questionSimilarity.SIMILARITY_EXACT_THRESHOLD}, got ${sim}`,
    );
  });

  bdd.it("exports SIMILARITY_EXACT_THRESHOLD as a number", () => {
    assert.assertEquals(
      typeof questionSimilarity.SIMILARITY_EXACT_THRESHOLD,
      "number",
    );
    assert.assert(
      questionSimilarity.SIMILARITY_EXACT_THRESHOLD > 0 &&
        questionSimilarity.SIMILARITY_EXACT_THRESHOLD <= 1,
    );
  });

  bdd.it(
    "returns a partial-match score below the exact threshold for loosely related questions",
    () => {
      const sim = questionSimilarity.compareQuestions(
        "What does the user do today?",
        "What's happening today?",
      );
      assert.assert(sim > 0, `expected sim > 0, got ${sim}`);
      assert.assert(
        sim < questionSimilarity.SIMILARITY_EXACT_THRESHOLD,
        `expected sim < ${questionSimilarity.SIMILARITY_EXACT_THRESHOLD}, got ${sim}`,
      );
    },
  );
});
