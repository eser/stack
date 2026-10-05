// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "@std/testing/bdd";
import * as assert from "@std/assert";
import * as questions from "./questions.ts";
import * as schema from "../state/schema.ts";
import * as machine from "../state/machine.ts";
import * as defaultConcerns from "../defaults/concerns/mod.ts";

// =============================================================================
// Helpers
// =============================================================================

const allConcerns = defaultConcerns.DEFAULT_CONCERNS;
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

bdd.describe("getQuestionsWithExtras", () => {
  bdd.it("returns 6 base questions when no concerns active", () => {
    const result = questions.getQuestionsWithExtras(noConcerns);

    assert.assertEquals(result.length, 6);
    assert.assertEquals(result[0]?.id, "status_quo");
    assert.assertEquals(result[5]?.id, "scope_boundary");
  });

  bdd.it("injects extras from active concerns", () => {
    const result = questions.getQuestionsWithExtras([openSourceConcern]);
    const statusQuo = result.find((q) => q.id === "status_quo")!;

    assert.assertEquals(statusQuo.extras.length > 0, true);
    assert.assertEquals(
      statusQuo.extras[0]?.text,
      "Is this workaround common in the community?",
    );
  });

  bdd.it("multiple concerns stack extras on same question", () => {
    const result = questions.getQuestionsWithExtras([
      openSourceConcern,
      beautifulConcern,
    ]);
    const statusQuo = result.find((q) => q.id === "status_quo")!;

    // open-source adds 1 extra for status_quo, beautiful-product adds 2
    assert.assertEquals(statusQuo.extras.length, 3);
  });
});

// =============================================================================
// getNextUnanswered
// =============================================================================

bdd.describe("getNextUnanswered", () => {
  bdd.it("returns first question when no answers exist", () => {
    const qs = questions.getQuestionsWithExtras(noConcerns);
    const next = questions.getNextUnanswered(qs, []);

    assert.assertEquals(next?.id, "status_quo");
  });

  bdd.it("skips answered questions and returns next unanswered", () => {
    const qs = questions.getQuestionsWithExtras(noConcerns);
    const answers: schema.DiscoveryAnswer[] = [
      { questionId: "status_quo", answer: "done" },
    ];
    const next = questions.getNextUnanswered(qs, answers);

    assert.assertEquals(next?.id, "ambition");
  });

  bdd.it("returns null when all questions answered", () => {
    const qs = questions.getQuestionsWithExtras(noConcerns);
    const next = questions.getNextUnanswered(qs, allAnswers());

    assert.assertEquals(next, null);
  });
});

// =============================================================================
// isDiscoveryComplete
// =============================================================================

bdd.describe("isDiscoveryComplete", () => {
  bdd.it("returns false with partial answers", () => {
    const partial: schema.DiscoveryAnswer[] = [
      { questionId: "status_quo", answer: "x" },
      { questionId: "ambition", answer: "x" },
    ];

    assert.assertEquals(questions.isDiscoveryComplete(partial), false);
  });

  bdd.it("returns true when all 6 base questions answered", () => {
    assert.assertEquals(questions.isDiscoveryComplete(allAnswers()), true);
  });

  bdd.it("returns true even with extra unknown questionIds", () => {
    const answers = [
      ...allAnswers(),
      { questionId: "unknown_extra", answer: "x" },
    ];

    assert.assertEquals(questions.isDiscoveryComplete(answers), true);
  });
});

// =============================================================================
// discoveryAnswersOf
// =============================================================================

bdd.describe("discoveryAnswersOf", () => {
  bdd.it("reads a JSON object keyed by question id", () => {
    assert.assertEquals(
      questions.discoveryAnswersOf(
        JSON.stringify({ status_quo: "Uploads go by email", ambition: "" }),
      ),
      { status_quo: "Uploads go by email" },
    );
  });

  const plainCases = [
    { name: "a sentence", answer: "Users upload files by email today" },
    { name: "a JSON array", answer: '["status_quo"]' },
    { name: "a JSON string", answer: '"status_quo"' },
    { name: "JSON null", answer: "null" },
  ];

  for (const { name, answer } of plainCases) {
    bdd.it(`gives null for ${name}, which answers one question`, () => {
      assert.assertEquals(questions.discoveryAnswersOf(answer), null);
    });
  }

  bdd.it("refuses a key that is not a question id", () => {
    const error = assert.assertThrows(
      () =>
        questions.discoveryAnswersOf(
          JSON.stringify({ statusquo: "Uploads go by email today" }),
        ),
      questions.DiscoveryAnswerError,
    );
    assert.assertStringIncludes(error.message, '"statusquo"');
    assert.assertStringIncludes(error.message, "status_quo");
  });

  bdd.it("refuses an object with no answer", () => {
    assert.assertThrows(
      () => questions.discoveryAnswersOf(JSON.stringify({ status_quo: "" })),
      questions.DiscoveryAnswerError,
      "holds no answer",
    );
  });

  bdd.it("refuses a value that is not text", () => {
    assert.assertThrows(
      () => questions.discoveryAnswersOf(JSON.stringify({ ambition: 10 })),
      questions.DiscoveryAnswerError,
      '"ambition"',
    );
  });
});

// =============================================================================
// discoveryStageOf
// =============================================================================

bdd.describe("discoveryStageOf", () => {
  const inDiscovery = (
    description: string | null,
    discovery: Partial<schema.DiscoveryState> = {},
  ): schema.StateFile => {
    const state = machine.startSpec(
      schema.createInitialState(),
      "test-spec",
      "spec/test-spec",
      description ?? undefined,
    );

    return { ...state, discovery: { ...state.discovery, ...discovery } };
  };

  const cases: readonly {
    readonly name: string;
    readonly state: () => schema.StateFile;
    readonly expected: questions.DiscoveryStage;
  }[] = [
    {
      name: "listens first on a new spec with a description",
      state: () => inDiscovery("Add photo upload"),
      expected: "listen",
    },
    {
      name: "asks for the mode once the user shared context",
      state: () =>
        inDiscovery("Add photo upload", { userContext: ["Mobile first"] }),
      expected: "mode",
    },
    {
      name: "challenges the premises once a mode is chosen",
      state: () => inDiscovery("Add photo upload", { mode: "full" }),
      expected: "premises",
    },
    {
      name: "asks the questions once the premises are done",
      state: () =>
        inDiscovery("Add photo upload", {
          mode: "full",
          premisesCompleted: true,
        }),
      expected: "questions",
    },
    {
      name: "asks the questions for a spec without a description",
      state: () => inDiscovery(null),
      expected: "questions",
    },
    {
      name: "asks the questions when a plan was imported",
      state: () => inDiscovery("Add photo upload", { planPath: "plan.md" }),
      expected: "questions",
    },
    {
      name: "stays on the questions once every base question is answered",
      state: () =>
        inDiscovery("Add photo upload", {
          mode: "full",
          answers: allAnswers(),
        }),
      expected: "questions",
    },
  ];

  for (const { name, state, expected } of cases) {
    bdd.it(name, () => {
      assert.assertEquals(questions.discoveryStageOf(state()), expected);
    });
  }
});
