// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { assert, assertEquals } from "@std/assert";
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
const only = (
  recs: readonly ledger.LedgerRecord[],
): ledger.LedgerRecord => {
  assertEquals(recs.length, 1);
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

describe("diffDecisions: discovery answers", () => {
  it("records a STATED answer as ratified with the correct category", () => {
    const prev = base({ spec: "s", phase: "DISCOVERY" });
    const next = withDiscovery(prev, {
      answers: answers([answer("scope_boundary", "Not X", "STATED")]),
    });

    const rec = only(ledger.diffDecisions(prev, next, null));
    assertEquals(rec.provenance, "ratified");
    assertEquals(rec.category, "out-of-scope");
    assertEquals(rec.resolution, "Not X");
    assertEquals(rec.state, "DISCOVERY");
  });

  it("maps every base questionId to its category", () => {
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
      assertEquals(rec.category, category, `${qid} → ${category}`);
    }
  });

  it("treats INFERRED and unattributed answers as inferred (never ratified)", () => {
    const prev = base({ spec: "s", phase: "DISCOVERY" });
    const inferred = withDiscovery(prev, {
      answers: answers([answer("ambition", "a", "INFERRED")]),
    });
    const undefSource = withDiscovery(prev, {
      answers: answers([answer("ambition", "a", undefined)]),
    });

    assertEquals(
      only(ledger.diffDecisions(prev, inferred, null)).provenance,
      "inferred",
    );
    assertEquals(
      only(ledger.diffDecisions(prev, undefSource, null)).provenance,
      "inferred",
    );
  });

  it("maps an unknown questionId to 'other'", () => {
    const prev = base({ spec: "s", phase: "DISCOVERY" });
    const next = withDiscovery(prev, {
      answers: answers([answer("concern:extra:foo", "a", "STATED")]),
    });
    assertEquals(
      only(ledger.diffDecisions(prev, next, null)).category,
      "other",
    );
  });
});

// =============================================================================
// diffDecisions — decisions
// =============================================================================

describe("diffDecisions: decisions", () => {
  it("records a split-keep decision as ratified/scope", () => {
    const prev = base({ spec: "s", phase: "DISCOVERY_REFINEMENT" });
    const next = base({
      spec: "s",
      phase: "DISCOVERY_REFINEMENT",
      decisions: [{
        id: "decision-split-keep-1",
        question: "Split spec?",
        choice: "keep",
        promoted: false,
        timestamp: "2024-01-02T00:00:00.000Z",
      }],
    });
    const rec = only(ledger.diffDecisions(prev, next, null));
    assertEquals(rec.provenance, "ratified");
    assertEquals(rec.category, "scope");
  });

  it("records a BLOCKED resolution (d{n}) as ratified/dependency", () => {
    const prev = base({ spec: "s", phase: "BLOCKED" });
    const next = base({
      spec: "s",
      phase: "EXECUTING",
      decisions: [{
        id: "d1",
        question: "Which lib?",
        choice: "use foo",
        promoted: false,
        timestamp: "2024-01-02T00:00:00.000Z",
      }],
    });
    const rec = only(ledger.diffDecisions(prev, next, null));
    assertEquals(rec.provenance, "ratified");
    assertEquals(rec.category, "dependency");
    assertEquals(rec.state, "EXECUTING");
  });
});

// =============================================================================
// diffDecisions — transitions
// =============================================================================

describe("diffDecisions: phase transitions", () => {
  it("records a new transitionHistory entry as ratified, with spec path artifact", () => {
    const prev = base({ spec: "s", phase: "SPEC_PROPOSAL" });
    const next = base({
      spec: "s",
      phase: "SPEC_APPROVED",
      specState: { ...prev.specState, path: ".eser/specs/s/spec.md" },
      transitionHistory: [{
        from: "SPEC_PROPOSAL",
        to: "SPEC_APPROVED",
        user: "Tester",
        email: "t@example.com",
        timestamp: "2024-01-03T00:00:00.000Z",
      }],
    });
    const rec = only(ledger.diffDecisions(prev, next, null));
    assertEquals(rec.provenance, "ratified");
    assertEquals(rec.category, "acceptance-criteria");
    assertEquals(rec.state, "SPEC_APPROVED");
    assertEquals(rec.artifacts, [".eser/specs/s/spec.md"]);
  });
});

// =============================================================================
// diffDecisions — review posture (default vs ratified)
// =============================================================================

describe("diffDecisions: review posture", () => {
  const postureState = (): schema.StateFile =>
    withDiscovery(base({ spec: "s", phase: "DISCOVERY_REFINEMENT" }), {
      refinement: { reviewPosture: "hold-scope" },
    });

  it("labels posture equal to the manifest default as 'default'", () => {
    const prev = base({ spec: "s", phase: "DISCOVERY_REFINEMENT" });
    const rec = only(ledger.diffDecisions(
      prev,
      postureState(),
      manifest({ defaultReviewPosture: "hold-scope" }),
    ));
    assertEquals(rec.provenance, "default");
    assertEquals(rec.category, "scope");
  });

  it("labels a posture differing from the default as 'ratified'", () => {
    const prev = base({ spec: "s", phase: "DISCOVERY_REFINEMENT" });
    const rec = only(ledger.diffDecisions(
      prev,
      postureState(),
      manifest({ defaultReviewPosture: "scope-expansion" }),
    ));
    assertEquals(rec.provenance, "ratified");
  });

  it("labels posture as 'ratified' when no manifest/default is known", () => {
    const prev = base({ spec: "s", phase: "DISCOVERY_REFINEMENT" });
    assertEquals(
      only(ledger.diffDecisions(prev, postureState(), null)).provenance,
      "ratified",
    );
  });
});

// =============================================================================
// diffDecisions — classification
// =============================================================================

describe("diffDecisions: classification", () => {
  it("records an inferred classification as inferred/constraint", () => {
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
    assertEquals(rec.provenance, "inferred");
    assertEquals(rec.category, "constraint");
    assertEquals(rec.resolution, "involvesDataHandling, involvesWebUI");
  });

  it("records a confirmed/manual classification as ratified", () => {
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
    assertEquals(
      only(ledger.diffDecisions(prev, next, null)).provenance,
      "ratified",
    );
  });
});

// =============================================================================
// diffDecisions — custom ACs + no-op
// =============================================================================

describe("diffDecisions: custom ACs and no-op", () => {
  it("records a custom AC as ratified/acceptance-criteria", () => {
    const prev = base({ spec: "s", phase: "EXECUTING" });
    const next = base({
      spec: "s",
      phase: "EXECUTING",
      customACs: [{
        id: "custom-ac-1",
        text: "Must handle empty input",
        user: "Tester",
        email: "t@example.com",
        timestamp: "2024-01-04T00:00:00.000Z",
        addedInPhase: "EXECUTING",
      }],
    });
    const rec = only(ledger.diffDecisions(prev, next, null));
    assertEquals(rec.provenance, "ratified");
    assertEquals(rec.category, "acceptance-criteria");
    assertEquals(rec.state, "EXECUTING");
  });

  it("emits nothing for an identical (lastCalledAt-only) write", () => {
    const prev = withDiscovery(base({ spec: "s", phase: "DISCOVERY" }), {
      answers: answers([answer("status_quo", "a", "STATED")]),
    });
    const next = { ...prev, lastCalledAt: "2024-01-05T00:00:00.000Z" };
    assertEquals(ledger.diffDecisions(prev, next, null).length, 0);
  });
});

// =============================================================================
// computeSummary
// =============================================================================

describe("computeSummary", () => {
  it("counts decisions and provenance breakdown", () => {
    const records: ledger.LedgerRecord[] = [
      mkRecord("a", "ratified", "scope"),
      mkRecord("b", "ratified", "scope"),
      mkRecord("c", "inferred", "constraint"),
      mkRecord("d", "default", "scope"),
    ];
    const summary = ledger.computeSummary(base({ spec: "s" }), records, 3);
    assertEquals(summary.resolved_decisions, 4);
    assertEquals(summary.provenance_breakdown, {
      ratified: 2,
      inferred: 1,
      default: 1,
    });
    assertEquals(summary.open_questions, 3);
  });

  it("derives specificity from state and records", () => {
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
    assertEquals(summary.specificity.named_artifacts_count, 4);
    assertEquals(summary.specificity.acceptance_criteria_present, true);
    assertEquals(summary.specificity.out_of_scope_present, false);
  });

  it("flags out_of_scope_present from a scope_boundary answer", () => {
    const state = withDiscovery(base({ spec: "s", phase: "DISCOVERY" }), {
      answers: answers([answer("scope_boundary", "Not X", "STATED")]),
    });
    const summary = ledger.computeSummary(state, [], 0);
    assertEquals(summary.specificity.out_of_scope_present, true);
    assertEquals(summary.specificity.acceptance_criteria_present, false);
  });
});

// =============================================================================
// countOpenQuestions
// =============================================================================

describe("countOpenQuestions", () => {
  it("sums follow-ups, low-confidence findings, unanswered questions, tensions", () => {
    const state = withDiscovery(base({ spec: "s", phase: "DISCOVERY" }), {
      answers: answers([
        answer("status_quo", "a", "STATED"),
        answer("ambition", "a", "STATED"),
      ]), // 4 of 6 base questions unanswered
      followUps: [{
        id: "f1",
        parentQuestionId: "status_quo",
        question: "?",
        answer: null,
        status: "pending",
        createdBy: "agent",
        createdAt: "2024-01-01T00:00:00.000Z",
      }],
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
    assertEquals(ledger.countOpenQuestions(withFindings, 2), 8);
  });

  it("does not count base questions once completed", () => {
    const state = base({ spec: "s", phase: "COMPLETED" });
    assertEquals(ledger.countOpenQuestions(state, 0), 0);
  });
});

// =============================================================================
// captureTransition (IO) — idempotency, dedup, resilience
// =============================================================================

describe("captureTransition", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await makeTempDir();
  });
  afterEach(async () => {
    await runtime.fs.remove(dir, { recursive: true });
  });

  it("appends fresh records and writes a summary", async () => {
    const prev = base({ spec: "s", phase: "DISCOVERY" });
    const next = withDiscovery(prev, {
      answers: answers([answer("verification", "run tests", "STATED")]),
    });

    await ledger.captureTransition(dir, prev, next, null);

    const recs = await ledger.readLedger(dir, "s");
    assertEquals(recs.length, 1);
    assertEquals(recs[0]!.category, "acceptance-criteria");

    const summaryRaw = await runtime.fs.readTextFile(
      `${dir}/${persistence.paths.ledgerSummaryFile("s")}`,
    );
    const summary = JSON.parse(summaryRaw) as ledger.LedgerSummary;
    assertEquals(summary.resolved_decisions, 1);
    assertEquals(summary.specificity.acceptance_criteria_present, true);
  });

  it("is idempotent across repeated captures", async () => {
    const prev = base({ spec: "s", phase: "DISCOVERY" });
    const next = withDiscovery(prev, {
      answers: answers([answer("status_quo", "a", "STATED")]),
    });

    await ledger.captureTransition(dir, prev, next, null);
    await ledger.captureTransition(dir, prev, next, null);
    // Simulate the second back-to-back write of `next --answer` (next vs next).
    await ledger.captureTransition(dir, next, next, null);

    assertEquals((await ledger.readLedger(dir, "s")).length, 1);
  });

  it("accumulates across a multi-step progression, append-only", async () => {
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
    assertEquals(recs.length, 2);
    assertEquals(recs[0]!.resolution, "a");
    assertEquals(recs[1]!.resolution, "b");
    assertEquals(recs[1]!.provenance, "inferred");
  });

  it("skips entirely when there is no spec to attribute to", async () => {
    const prev = base({ spec: null });
    const next = base({ spec: null, lastCalledAt: "2024-01-01T00:00:00.000Z" });
    await ledger.captureTransition(dir, prev, next, null);
    assertEquals((await ledger.readLedger(dir, "s")).length, 0);
  });

  it("survives a malformed pre-existing ledger line", async () => {
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
    assertEquals(recs.length, 2);
  });
});

// =============================================================================
// writeSpecState wiring (end-to-end) — capture never blocks the canonical write
// =============================================================================

describe("writeSpecState integration", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await makeTempDir();
  });
  afterEach(async () => {
    await runtime.fs.remove(dir, { recursive: true });
  });

  it("writes canonical spec state AND the decision ledger", async () => {
    const state = withDiscovery(base({ spec: "s", phase: "DISCOVERY" }), {
      answers: answers([answer("status_quo", "today users do X", "STATED")]),
    });

    await persistence.writeSpecState(dir, "s", state);

    // Canonical state persisted and round-trips.
    const readBack = await persistence.readSpecState(dir, "s");
    assertEquals(readBack.spec, "s");
    assertEquals(readBack.discovery.answers.length, 1);

    // Ledger captured the resolved decision.
    const recs = await ledger.readLedger(dir, "s");
    assertEquals(recs.length, 1);
    assertEquals(recs[0]!.category, "scope");
    assert(recs[0]!.provenance === "ratified");
  });
});
