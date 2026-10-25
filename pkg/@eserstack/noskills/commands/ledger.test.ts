// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `ledger -o markdown` and `-o text` (TASK-329): they went through the `next`
 * renderer, which read the ledger summary as a completion summary
 * ("Spec: undefined") and never showed the records.
 *
 * @module
 */

import * as bdd from "@std/testing/bdd";
import * as assert from "@eserstack/test-kit/assert";
import type * as decisionLedger from "../state/decision-ledger.ts";
import * as ledger from "./ledger.ts";

const RECORD: decisionLedger.LedgerRecord = {
  id: "d-1",
  state: "DISCOVERY",
  category: "scope",
  question: "Which file types?",
  resolution: "JPEG and PNG",
  provenance: "ratified",
  timestamp: "2026-10-25T00:00:00.000Z",
  artifacts: [],
};

const SUMMARY: decisionLedger.LedgerSummary = {
  "resolved_decisions": 1,
  "provenance_breakdown": { ratified: 1, inferred: 0, default: 0 },
  "open_questions": 2,
  specificity: {
    "named_artifacts_count": 3,
    "acceptance_criteria_present": true,
    "out_of_scope_present": false,
  },
};

bdd.describe("noskills ledger: the human formats", () => {
  bdd.it("shows the records and the summary in markdown", () => {
    const text = ledger.formatLedger(
      { spec: "upload", records: [RECORD], summary: SUMMARY },
      "markdown",
    );

    assert.assertStringIncludes(text, "# Decision ledger: upload");
    assert.assertStringIncludes(
      text,
      "- d-1 (DISCOVERY, scope, ratified): Which file types? JPEG and PNG",
    );
    assert.assertStringIncludes(
      text,
      "- Resolved decisions: 1 (ratified 1, inferred 0, default 0)",
    );
    assert.assertStringIncludes(text, "- Open questions: 2");
    assert.assertStringIncludes(text, "- Out of scope: missing");
    assert.assertEquals(text.includes("undefined"), false, text);
  });

  bdd.it("says so when there are no records and no summary yet", () => {
    const text = ledger.formatLedger(
      { spec: "upload", records: [], summary: null },
      "text",
    );

    assert.assertStringIncludes(text, "Decision ledger: upload");
    assert.assertStringIncludes(text, "No decisions recorded.");
    assert.assertStringIncludes(text, "No summary yet.");
  });

  bdd.it("shows a measurement draft's decisions", () => {
    const text = ledger.formatMeasurementDraft(
      {
        schemaVersion: "measurement-report/v1",
        specId: "upload",
        title: "upload (live ledger)",
        guided: {
          decisions: [{
            id: "d-1",
            category: "scope",
            question: "Which file types?",
            resolution: "JPEG and PNG",
            provenance: "ratified",
            phase: "DISCOVERY",
          }],
        },
      },
      "markdown",
    );

    assert.assertStringIncludes(text, "# upload (live ledger)");
    assert.assertStringIncludes(
      text,
      "- d-1 (DISCOVERY, scope, ratified): Which file types? JPEG and PNG",
    );
  });
});
