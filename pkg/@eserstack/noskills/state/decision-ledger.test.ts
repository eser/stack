// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "@std/testing/bdd";
import * as assert from "@eserstack/test-kit/assert";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as schema from "./schema.ts";
import * as persistence from "./persistence.ts";
import * as ledger from "./decision-ledger.ts";

// =============================================================================
// Helpers
// =============================================================================

const base = (overrides: Partial<schema.StateFile> = {}): schema.StateFile => ({
  ...schema.createInitialState(),
  ...overrides,
});

const withDiscovery = (
  state: schema.StateFile,
  discovery: Partial<schema.DiscoveryState>,
): schema.StateFile => ({
  ...state,
  discovery: { ...state.discovery, ...discovery },
});

const answer = (
  questionId: string,
  text: string,
  source?: "STATED" | "INFERRED" | "CONFIRMED",
  type: "original" | "addition" | "revision" = "original",
): schema.AttributedDiscoveryAnswer => ({
  questionId,
  answer: text,
  user: "Tester",
  email: "t@example.com",
  timestamp: "2024-01-01T00:00:00.000Z",
  type,
  source,
});

const answers = (
  list: readonly schema.AttributedDiscoveryAnswer[],
): readonly schema.DiscoveryAnswer[] =>
  list as readonly schema.DiscoveryAnswer[];

const manifest = (
  overrides: Partial<schema.NosManifest> = {},
): schema.NosManifest => ({
  concerns: [],
  tools: [],
  providers: [],
  project: { languages: [], frameworks: [], ci: [], testRunner: null },
  maxIterationsBeforeRestart: 30,
  verifyCommand: null,
  allowGit: false,
  command: "noskills",
  ...overrides,
});

/** Assert a single-record diff and return that record (narrowed non-null). */
const only = (recs: readonly ledger.LedgerRecord[]): ledger.LedgerRecord => {
  assert.assertEquals(recs.length, 1);
  return recs[0]!;
};

const mkRecord = (
  id: string,
  provenance: ledger.LedgerProvenance,
  category: ledger.LedgerCategory,
): ledger.LedgerRecord => ({
  id,
  state: "DISCOVERY",
  category,
  question: "q",
  resolution: "r",
  provenance,
  timestamp: "2024-01-01T00:00:00.000Z",
  artifacts: [],
});

let tempCounter = 0;
const makeTempDir = async (): Promise<string> => {
  const dbase = await runtime.fs.makeTempDir();
  const dir = `${dbase}/noskills-ledger-test-${tempCounter++}`;
  await persistence.scaffoldEserDir(dir);
  return dir;
};

// =============================================================================
// diffDecisions — discovery answers
// =============================================================================

bdd.describe("diffDecisions: discovery answers", () => {
  bdd.it(
    "records a STATED answer as ratified with the correct category",
    () => {
      const prev = base({ spec: "s", phase: "DISCOVERY" });
      const next = withDiscovery(prev, {
        answers: answers([answer("scope_boundary", "Not X", "STATED")]),
      });

      const rec = only(ledger.diffDecisions(prev, next, null));
      assert.assertEquals(rec.provenance, "ratified");
      assert.assertEquals(rec.category, "out-of-scope");
      assert.assertEquals(rec.resolution, "Not X");
      assert.assertEquals(rec.state, "DISCOVERY");
    },
  );

  bdd.it("maps every base questionId to its category", () => {
    const expected: Record<string, ledger.LedgerCategory> = {
      status_quo: "scope",
      ambition: "scope",
      reversibility: "constraint",
      user_impact: "constraint",
      verification: "acceptance-criteria",
      scope_boundary: "out-of-scope",
    };
    for (const [qid, category] of Object.entries(expected)) {
      const prev = base({ spec: "s", phase: "DISCOVERY" });
      const next = withDiscovery(prev, {
        answers: answers([answer(qid, "a", "STATED")]),
      });
      const rec = only(ledger.diffDecisions(prev, next, null));
      assert.assertEquals(rec.category, category, `${qid} → ${category}`);
    }
  });

  bdd.it(
    "treats INFERRED and unattributed answers as inferred (never ratified)",
    () => {
      const prev = base({ spec: "s", phase: "DISCOVERY" });
      const inferred = withDiscovery(prev, {
        answers: answers([answer("ambition", "a", "INFERRED")]),
      });
      const undefSource = withDiscovery(prev, {
        answers: answers([answer("ambition", "a", undefined)]),
      });

      assert.assertEquals(
        only(ledger.diffDecisions(prev, inferred, null)).provenance,
        "inferred",
      );
      assert.assertEquals(
        only(ledger.diffDecisions(prev, undefSource, null)).provenance,
        "inferred",
      );
    },
  );

  bdd.it("maps an unknown questionId to 'other'", () => {
    const prev = base({ spec: "s", phase: "DISCOVERY" });
    const next = withDiscovery(prev, {
      answers: answers([answer("concern:extra:foo", "a", "STATED")]),
    });
    assert.assertEquals(
      only(ledger.diffDecisions(prev, next, null)).category,
      "other",
    );
  });
});

// =============================================================================
// diffDecisions — decisions
// =============================================================================

bdd.describe("diffDecisions: decisions", () => {
  bdd.it("records a split-keep decision as ratified/scope", () => {
    const prev = base({ spec: "s", phase: "DISCOVERY_REFINEMENT" });
    const next = base({
      spec: "s",
      phase: "DISCOVERY_REFINEMENT",
      decisions: [
        {
          id: "decision-split-keep-1",
          question: "Split spec?",
          choice: "keep",
          promoted: false,
          timestamp: "2024-01-02T00:00:00.000Z",
        },
      ],
    });
    const rec = only(ledger.diffDecisions(prev, next, null));
    assert.assertEquals(rec.provenance, "ratified");
    assert.assertEquals(rec.category, "scope");
  });

  bdd.it("records a BLOCKED resolution (d{n}) as ratified/dependency", () => {
    const prev = base({ spec: "s", phase: "BLOCKED" });
    const next = base({
      spec: "s",
      phase: "EXECUTING",
      decisions: [
        {
          id: "d1",
          question: "Which lib?",
          choice: "use foo",
          promoted: false,
          timestamp: "2024-01-02T00:00:00.000Z",
        },
      ],
    });
    const rec = only(ledger.diffDecisions(prev, next, null));
    assert.assertEquals(rec.provenance, "ratified");
    assert.assertEquals(rec.category, "dependency");
    assert.assertEquals(rec.state, "EXECUTING");
  });
});

// =============================================================================
// diffDecisions — transitions
// =============================================================================

bdd.describe("diffDecisions: phase transitions", () => {
  bdd.it(
    "records a new transitionHistory entry as ratified, with spec path artifact",
    () => {
      const prev = base({ spec: "s", phase: "SPEC_PROPOSAL" });
      const next = base({
        spec: "s",
        phase: "SPEC_APPROVED",
        specState: { ...prev.specState, path: ".eser/specs/s/spec.md" },
        transitionHistory: [
          {
            from: "SPEC_PROPOSAL",
            to: "SPEC_APPROVED",
            user: "Tester",
            email: "t@example.com",
            timestamp: "2024-01-03T00:00:00.000Z",
          },
        ],
      });
      const rec = only(ledger.diffDecisions(prev, next, null));
      assert.assertEquals(rec.provenance, "ratified");
      assert.assertEquals(rec.category, "acceptance-criteria");
      assert.assertEquals(rec.state, "SPEC_APPROVED");
      assert.assertEquals(rec.artifacts, [".eser/specs/s/spec.md"]);
    },
  );
});

// =============================================================================
// diffDecisions — review posture (default vs ratified)
// =============================================================================

bdd.describe("diffDecisions: review posture", () => {
  const postureState = (): schema.StateFile =>
    withDiscovery(base({ spec: "s", phase: "DISCOVERY_REFINEMENT" }), {
      refinement: { reviewPosture: "hold-scope" },
    });

  bdd.it("labels posture equal to the manifest default as 'default'", () => {
    const prev = base({ spec: "s", phase: "DISCOVERY_REFINEMENT" });
    const rec = only(
      ledger.diffDecisions(
        prev,
        postureState(),
        manifest({ defaultReviewPosture: "hold-scope" }),
      ),
    );
    assert.assertEquals(rec.provenance, "default");
    assert.assertEquals(rec.category, "scope");
  });

  bdd.it("labels a posture differing from the default as 'ratified'", () => {
    const prev = base({ spec: "s", phase: "DISCOVERY_REFINEMENT" });
    const rec = only(
      ledger.diffDecisions(
        prev,
        postureState(),
        manifest({ defaultReviewPosture: "scope-expansion" }),
      ),
    );
    assert.assertEquals(rec.provenance, "ratified");
  });

  bdd.it(
    "labels posture as 'ratified' when no manifest/default is known",
    () => {
      const prev = base({ spec: "s", phase: "DISCOVERY_REFINEMENT" });
      assert.assertEquals(
        only(ledger.diffDecisions(prev, postureState(), null)).provenance,
        "ratified",
      );
    },
  );
});

// =============================================================================
// diffDecisions — classification
// =============================================================================

bdd.describe("diffDecisions: classification", () => {
  bdd.it("records an inferred classification as inferred/constraint", () => {
    const prev = base({ spec: "s", phase: "SPEC_PROPOSAL" });
    const next = base({
      spec: "s",
      phase: "SPEC_PROPOSAL",
      classification: {
        involvesWebUI: true,
        involvesCLI: false,
        involvesPublicAPI: false,
        involvesMigration: false,
        involvesDataHandling: true,
        source: "inferred",
      },
    });
    const rec = only(ledger.diffDecisions(prev, next, null));
    assert.assertEquals(rec.provenance, "inferred");
    assert.assertEquals(rec.category, "constraint");
    assert.assertEquals(rec.resolution, "involvesDataHandling, involvesWebUI");
  });

  bdd.it("records a confirmed/manual classification as ratified", () => {
    const prev = base({ spec: "s", phase: "SPEC_PROPOSAL" });
    const next = base({
      spec: "s",
      phase: "SPEC_PROPOSAL",
      classification: {
        involvesWebUI: false,
        involvesCLI: true,
        involvesPublicAPI: false,
        involvesMigration: false,
        involvesDataHandling: false,
        source: "confirmed",
      },
    });
    assert.assertEquals(
      only(ledger.diffDecisions(prev, next, null)).provenance,
      "ratified",
    );
  });
});

// =============================================================================
// diffDecisions — custom ACs + no-op
// =============================================================================

bdd.describe("diffDecisions: custom ACs and no-op", () => {
  bdd.it("records a custom AC as ratified/acceptance-criteria", () => {
    const prev = base({ spec: "s", phase: "EXECUTING" });
    const next = base({
      spec: "s",
      phase: "EXECUTING",
      customACs: [
        {
          id: "custom-ac-1",
          text: "Must handle empty input",
          user: "Tester",
          email: "t@example.com",
          timestamp: "2024-01-04T00:00:00.000Z",
          addedInPhase: "EXECUTING",
        },
      ],
    });
    const rec = only(ledger.diffDecisions(prev, next, null));
    assert.assertEquals(rec.provenance, "ratified");
    assert.assertEquals(rec.category, "acceptance-criteria");
    assert.assertEquals(rec.state, "EXECUTING");
  });

  bdd.it("emits nothing for an identical (lastCalledAt-only) write", () => {
    const prev = withDiscovery(base({ spec: "s", phase: "DISCOVERY" }), {
      answers: answers([answer("status_quo", "a", "STATED")]),
    });
    const next = { ...prev, lastCalledAt: "2024-01-05T00:00:00.000Z" };
    assert.assertEquals(ledger.diffDecisions(prev, next, null).length, 0);
  });
});

// =============================================================================
// computeSummary
// =============================================================================

bdd.describe("computeSummary", () => {
  bdd.it("counts decisions and provenance breakdown", () => {
    const records: ledger.LedgerRecord[] = [
      mkRecord("a", "ratified", "scope"),
      mkRecord("b", "ratified", "scope"),
      mkRecord("c", "inferred", "constraint"),
      mkRecord("d", "default", "scope"),
    ];
    const summary = ledger.computeSummary(base({ spec: "s" }), records, 3);
    assert.assertEquals(summary.resolved_decisions, 4);
    assert.assertEquals(summary.provenance_breakdown, {
      ratified: 2,
      inferred: 1,
      default: 1,
    });
    assert.assertEquals(summary.open_questions, 3);
  });

  bdd.it("derives specificity from state and records", () => {
    const init = schema.createInitialState();
    const state = base({
      spec: "s",
      phase: "EXECUTING",
      specState: { ...init.specState, path: ".eser/specs/s/spec.md" },
      execution: {
        ...init.execution,
        modifiedFiles: ["a.ts", "b.ts"],
        completedTasks: ["task-1"],
      },
    });
    const records = [mkRecord("ac", "ratified", "acceptance-criteria")];
    const summary = ledger.computeSummary(state, records, 0);
    // a.ts, b.ts, task-1, spec path → 4
    assert.assertEquals(summary.specificity.named_artifacts_count, 4);
    assert.assertEquals(summary.specificity.acceptance_criteria_present, true);
    assert.assertEquals(summary.specificity.out_of_scope_present, false);
  });

  bdd.it("flags out_of_scope_present from a scope_boundary answer", () => {
    const state = withDiscovery(base({ spec: "s", phase: "DISCOVERY" }), {
      answers: answers([answer("scope_boundary", "Not X", "STATED")]),
    });
    const summary = ledger.computeSummary(state, [], 0);
    assert.assertEquals(summary.specificity.out_of_scope_present, true);
    assert.assertEquals(summary.specificity.acceptance_criteria_present, false);
  });
});

// =============================================================================
// countOpenQuestions
// =============================================================================

bdd.describe("countOpenQuestions", () => {
  bdd.it(
    "sums follow-ups, low-confidence findings, unanswered questions, tensions",
    () => {
      const state = withDiscovery(base({ spec: "s", phase: "DISCOVERY" }), {
        answers: answers([
          answer("status_quo", "a", "STATED"),
          answer("ambition", "a", "STATED"),
        ]), // 4 of 6 base questions unanswered
        followUps: [
          {
            id: "f1",
            parentQuestionId: "status_quo",
            question: "?",
            answer: null,
            status: "pending",
            createdBy: "agent",
            createdAt: "2024-01-01T00:00:00.000Z",
          },
        ],
      });
      const withFindings: schema.StateFile = {
        ...state,
        execution: {
          ...state.execution,
          confidenceFindings: [
            { finding: "x", confidence: 3, basis: "b" }, // < 5 → counts
            { finding: "y", confidence: 8, basis: "b" }, // >= 5 → ignored
          ],
        },
      };
      // 4 unanswered + 1 follow-up + 1 low-confidence + 2 tensions = 8
      assert.assertEquals(ledger.countOpenQuestions(withFindings, 2), 8);
    },
  );

  bdd.it("does not count base questions once completed", () => {
    const state = base({ spec: "s", phase: "COMPLETED" });
    assert.assertEquals(ledger.countOpenQuestions(state, 0), 0);
  });
});

// =============================================================================
// toMeasurementDraft — guided-only measurement-report/v1 projection
// =============================================================================

bdd.describe("toMeasurementDraft", () => {
  const recs: ledger.LedgerRecord[] = [
    {
      id: "ans:scope_boundary:original:1",
      state: "DISCOVERY",
      category: "out-of-scope",
      question: "What should this NOT do?",
      resolution: "No video uploads",
      provenance: "ratified",
      timestamp: "2024-01-01T00:00:00.000Z",
      artifacts: [],
    },
    {
      id: "class:involvesWebUI",
      state: "SPEC_PROPOSAL",
      category: "constraint",
      question: "Spec classification",
      resolution: "involvesWebUI",
      provenance: "inferred",
      timestamp: "",
      artifacts: [],
    },
  ];

  bdd.it(
    "projects records into a measurement-report/v1 guided draft (state→phase)",
    () => {
      const draft = ledger.toMeasurementDraft("photo-upload", recs);
      assert.assertEquals(draft.schemaVersion, "measurement-report/v1");
      assert.assertEquals(draft.specId, "photo-upload");
      assert.assertEquals(draft.guided.decisions.length, 2);
      assert.assertEquals(draft.guided.decisions[0]!.phase, "DISCOVERY");
      assert.assertEquals(draft.guided.decisions[0]!.provenance, "ratified");
      assert.assertEquals(draft.guided.decisions[1]!.phase, "SPEC_PROPOSAL");
      // timestamp/artifacts are not part of the measurement contract — dropped.
      assert.assertEquals("timestamp" in draft.guided.decisions[0]!, false);
      assert.assertEquals("artifacts" in draft.guided.decisions[0]!, false);
    },
  );

  bdd.it("yields an empty guided ledger for no records", () => {
    const draft = ledger.toMeasurementDraft("s", []);
    assert.assertEquals(draft.guided.decisions.length, 0);
    assert.assertEquals(draft.schemaVersion, "measurement-report/v1");
  });
});

// =============================================================================
// captureTransition (IO) — idempotency, dedup, resilience
// =============================================================================

bdd.describe("captureTransition", () => {
  let dir: string;
  bdd.beforeEach(async () => {
    dir = await makeTempDir();
  });
  bdd.afterEach(async () => {
    await runtime.fs.remove(dir, { recursive: true });
  });

  bdd.it("appends fresh records and writes a summary", async () => {
    const prev = base({ spec: "s", phase: "DISCOVERY" });
    const next = withDiscovery(prev, {
      answers: answers([answer("verification", "run tests", "STATED")]),
    });

    await ledger.captureTransition(dir, prev, next, null);

    const recs = await ledger.readLedger(dir, "s");
    assert.assertEquals(recs.length, 1);
    assert.assertEquals(recs[0]!.category, "acceptance-criteria");

    const summaryRaw = await runtime.fs.readTextFile(
      `${dir}/${persistence.paths.ledgerSummaryFile("s")}`,
    );
    const summary = JSON.parse(summaryRaw) as ledger.LedgerSummary;
    assert.assertEquals(summary.resolved_decisions, 1);
    assert.assertEquals(summary.specificity.acceptance_criteria_present, true);
  });

  bdd.it("is idempotent across repeated captures", async () => {
    const prev = base({ spec: "s", phase: "DISCOVERY" });
    const next = withDiscovery(prev, {
      answers: answers([answer("status_quo", "a", "STATED")]),
    });

    await ledger.captureTransition(dir, prev, next, null);
    await ledger.captureTransition(dir, prev, next, null);
    // Simulate the second back-to-back write of `next --answer` (next vs next).
    await ledger.captureTransition(dir, next, next, null);

    assert.assertEquals((await ledger.readLedger(dir, "s")).length, 1);
  });

  bdd.it(
    "accumulates across a multi-step progression, append-only",
    async () => {
      const s0 = base({ spec: "s", phase: "DISCOVERY" });
      const s1 = withDiscovery(s0, {
        answers: answers([answer("status_quo", "a", "STATED")]),
      });
      const s2 = withDiscovery(s0, {
        answers: answers([
          answer("status_quo", "a", "STATED"),
          answer("ambition", "b", "INFERRED"),
        ]),
      });

      await ledger.captureTransition(dir, s0, s1, null);
      await ledger.captureTransition(dir, s1, s2, null);

      const recs = await ledger.readLedger(dir, "s");
      assert.assertEquals(recs.length, 2);
      assert.assertEquals(recs[0]!.resolution, "a");
      assert.assertEquals(recs[1]!.resolution, "b");
      assert.assertEquals(recs[1]!.provenance, "inferred");
    },
  );

  bdd.it("skips entirely when there is no spec to attribute to", async () => {
    const prev = base({ spec: null });
    const next = base({ spec: null, lastCalledAt: "2024-01-01T00:00:00.000Z" });
    await ledger.captureTransition(dir, prev, next, null);
    assert.assertEquals((await ledger.readLedger(dir, "s")).length, 0);
  });

  bdd.it("survives a malformed pre-existing ledger line", async () => {
    const valid = JSON.stringify(
      mkRecord("ans:status_quo:original:x", "ratified", "scope"),
    );
    await runtime.fs.mkdir(`${dir}/${persistence.paths.ledgerRunDir("s")}`, {
      recursive: true,
    });
    await runtime.fs.writeTextFile(
      `${dir}/${persistence.paths.ledgerFile("s")}`,
      "not json\n" + valid + "\n",
    );

    const prev = base({ spec: "s", phase: "DISCOVERY" });
    const next = withDiscovery(prev, {
      answers: answers([answer("ambition", "b", "STATED")]),
    });
    await ledger.captureTransition(dir, prev, next, null);

    const recs = await ledger.readLedger(dir, "s");
    // malformed line skipped, prior valid + new = 2 readable records
    assert.assertEquals(recs.length, 2);
  });
});

// =============================================================================
// writeSpecState wiring (end-to-end) — capture never blocks the canonical write
// =============================================================================

bdd.describe("writeSpecState integration", () => {
  let dir: string;
  bdd.beforeEach(async () => {
    dir = await makeTempDir();
  });
  bdd.afterEach(async () => {
    await runtime.fs.remove(dir, { recursive: true });
  });

  bdd.it("writes canonical spec state AND the decision ledger", async () => {
    const state = withDiscovery(base({ spec: "s", phase: "DISCOVERY" }), {
      answers: answers([answer("status_quo", "today users do X", "STATED")]),
    });

    await persistence.writeSpecState(dir, "s", state);

    // Canonical state persisted and round-trips.
    const readBack = await persistence.readSpecState(dir, "s");
    assert.assertEquals(readBack.spec, "s");
    assert.assertEquals(readBack.discovery.answers.length, 1);

    // Ledger captured the resolved decision.
    const recs = await ledger.readLedger(dir, "s");
    assert.assertEquals(recs.length, 1);
    assert.assertEquals(recs[0]!.category, "scope");
    assert.assert(recs[0]!.provenance === "ratified");
  });
});

// TASK-327: the spec name from the CLI went into the ledger path unchecked,
// so `ledger ../x` read files outside the ledger folder.
bdd.describe("ledger paths", () => {
  bdd.it(
    "a spec name that leaves the ledger folder reads nothing",
    async () => {
      const dir = await runtime.fs.makeTempDir({ prefix: "nos_ledger_path_" });
      try {
        // A ledger file one level above the ledger folder.
        const planted = `${dir}/${persistence.paths.ledgerFile("..")}`;
        await runtime.fs.mkdir(planted.slice(0, planted.lastIndexOf("/")), {
          recursive: true,
        });
        await runtime.fs.writeTextFile(
          planted,
          JSON.stringify({ id: "x", spec: "x" }) + "\n",
        );

        assert.assertEquals(await ledger.readLedger(dir, ".."), []);
        assert.assertEquals(await ledger.readLedger(dir, "../x"), []);
        assert.assertEquals(await ledger.readSummary(dir, "a/b"), null);
      } finally {
        await runtime.fs.remove(dir, { recursive: true });
      }
    },
  );
});
