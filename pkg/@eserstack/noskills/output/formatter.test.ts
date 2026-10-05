// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Tests for the human-readable `next` formats: the validator block.
 */

import * as bdd from "@std/testing/bdd";
import * as assert from "@std/assert";
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
  findings: [{
    severity: "high",
    issue: "Task 2 has no acceptance criterion.",
    suggestion: "Add one.",
  }],
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
