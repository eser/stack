// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import * as questions from "./questions.ts";
import type * as schema from "../state/schema.ts";
import { loadDefaultConcerns } from "./concerns.ts";

// =============================================================================
// Helpers
// =============================================================================

const allConcerns = await loadDefaultConcerns();
const noConcerns: readonly schema.ConcernDefinition[] = [];

const openSourceConcern = allConcerns.find((c) => c.id === "open-source")!;
const beautifulConcern = allConcerns.find(
  (c) => c.id === "beautiful-product",
)!;

const allAnswers = (): readonly schema.DiscoveryAnswer[] =>
  questions.QUESTIONS.map((q) => ({
    questionId: q.id,
    answer: `answer-${q.id}`,
  }));

// =============================================================================
// getQuestionsWithExtras
// =============================================================================

describe("getQuestionsWithExtras", () => {
  it("returns 6 base questions when no concerns active", () => {
    const result = questions.getQuestionsWithExtras(noConcerns);

    assertEquals(result.length, 6);
    assertEquals(result[0]?.id, "status_quo");
    assertEquals(result[5]?.id, "scope_boundary");
  });

  it("injects extras from active concerns", () => {
    const result = questions.getQuestionsWithExtras([openSourceConcern]);
    const statusQuo = result.find((q) => q.id === "status_quo")!;

    assertEquals(statusQuo.extras.length > 0, true);
    assertEquals(
      statusQuo.extras[0]?.text,
      "Is this workaround common in the community?",
    );
  });

  it("multiple concerns stack extras on same question", () => {
    const result = questions.getQuestionsWithExtras([
      openSourceConcern,
      beautifulConcern,
    ]);
    const statusQuo = result.find((q) => q.id === "status_quo")!;

    // open-source adds 1 extra for status_quo, beautiful-product adds 1
    assertEquals(statusQuo.extras.length, 2);
  });
});

// =============================================================================
// getNextUnanswered
// =============================================================================

describe("getNextUnanswered", () => {
  it("returns first question when no answers exist", () => {
    const qs = questions.getQuestionsWithExtras(noConcerns);
    const next = questions.getNextUnanswered(qs, []);

    assertEquals(next?.id, "status_quo");
  });

  it("skips answered questions and returns next unanswered", () => {
    const qs = questions.getQuestionsWithExtras(noConcerns);
    const answers: schema.DiscoveryAnswer[] = [
      { questionId: "status_quo", answer: "done" },
    ];
    const next = questions.getNextUnanswered(qs, answers);

    assertEquals(next?.id, "ambition");
  });

  it("returns null when all questions answered", () => {
    const qs = questions.getQuestionsWithExtras(noConcerns);
    const next = questions.getNextUnanswered(qs, allAnswers());

    assertEquals(next, null);
  });
});

// =============================================================================
// isDiscoveryComplete
// =============================================================================

describe("isDiscoveryComplete", () => {
  it("returns false with partial answers", () => {
    const partial: schema.DiscoveryAnswer[] = [
      { questionId: "status_quo", answer: "x" },
      { questionId: "ambition", answer: "x" },
    ];

    assertEquals(questions.isDiscoveryComplete(partial), false);
  });

  it("returns true when all 6 base questions answered", () => {
    assertEquals(questions.isDiscoveryComplete(allAnswers()), true);
  });

  it("returns true even with extra unknown questionIds", () => {
    const answers = [
      ...allAnswers(),
      { questionId: "unknown_extra", answer: "x" },
    ];

    assertEquals(questions.isDiscoveryComplete(answers), true);
  });
});
