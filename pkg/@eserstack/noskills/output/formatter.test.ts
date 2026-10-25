// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Tests for the human-readable `next` formats: the validator block.
 */

import * as bdd from "@std/testing/bdd";
import * as assert from "@eserstack/test-kit/assert";
import * as formatter from "./formatter.ts";
import type * as transitionValidation from "../context/transition-validation.ts";

const TRANSITION: transitionValidation.ValidatedTransition = {
  id: "spec-proposal",
  from: "SPEC_PROPOSAL",
  to: "SPEC_APPROVED",
  approval: "The user approves the spec draft.",
};

const reviewed: transitionValidation.ReviewedValidation = {
  status: "reviewed",
  transition: TRANSITION,
  agent: "anthropic",
  model: "claude-opus-4-1",
  summary: "One gap.",
  findings: [
    {
      severity: "high",
      issue: "Task 2 has no acceptance criterion.",
      suggestion: "Add one.",
    },
  ],
  instruction: "Present the findings.",
};

const skipped: transitionValidation.SkippedValidation = {
  status: "skipped",
  transition: TRANSITION,
  agent: null,
  model: null,
  reason: "noskills.validate.model in .eser/manifest.yml is missing.",
  instruction: "Tell the user.",
};

bdd.describe("formatter: the validation block", () => {
  bdd.it("lists the findings in markdown", () => {
    const text = formatter.format(
      { phase: "SPEC_PROPOSAL", validation: reviewed },
      "markdown",
    );

    assert.assertStringIncludes(
      text,
      "## Validation (anthropic, claude-opus-4-1)\n\nOne gap.\n\n" +
        "- [high] Task 2 has no acceptance criterion. Suggestion: Add one.",
    );
  });

  bdd.it("says why a validation was skipped in text", () => {
    const text = formatter.format(
      { phase: "SPEC_PROPOSAL", validation: skipped },
      "text",
    );

    assert.assertStringIncludes(
      text,
      "Validation (not run): Skipped: noskills.validate.model in .eser/manifest.yml is missing.",
    );
  });

  bdd.it("says a clean review found nothing", () => {
    const text = formatter.format(
      {
        phase: "SPEC_PROPOSAL",
        validation: { ...reviewed, findings: [] },
      },
      "text",
    );

    assert.assertStringIncludes(text, "One gap. No findings.");
  });
});

// TASK-329: the criteria and debt items are objects, and both formats printed
// "[object Object]" for each of them.
bdd.describe("formatter: acceptance criteria and debt", () => {
  const data = {
    phase: "EXECUTING",
    statusReport: {
      criteria: [{ id: "ac-1", text: "Uploads over 10 MB are refused" }],
      reportFormat: { completed: "", remaining: "", blocked: "" },
    },
    previousIterationDebt: {
      fromIteration: 2,
      items: [{ id: "debt-1", text: "Add the size check test", since: 2 }],
      note: "Address these first.",
    },
  };

  bdd.it("names each criterion and debt item in markdown", () => {
    const text = formatter.format(data, "markdown");

    assert.assertStringIncludes(
      text,
      "- [ ] ac-1: Uploads over 10 MB are refused",
    );
    assert.assertStringIncludes(text, "- debt-1: Add the size check test");
    assert.assertEquals(text.includes("[object Object]"), false, text);
  });

  bdd.it("names each criterion and debt item in text", () => {
    const text = formatter.format(data, "text");

    assert.assertStringIncludes(
      text,
      "  - ac-1: Uploads over 10 MB are refused",
    );
    assert.assertStringIncludes(text, "  - debt-1: Add the size check test");
    assert.assertEquals(text.includes("[object Object]"), false, text);
  });
});
