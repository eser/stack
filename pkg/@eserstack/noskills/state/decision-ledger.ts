// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Decision ledger — deterministic, additive instrumentation that observes the
 * data already flowing through the noskills state machine and persists, per
 * spec, an append-only ledger of resolved decisions plus a regenerated summary.
 *
 * This module is OBSERVE-ONLY: it never changes state-machine behavior, uses no
 * LLM/sub-agent, and is fully fault-isolated — any failure here must never break
 * or alter a run. Capture attaches at the single persistence choke point
 * ({@link "./persistence.ts" writeSpecState}) which diffs the previous on-disk
 * spec state against the state about to be written. Every resolved decision is
 * attributed to exactly one provenance — `ratified` (user confirmed), `inferred`
 * (agent derived without confirmation), or `default` (tool/operator default) —
 * and an inferred/defaulted decision is NEVER labeled `ratified`.
 *
 * Why the metric exists: it measures the "spec maturity delta" noskills adds —
 * how far it drives a vague instruction toward an implementable spec by forcing
 * decisions to be resolved before work begins. The decisions the state machine
 * already gatekeeps ARE the question set; this layer just persists them with
 * exact provenance.
 *
 * Output (under the existing, gitignored `.eser/.state/`):
 *   `.eser/.state/progresses/ledger/<spec>/ledger.jsonl`  — one record per line
 *   `.eser/.state/progresses/ledger/<spec>/summary.json`  — regenerated each capture
 *
 * @module
 */

import { runtime } from "@eserstack/standards/cross-runtime";
import * as schema from "./schema.ts";
import * as persistence from "./persistence.ts";
import * as questions from "../context/questions.ts";
import * as concerns from "../context/concerns.ts";
import * as livingSpec from "../spec/living.ts";

// =============================================================================
// Types
// =============================================================================

export type LedgerProvenance = "ratified" | "inferred" | "default";

export type LedgerCategory =
  | "scope"
  | "constraint"
  | "acceptance-criteria"
  | "file-target"
  | "sequencing"
  | "out-of-scope"
  | "dependency"
  | "other";

/** One resolved decision. The shape is stable and machine-readable. */
export type LedgerRecord = {
  readonly id: string;
  readonly state: schema.Phase;
  readonly category: LedgerCategory;
  readonly question: string;
  readonly resolution: string;
  readonly provenance: LedgerProvenance;
  readonly timestamp: string;
  readonly artifacts: readonly string[];
};

/** Run-end rollup derived solely from noskills' own output. */
export type LedgerSummary = {
  readonly resolved_decisions: number;
  readonly provenance_breakdown: {
    readonly ratified: number;
    readonly inferred: number;
    readonly default: number;
  };
  readonly open_questions: number;
  readonly specificity: {
    readonly named_artifacts_count: number;
    readonly acceptance_criteria_present: boolean;
    readonly out_of_scope_present: boolean;
  };
};

// =============================================================================
// Deterministic helpers
// =============================================================================

const QUESTION_CATEGORY: Readonly<Record<string, LedgerCategory>> = {
  status_quo: "scope",
  ambition: "scope",
  reversibility: "constraint",
  user_impact: "constraint",
  verification: "acceptance-criteria",
  scope_boundary: "out-of-scope",
};

const categoryForQuestionId = (questionId: string): LedgerCategory =>
  QUESTION_CATEGORY[questionId] ?? "other";

const questionTextFor = (questionId: string): string =>
  questions.QUESTIONS.find((q) => q.id === questionId)?.text ?? questionId;

/**
 * Provenance of a discovery answer from its own `source` attribution:
 * STATED/CONFIRMED → user-confirmed (ratified); INFERRED or absent → inferred.
 * Conservative: an unattributed answer is never credited as ratified.
 */
const answerProvenance = (source: string | undefined): LedgerProvenance =>
  source === "STATED" || source === "CONFIRMED" ? "ratified" : "inferred";

/** Deterministic numeric suffix from an ISO timestamp; never reads the clock. */
const stableStamp = (timestamp: string): string => {
  const t = Date.parse(timestamp);
  return Number.isNaN(t) ? (timestamp.length > 0 ? timestamp : "0") : String(t);
};

/** Small deterministic string hash (djb2) for id suffixes without timestamps. */
const hashStr = (value: string): string => {
  let h = 5381;
  for (let i = 0; i < value.length; i++) {
    h = ((h << 5) + h + value.charCodeAt(i)) >>> 0;
  }
  return h.toString(36);
};

/**
 * Timestamp for records whose source object carries none (posture,
 * classification). Prefers the state's own `lastCalledAt`; the wall-clock
 * fallback affects only the display timestamp, never an id, so idempotency holds.
 */
const captureTimestamp = (state: schema.StateFile): string =>
  state.lastCalledAt ?? new Date().toISOString();

const classificationFlags = (
  classification: schema.SpecClassification,
): readonly string[] => {
  const flags: string[] = [];
  if (classification.involvesWebUI) flags.push("involvesWebUI");
  if (classification.involvesCLI) flags.push("involvesCLI");
  if (classification.involvesPublicAPI) flags.push("involvesPublicAPI");
  if (classification.involvesMigration) flags.push("involvesMigration");
  if (classification.involvesDataHandling) flags.push("involvesDataHandling");
  return flags.sort();
};

const decisionCategory = (decision: schema.Decision): LedgerCategory => {
  if (decision.id.startsWith("decision-split-keep")) return "scope";
  if (/^d\d+$/.test(decision.id)) return "dependency"; // BLOCKED resolution
  return "other";
};

const transitionCategory = (to: schema.Phase): LedgerCategory => {
  switch (to) {
    case "SPEC_PROPOSAL":
      return "scope";
    case "DISCOVERY": // reopen
      return "scope";
    case "SPEC_APPROVED":
      return "acceptance-criteria";
    case "COMPLETED":
      return "acceptance-criteria";
    case "BLOCKED":
      return "dependency";
    default:
      return "sequencing";
  }
};

// =============================================================================
// Detectors — pure: given a state, the decision records it contains
// =============================================================================
//
// Detectors do NOT diff; they enumerate every decision-bearing item in a single
// state. `diffDecisions` derives the per-write delta by id, and `captureTransition`
// additionally dedups against the on-disk ledger. Ids are pure functions of
// content, so the whole pipeline is idempotent.

const detectAnswers = (state: schema.StateFile): readonly LedgerRecord[] =>
  state.discovery.answers.map((answer) => {
    const att = answer as unknown as schema.AttributedDiscoveryAnswer;
    const type = att.type ?? "original";
    const suffix = att.timestamp !== undefined && att.timestamp.length > 0
      ? stableStamp(att.timestamp)
      : hashStr(answer.answer);
    return {
      id: `ans:${answer.questionId}:${type}:${suffix}`,
      state: state.phase,
      category: categoryForQuestionId(answer.questionId),
      question: questionTextFor(answer.questionId),
      resolution: answer.answer,
      provenance: answerProvenance(att.source),
      timestamp: att.timestamp !== undefined && att.timestamp.length > 0
        ? att.timestamp
        : captureTimestamp(state),
      artifacts: [],
    };
  });

const detectDecisions = (state: schema.StateFile): readonly LedgerRecord[] =>
  state.decisions.map((decision) => ({
    id: `dec:${decision.id}`,
    state: state.phase,
    category: decisionCategory(decision),
    question: decision.question,
    resolution: decision.choice,
    // Every addDecision call site is explicit user input.
    provenance: "ratified" as const,
    timestamp: decision.timestamp.length > 0
      ? decision.timestamp
      : captureTimestamp(state),
    artifacts: [],
  }));

const detectTransitions = (state: schema.StateFile): readonly LedgerRecord[] =>
  (state.transitionHistory ?? []).map((transition) => ({
    id: `tr:${transition.from}:${transition.to}:${
      stableStamp(transition.timestamp)
    }`,
    state: transition.to,
    category: transitionCategory(transition.to),
    question: `Transition ${transition.from} → ${transition.to}`,
    resolution: transition.reason ??
      `${transition.from} → ${transition.to} approved`,
    // recordTransition only fires from explicit approve/done/block/reopen.
    provenance: "ratified" as const,
    timestamp: transition.timestamp.length > 0
      ? transition.timestamp
      : captureTimestamp(state),
    artifacts: state.specState.path !== null ? [state.specState.path] : [],
  }));

const detectPosture = (
  state: schema.StateFile,
  manifest: schema.NosManifest | null,
): readonly LedgerRecord[] => {
  const posture = state.discovery.refinement?.reviewPosture;
  if (posture === undefined) return [];
  // Conservative: posture equal to the configured default is attributed to the
  // default, never to the user — we never inflate `ratified`.
  const isDefault = manifest?.defaultReviewPosture !== undefined &&
    manifest.defaultReviewPosture === posture;
  return [{
    id: `posture:${posture}`,
    state: state.phase,
    category: "scope",
    question: "Review posture for spec refinement",
    resolution: posture,
    provenance: isDefault ? "default" : "ratified",
    timestamp: captureTimestamp(state),
    artifacts: [],
  }];
};

const detectClassification = (
  state: schema.StateFile,
): readonly LedgerRecord[] => {
  const classification = state.classification;
  if (classification === null) return [];
  const flags = classificationFlags(classification);
  const resolution = flags.length > 0 ? flags.join(", ") : "none";
  return [{
    id: `class:${flags.length > 0 ? flags.join(",") : "none"}`,
    state: state.phase,
    category: "constraint",
    question:
      "Spec classification (UI / CLI / API / migration / data handling)",
    resolution,
    provenance: classification.source === "confirmed" ||
        classification.source === "manual"
      ? "ratified"
      : "inferred",
    timestamp: captureTimestamp(state),
    artifacts: [],
  }];
};

const detectCustomACs = (state: schema.StateFile): readonly LedgerRecord[] =>
  (state.customACs ?? []).map((ac) => ({
    id: `ac:${ac.id}`,
    state: ac.addedInPhase,
    category: "acceptance-criteria",
    question: "Acceptance criterion",
    resolution: ac.text,
    provenance: "ratified" as const,
    timestamp: ac.timestamp.length > 0 ? ac.timestamp : captureTimestamp(state),
    artifacts: [],
  }));

const buildRecords = (
  state: schema.StateFile,
  manifest: schema.NosManifest | null,
): readonly LedgerRecord[] => [
  ...detectAnswers(state),
  ...detectDecisions(state),
  ...detectTransitions(state),
  ...detectPosture(state, manifest),
  ...detectClassification(state),
  ...detectCustomACs(state),
];

// =============================================================================
// Pure core
// =============================================================================

/**
 * Records newly resolved between `prev` and `next`, compared by stable id.
 * Returns an empty array for a no-op write (e.g. a `lastCalledAt`-only touch).
 */
export const diffDecisions = (
  prev: schema.StateFile,
  next: schema.StateFile,
  manifest: schema.NosManifest | null,
): readonly LedgerRecord[] => {
  const prevIds = new Set(buildRecords(prev, manifest).map((r) => r.id));
  return buildRecords(next, manifest).filter((r) => !prevIds.has(r.id));
};

/**
 * Count decisions that were surfaced but left unresolved, from current state.
 * Concern tensions are passed in because they require disk-loaded active
 * concerns (resolved best-effort in {@link captureTransition}).
 */
export const countOpenQuestions = (
  state: schema.StateFile,
  tensionCount = 0,
): number => {
  let count = 0;

  // Pending discovery follow-ups.
  count += (state.discovery.followUps ?? []).filter(
    (f) => f.status === "pending",
  ).length;

  // Unresolved living-spec sections + pending delegated decisions.
  const completeness = livingSpec.checkSpecCompleteness(state.specState);
  count += completeness.unresolvedSections.length +
    completeness.pendingDecisions.length;

  // Low-confidence findings (mirrors machine.getLowConfidenceFindings threshold).
  count += (state.execution.confidenceFindings ?? []).filter(
    (f) => f.confidence < 5,
  ).length;

  // Unanswered base discovery questions, while a spec is actively being shaped.
  if (
    state.phase !== "IDLE" && state.phase !== "UNINITIALIZED" &&
    state.phase !== "COMPLETED"
  ) {
    const answered = new Set(state.discovery.answers.map((a) => a.questionId));
    count += questions.QUESTIONS.filter((q) => !answered.has(q.id)).length;
  }

  // Unresolved concern tensions.
  count += tensionCount;

  return count;
};

/** Build the summary from the full ledger plus current state. Pure. */
export const computeSummary = (
  state: schema.StateFile,
  ledger: readonly LedgerRecord[],
  openQuestions: number,
): LedgerSummary => {
  const breakdown = { ratified: 0, inferred: 0, default: 0 };
  for (const record of ledger) {
    breakdown[record.provenance] += 1;
  }

  const artifacts = new Set<string>();
  for (const file of state.execution.modifiedFiles) artifacts.add(file);
  for (const task of state.execution.completedTasks) artifacts.add(task);
  for (const record of ledger) {
    for (const artifact of record.artifacts) artifacts.add(artifact);
  }
  if (state.specState.path !== null) artifacts.add(state.specState.path);

  const hasVerificationAnswer = state.discovery.answers.some(
    (a) => a.questionId === "verification" && a.answer.trim().length > 0,
  );
  const hasScopeBoundaryAnswer = state.discovery.answers.some(
    (a) => a.questionId === "scope_boundary" && a.answer.trim().length > 0,
  );

  const acceptanceCriteriaPresent = (state.customACs?.length ?? 0) > 0 ||
    hasVerificationAnswer ||
    ledger.some((r) => r.category === "acceptance-criteria");

  const outOfScopePresent = hasScopeBoundaryAnswer ||
    ledger.some((r) => r.category === "out-of-scope");

  return {
    resolved_decisions: ledger.length,
    provenance_breakdown: breakdown,
    open_questions: openQuestions,
    specificity: {
      named_artifacts_count: artifacts.size,
      acceptance_criteria_present: acceptanceCriteriaPresent,
      out_of_scope_present: outOfScopePresent,
    },
  };
};

// =============================================================================
// Measurement-report projection (headless / CI bridge)
// =============================================================================
//
// Projects the ledger into the guided half of a `measurement-report/v1` draft —
// the shared contract consumed by the measurement dashboard / judging harness.
// Field rename: the ledger's `state` becomes the report's `phase`; `timestamp`
// and `artifacts` are not part of the measurement contract and are dropped. The
// provenance vocabulary (ratified | inferred | default) is identical on both
// sides. No baseline or judge results are produced here — that remains the
// downstream harness's job — so a built report's status is `guided_only`.

/** One decision in a `measurement-report/v1` guided ledger. */
export type MeasurementDecisionEntry = {
  readonly id: string;
  readonly category: LedgerCategory;
  readonly question: string;
  readonly resolution: string;
  readonly provenance: LedgerProvenance;
  readonly phase: schema.Phase;
};

/** A guided-only `measurement-report/v1` draft built from the ledger. */
export type MeasurementDraft = {
  readonly schemaVersion: "measurement-report/v1";
  readonly specId: string;
  readonly title: string;
  readonly guided: {
    readonly decisions: readonly MeasurementDecisionEntry[];
  };
};

export const toMeasurementDraft = (
  spec: string,
  records: readonly LedgerRecord[],
): MeasurementDraft => ({
  schemaVersion: "measurement-report/v1",
  specId: spec,
  title: `${spec} (live ledger)`,
  guided: {
    decisions: records.map((record) => ({
      id: record.id,
      category: record.category,
      question: record.question,
      resolution: record.resolution,
      provenance: record.provenance,
      phase: record.state,
    })),
  },
});

// =============================================================================
// Persistence (the only IO surface) — every path is fault-isolated
// =============================================================================

/** Read the per-spec ledger; missing/corrupt lines yield an empty/partial set. */
export const readLedger = async (
  root: string,
  spec: string,
): Promise<readonly LedgerRecord[]> => {
  const file = `${root}/${persistence.paths.ledgerFile(spec)}`;

  let content: string;
  try {
    content = await runtime.fs.readTextFile(file);
  } catch {
    return [];
  }

  return content
    .trim()
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => {
      try {
        return JSON.parse(line) as LedgerRecord;
      } catch {
        return null;
      }
    })
    .filter((r): r is LedgerRecord => r !== null);
};

/** Read the per-spec summary; returns null when missing or unparseable. */
export const readSummary = async (
  root: string,
  spec: string,
): Promise<LedgerSummary | null> => {
  const file = `${root}/${persistence.paths.ledgerSummaryFile(spec)}`;

  try {
    const content = await runtime.fs.readTextFile(file);
    return JSON.parse(content) as LedgerSummary;
  } catch {
    return null;
  }
};

/**
 * Observe a state transition and persist any newly resolved decisions, then
 * regenerate the summary. Append-only and idempotent (dedup by id). The entire
 * body is wrapped so a capture failure can never break or alter the run; it is
 * also invoked AFTER the canonical state write, so it can never corrupt state.
 */
export const captureTransition = async (
  root: string,
  prev: schema.StateFile,
  next: schema.StateFile,
  manifest?: schema.NosManifest | null,
): Promise<void> => {
  try {
    const spec = next.spec ?? prev.spec;
    if (spec === null || spec.length === 0) return; // no spec to attribute to

    // Resolve the manifest best-effort — only needed for posture-default detection.
    let resolvedManifest = manifest ?? null;
    if (resolvedManifest === null) {
      try {
        resolvedManifest = await persistence.readManifest(root);
      } catch {
        resolvedManifest = null;
      }
    }

    const candidates = diffDecisions(prev, next, resolvedManifest);

    // Dedup against the existing on-disk ledger by id (robust across re-writes).
    const existing = await readLedger(root, spec);
    const existingIds = new Set(existing.map((r) => r.id));
    const fresh = candidates.filter((r) => !existingIds.has(r.id));

    try {
      await runtime.fs.mkdir(
        `${root}/${persistence.paths.ledgerRunDir(spec)}`,
        { recursive: true },
      );
    } catch {
      // best effort
    }

    if (fresh.length > 0) {
      try {
        const file = `${root}/${persistence.paths.ledgerFile(spec)}`;
        let body = "";
        try {
          body = await runtime.fs.readTextFile(file);
        } catch {
          // file doesn't exist yet
        }
        const appended = fresh.map((r) => JSON.stringify(r)).join("\n") + "\n";
        await runtime.fs.writeTextFile(file, body + appended);
      } catch {
        // best effort — a failed append must not block the summary or the run
      }
    }

    // Concern tensions need disk-loaded active concerns; best-effort, 0 on failure.
    let tensionCount = 0;
    try {
      const allConcerns = await persistence.listConcerns(root);
      const active = resolvedManifest === null
        ? []
        : allConcerns.filter((c) => resolvedManifest!.concerns.includes(c.id));
      tensionCount = concerns.detectTensions(active).length;
    } catch {
      tensionCount = 0;
    }

    const full = [...existing, ...fresh];
    const summary = computeSummary(
      next,
      full,
      countOpenQuestions(next, tensionCount),
    );

    try {
      await runtime.fs.writeTextFile(
        `${root}/${persistence.paths.ledgerSummaryFile(spec)}`,
        JSON.stringify(summary, null, 2) + "\n",
      );
    } catch {
      // best effort
    }
  } catch {
    // Capture must never break or alter the run.
  }
};
