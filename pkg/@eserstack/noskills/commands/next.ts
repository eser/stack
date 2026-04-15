// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `noskills next` — Get next instruction for agent (JSON to stdout).
 * `noskills next --answer="..."` — Submit answer and advance state.
 *
 * @module
 */

import * as results from "@eserstack/primitives/results";
import type * as shellArgs from "@eserstack/shell/args";
import * as schema from "../state/schema.ts";
import * as persistence from "../state/persistence.ts";
import * as machine from "../state/machine.ts";
import * as compiler from "../context/compiler.ts";
import * as concerns from "../context/concerns.ts";
import * as questions from "../context/questions.ts";
import * as specGenerator from "../spec/generator.ts";
import * as livingSpec from "../spec/living.ts";
import * as syncEngine from "../sync/engine.ts";
import * as specParser from "../spec/parser.ts";
import * as specUpdater from "../spec/updater.ts";
import * as folderRules from "../context/folder-rules.ts";
import * as splitDetector from "../context/split-detector.ts";
import * as formatter from "../output/formatter.ts";
import * as mode from "../output/mode.ts";
import * as identity from "../state/identity.ts";
import { cmd } from "../output/cmd.ts";
import { runtime } from "@eserstack/standards/cross-runtime";

export const main = async (
  args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const { root } = await persistence.resolveProjectRoot();
  const fmt = formatter.parseOutputFormat(args);
  const cleanArgs = formatter.stripOutputFlag(args);

  if (!(await persistence.isInitialized(root))) {
    await formatter.writeFormatted(
      { error: `noskills not initialized. Run: ${cmd("init")}` },
      fmt,
    );

    return results.fail({ exitCode: 1 });
  }

  // Parse --answer flag
  let answerText: string | null = null;

  for (const arg of cleanArgs) {
    if (arg.startsWith("--answer=")) {
      answerText = arg.slice("--answer=".length);
    }
  }

  // Try --spec flag; if absent, fall back to global state (supports IDLE)
  const specFlag = persistence.parseSpecFlag(cleanArgs);
  let state: schema.StateFile;
  try {
    state = await persistence.resolveState(root, specFlag);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await formatter.writeFormatted({ error: msg }, fmt);
    return results.fail({ exitCode: 1 });
  }

  // If no --spec and we're in a spec-active phase, require it
  if (
    specFlag === null &&
    state.phase !== "IDLE" &&
    state.phase !== "COMPLETED"
  ) {
    await formatter.writeFormatted(
      {
        error:
          "Error: --spec=<name> is required. Use `noskills spec list` to see available specs.",
      },
      fmt,
    );
    return results.fail({ exitCode: 1 });
  }
  const config = await persistence.readManifest(root);

  // Set command prefix from manifest for cmd() / cmdPrefix() calls
  if (config?.command !== undefined) {
    const { setCommandPrefix } = await import("../output/cmd.ts");
    setCommandPrefix(config.command);
  }

  if (config === null) {
    await formatter.writeFormatted({ error: "No config found" }, fmt);

    return results.fail({ exitCode: 1 });
  }

  // State integrity check: verify active spec directory exists
  if (
    state.spec !== null && state.phase !== "IDLE" && state.phase !== "COMPLETED"
  ) {
    const specDir = `${root}/${persistence.paths.specDir(state.spec)}`;
    try {
      await runtime.fs.stat(specDir);
    } catch {
      await formatter.writeFormatted({
        error: true,
        message:
          `Active spec '${state.spec}' directory not found. Files may have been deleted manually.`,
        suggestion: `Run \`${cmd("reset")}\` to return to idle, or \`${
          cmd("cancel")
        }\` to mark as cancelled.`,
      }, fmt);
      return results.fail({ exitCode: 1 });
    }
  }

  // Detect audience mode and persist on discovery state
  const audience = mode.detectMode(cleanArgs, config);
  if (state.phase === "DISCOVERY" && state.discovery.audience !== audience) {
    state = { ...state, discovery: { ...state.discovery, audience } };
  }

  // Load active concerns
  const allConcerns = await persistence.listConcerns(root);
  const activeConcerns = allConcerns.filter((c) =>
    config.concerns.includes(c.id)
  );

  // Handle --answer
  if (answerText !== null) {
    const answerUser = await identity.resolveUser(root);
    const newState = await handleAnswer(
      root,
      state,
      config,
      activeConcerns,
      answerText,
      answerUser,
    );
    await persistence.writeStateAndSpec(root, newState);

    // Update lastCalledAt and recompile
    const touchedState = {
      ...newState,
      lastCalledAt: new Date().toISOString(),
    };
    await persistence.writeStateAndSpec(root, touchedState);

    // Sync session phase if NOSKILLS_SESSION is set
    const sessionId = runtime.env.get("NOSKILLS_SESSION") ?? null;
    if (sessionId !== null) {
      await persistence.updateSessionPhase(
        root,
        sessionId,
        touchedState.phase,
      );
    }

    const scopedRules = await syncEngine.loadScopedRules(root);
    const { tier1, tier2Count } = syncEngine.splitByTier(
      scopedRules,
      touchedState.phase,
    );
    const parsed = touchedState.spec !== null
      ? await specParser.parseSpec(root, touchedState.spec)
      : null;
    // Collect folder rules from touched files (state + hook log)
    const touchedFiles = await collectTouchedFiles(root, touchedState);
    const fRules = await folderRules.collectFolderRules(root, touchedFiles);
    const hints = syncEngine.resolveInteractionHints(config?.tools ?? []);
    const user = await identity.resolveUser(root);
    const output = await compiler.compile(
      touchedState,
      activeConcerns,
      tier1,
      config,
      parsed,
      fRules,
      undefined,
      hints,
      user,
      tier2Count,
      root,
    );

    // Inject saved flag when "save" was the answer and phase didn't change
    const isSaveAnswer = answerText.trim().toLowerCase() === "save";
    const phaseSame = touchedState.phase === state.phase;
    if (
      isSaveAnswer && phaseSame &&
      (touchedState.phase === "SPEC_PROPOSAL" ||
        touchedState.phase === "SPEC_APPROVED")
    ) {
      const savedInstruction = touchedState.phase === "SPEC_PROPOSAL"
        ? "Spec draft saved. The spec stays in DRAFT and can be reviewed by anyone. Other users can add ACs (`ac add`), notes (`note add`), or tasks (`task add`) while in draft. When ready, any user can approve with `noskills spec <name> approve`."
        : 'Spec is approved and parked. Others can still add ACs or notes. When ready, run `noskills next --answer="start"` to begin execution.';
      const savedOutput = {
        ...output,
        instruction: savedInstruction,
        saved: true,
      };
      await formatter.writeFormatted(savedOutput, fmt);
      return results.ok(undefined);
    }

    await formatter.writeFormatted(output, fmt);

    return results.ok(undefined);
  }

  // Update lastCalledAt timestamp
  const touchedState = { ...state, lastCalledAt: new Date().toISOString() };
  await persistence.writeStateAndSpec(root, touchedState);

  // Sync session phase
  const noAnswerSessionId = runtime.env.get("NOSKILLS_SESSION") ??
    null;
  if (noAnswerSessionId !== null) {
    await persistence.updateSessionPhase(
      root,
      noAnswerSessionId,
      touchedState.phase,
    );
  }

  // No answer — just output current instruction
  const scopedRules = await syncEngine.loadScopedRules(root);
  const { tier1: noAnswerTier1, tier2Count: noAnswerTier2Count } = syncEngine
    .splitByTier(scopedRules, touchedState.phase);
  const parsed = touchedState.spec !== null
    ? await specParser.parseSpec(root, touchedState.spec)
    : null;
  const touchedFiles = await collectTouchedFiles(root, touchedState);
  const fRules = await folderRules.collectFolderRules(root, touchedFiles);

  // Build idle context if needed (spec list for welcome dashboard)
  let idleContext: compiler.IdleContext | undefined;
  if (touchedState.phase === "IDLE") {
    const specStates = await persistence.listSpecStates(root);
    idleContext = {
      existingSpecs: specStates.map((s) => ({
        name: s.name,
        phase: s.state.phase,
        iteration: s.state.execution.iteration,
        detail: s.state.phase === "EXECUTING"
          ? `${s.state.execution.completedTasks.length} tasks done, iteration ${s.state.execution.iteration}`
          : s.state.phase === "SPEC_PROPOSAL"
          ? "awaiting approval"
          : s.state.phase === "COMPLETED"
          ? "completed"
          : undefined,
      })),
      rulesCount: noAnswerTier1.length,
    };
  }

  const hints = syncEngine.resolveInteractionHints(config?.tools ?? []);
  const user = await identity.resolveUser(root);
  const output = await compiler.compile(
    touchedState,
    activeConcerns,
    noAnswerTier1,
    config,
    parsed,
    fRules,
    idleContext,
    hints,
    user,
    noAnswerTier2Count,
    root,
  );
  await formatter.writeFormatted(output, fmt);

  return results.ok(undefined);
};

// =============================================================================
// Ask Token Consumption (written by post-ask-user-question hook)
// =============================================================================

export type AskTokenResult = {
  readonly source: "STATED" | "INFERRED";
  readonly questionMatch: "exact" | "modified" | "not-asked";
};

/**
 * Read and consume the ask-token.json written by the post-ask-user-question
 * hook. Validates spec + stepId + 30-min expiry. Single-use: deletes on
 * successful validation. Best-effort — any IO failure falls through to
 * INFERRED.
 */
export const consumeAskToken = async (
  root: string,
  expectedSpec: string | null,
  expectedStepId: string,
): Promise<AskTokenResult> => {
  const tokenPath = `${root}/${persistence.paths.askTokenFile}`;
  try {
    const raw = await runtime.fs.readTextFile(tokenPath);
    const token = JSON.parse(raw) as {
      stepId?: string;
      spec?: string | null;
      match?: "exact" | "modified";
      createdAt?: string;
    };

    // Spec must match
    if ((token.spec ?? null) !== (expectedSpec ?? null)) {
      return { source: "INFERRED", questionMatch: "not-asked" };
    }
    // StepId must match
    if (token.stepId !== expectedStepId) {
      return { source: "INFERRED", questionMatch: "not-asked" };
    }
    // 30-minute expiry
    const ageMs = Date.now() - new Date(token.createdAt ?? 0).getTime();
    if (!isFinite(ageMs) || ageMs < 0 || ageMs > 30 * 60 * 1000) {
      return { source: "INFERRED", questionMatch: "not-asked" };
    }

    // Valid — single-use delete
    try {
      await runtime.fs.remove(tokenPath);
    } catch {
      // best effort
    }

    return {
      source: "STATED",
      questionMatch: token.match ?? "exact",
    };
  } catch {
    // File missing / unparseable / IO error → INFERRED
    return { source: "INFERRED", questionMatch: "not-asked" };
  }
};

/**
 * Patch the most recently appended discovery answer(s) for the given question
 * id with token-derived `source` + `questionMatch`. Assumes `addDiscoveryAnswer`
 * was just called — finds the newest entry matching the question id and
 * overwrites its source/questionMatch fields.
 */
const applyTokenSourceToLastAnswer = (
  state: schema.StateFile,
  questionId: string,
  tokenResult: AskTokenResult,
): schema.StateFile => {
  const answers = state.discovery.answers;
  // Find the last answer with matching questionId
  let lastIdx = -1;
  for (let i = answers.length - 1; i >= 0; i--) {
    const candidate = answers[i];
    if (candidate !== undefined && candidate.questionId === questionId) {
      lastIdx = i;
      break;
    }
  }
  if (lastIdx === -1) return state;

  const existing = answers[lastIdx];
  if (existing === undefined) return state;
  const normalized = schema.normalizeAnswer(existing);
  const patched: schema.AttributedDiscoveryAnswer = {
    ...normalized,
    source: tokenResult.source,
    questionMatch: tokenResult.questionMatch,
  };
  const newAnswers = [
    ...answers.slice(0, lastIdx),
    patched,
    ...answers.slice(lastIdx + 1),
  ];
  return {
    ...state,
    discovery: {
      ...state.discovery,
      answers: newAnswers,
    },
  };
};

// Built-in DISCOVERY question IDs in order (mirrors invoke-hook.ts mapping).
const DISCOVERY_QUESTION_IDS: readonly string[] = [
  "status_quo",
  "ambition",
  "reversibility",
  "user_impact",
  "verification",
  "scope_boundary",
];

// =============================================================================
// Living Spec update helper (Expansion F: classification-driven reveals)
// =============================================================================

/** True when two SpecClassification objects have the same flag values. */
const sameClassification = (
  a: schema.SpecClassification | null,
  b: schema.SpecClassification | null,
): boolean => {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return (
    a.involvesWebUI === b.involvesWebUI &&
    a.involvesCLI === b.involvesCLI &&
    a.involvesPublicAPI === b.involvesPublicAPI &&
    a.involvesMigration === b.involvesMigration &&
    a.involvesDataHandling === b.involvesDataHandling
  );
};

/**
 * After a DISCOVERY answer is stored in state, update spec.md and specState.
 * Pure state mutations first, then a single read+write on disk.
 * Never throws — spec file errors are swallowed so they don't fail the answer.
 */
const applyLivingSpecToDiscoveryAnswer = async (
  root: string,
  state: schema.StateFile,
  questionId: string,
  answerText: string,
  user: { name: string; email: string } | undefined,
  activeConcerns: readonly schema.ConcernDefinition[],
): Promise<{
  newState: schema.StateFile;
  revealNotification: string | null;
}> => {
  if (state.spec === null || state.specState.path === null) {
    return { newState: state, revealNotification: null };
  }

  const sectionId = livingSpec.questionIdToSectionId(questionId);
  const now = new Date();
  const userName = user?.name ?? "Unknown User";

  // Re-classify progressively after the new answer
  const prevClassification = state.classification ?? null;
  const newClassification = compiler.inferClassification(state);
  const classificationChanged = !sameClassification(
    prevClassification,
    newClassification,
  );

  const sectionDefs = livingSpec.mergeSections(activeConcerns);

  // Mark section as filled + re-evaluate conditional visibility
  let updatedPlaceholders = livingSpec.markPlaceholderFilled(
    state.specState.placeholders,
    sectionId,
    userName,
    now,
  );
  updatedPlaceholders = livingSpec.applyClassificationToPlaceholders(
    updatedPlaceholders,
    sectionDefs,
    newClassification,
  );

  const newMetadata = livingSpec.applyMetadataAction(
    state.specState.metadata,
    { type: "answer", user: userName, section: sectionId },
    now,
  );

  const newState: schema.StateFile = {
    ...state,
    classification: newClassification,
    specState: {
      ...state.specState,
      placeholders: updatedPlaceholders,
      metadata: newMetadata,
    },
  };

  // Build reveal notification (Expansion F)
  let revealNotification: string | null = null;
  if (classificationChanged) {
    const revealNotif = livingSpec.getRevealNotification(
      state.specState.placeholders,
      updatedPlaceholders,
    );
    const newlyRevealedIds = revealNotif?.revealed ?? [];
    const newlyHiddenIds = revealNotif?.hidden ?? [];

    const revealedTitles = newlyRevealedIds.map((id) => {
      const sec = sectionDefs.find((s) => s.id === id);
      const concern = sec?.concernSource !== undefined
        ? ` (from concern: ${sec.concernSource})`
        : "";
      return `  • ${sec?.title ?? id}${concern}`;
    });

    const hiddenTitles = newlyHiddenIds.map((id) => {
      const sec = sectionDefs.find((s) => s.id === id);
      return `  • ${sec?.title ?? id}`;
    });

    const parts: string[] = [];
    if (revealedTitles.length > 0) {
      const reason = livingSpec.classificationReasonText(
        prevClassification,
        newClassification,
      );
      parts.push(
        `\nClassification updated. ${revealedTitles.length} new section(s) appeared:\n` +
          revealedTitles.join("\n") +
          `\nReason: your answer mentioned ${reason}`,
      );
    }
    if (hiddenTitles.length > 0) {
      parts.push(
        `\n${hiddenTitles.length} section(s) hidden (no longer relevant):\n` +
          hiddenTitles.join("\n"),
      );
    }
    if (parts.length > 0) revealNotification = parts.join("\n");
  }

  // File I/O — one read, one write; swallow errors so they don't fail the answer
  try {
    const specPath = `${root}/${state.specState.path}`;
    const prevVisible = new Set(
      state.specState.placeholders
        .filter((p) => p.status !== "conditional-hidden")
        .map((p) => p.sectionId),
    );
    const nowVisible = new Set(
      updatedPlaceholders
        .filter((p) => p.status !== "conditional-hidden")
        .map((p) => p.sectionId),
    );
    const newlyRevealedSections = [...nowVisible]
      .filter((id) => !prevVisible.has(id))
      .map((id) => sectionDefs.find((s) => s.id === id))
      .filter((s): s is livingSpec.SpecSection => s !== undefined);
    const newlyHiddenIds = [...prevVisible].filter((id) => !nowVisible.has(id));

    await livingSpec.applyAnswerToFile({
      path: specPath,
      sectionId,
      body: answerText,
      attribution: { user: userName, date: now },
      metadata: newMetadata,
      visiblePlaceholders: updatedPlaceholders,
      classificationChanged,
      newlyRevealedSections,
      newlyHiddenIds,
    });
  } catch {
    // Spec file missing, marker not found, or file predates living-spec feature
    // Don't fail the answer — the JSON state is the canonical truth
  }

  return { newState, revealNotification };
};

// =============================================================================
// Answer Handling
// =============================================================================

const POSTURE_MAP: Readonly<Record<string, schema.ReviewPosture>> = {
  a: "selective-expansion",
  b: "hold-scope",
  c: "scope-expansion",
  d: "scope-reduction",
  "selective-expansion": "selective-expansion",
  "hold-scope": "hold-scope",
  "scope-expansion": "scope-expansion",
  "scope-reduction": "scope-reduction",
};

/**
 * Shared approve cascade used by both the old approve path and stage-c "approve".
 * Runs split-detection first, then advances to SPEC_PROPOSAL.
 * Emits a Jidoka UX message if the gate blocks due to unresolved placeholders.
 */
const handleApproveAnswer = async (
  root: string,
  state: schema.StateFile,
  _config: schema.NosManifest,
  answer: string,
  _user?: { name: string; email: string },
): Promise<schema.StateFile> => {
  const trimmed = answer.trim().toLowerCase();

  // "approve" → check for split proposal, then alternatives step
  if (trimmed === "approve" || trimmed === "y" || trimmed === "yes") {
    const proposal = splitDetector.analyzeForSplit(state.discovery.answers);
    if (proposal.detected && proposal.proposals.length >= 2) {
      return machine.approveDiscoveryAnswers(state);
    }
    if (state.discovery.mode !== undefined) {
      return machine.approveDiscoveryAnswers(state);
    }
    // Backward compat: no mode → direct to SPEC_PROPOSAL
    // The Jidoka gate inside approveDiscoveryReview may throw for unresolved placeholders.
    // In stage-c, the CEO review is already saved — reassure the user.
    try {
      const nextState = machine.approveDiscoveryReview(state);
      // Create spec.proposal.md snapshot (write-once, best-effort)
      if (nextState.spec !== null) {
        const specDir = `${root}/${persistence.paths.specDir(nextState.spec)}`;
        await livingSpec.createSpecSnapshot(
          `${specDir}/spec.md`,
          `${specDir}/spec.proposal.md`,
        ).catch(() => {/* best-effort */});
      }
      return nextState;
    } catch (err) {
      // If Jidoka gate blocked and we're in stage-c, surface helpful message
      if (machine.getDiscoveryRefinementStage(state) === "stage-c") {
        throw new Error(
          `${
            (err as Error).message
          } — Your CEO review is saved and will be preserved (run 'noskills next' to see remaining gaps).`,
        );
      }
      throw err;
    }
  }

  return state;
};

/**
 * Handles all DISCOVERY_REFINEMENT answers via 7-step routing.
 * Extracted from handleAnswer to keep the case body manageable.
 */
const handleRefinementAnswer = async (
  root: string,
  state: schema.StateFile,
  config: schema.NosManifest,
  answer: string,
  user?: { name: string; email: string },
): Promise<schema.StateFile> => {
  const trimmed = answer.trim().toLowerCase();
  const stage = machine.getDiscoveryRefinementStage(state);

  // STEP 1: POSTURE_MAP lookup — handles shorthand (a/b/c/d) + full strings
  const posture = POSTURE_MAP[trimmed];
  if (posture !== undefined) {
    return machine.setReviewPosture(state, posture);
  }

  // STEP 2: JSON parse — handles completeness, posture+completeness, CEO review
  try {
    const parsed = JSON.parse(answer);
    if (parsed !== null && typeof parsed === "object") {
      if ("posture" in parsed || "completeness" in parsed) {
        let next = state;
        if (
          typeof parsed.completeness === "object" &&
          parsed.completeness !== null &&
          typeof parsed.completeness.overall === "number" &&
          Array.isArray(parsed.completeness.dimensions)
        ) {
          next = machine.setCompletenessScore(
            next,
            parsed.completeness as schema.CompletenessScore,
          );
          // Stage-a fast-path: if manifest has defaultReviewPosture, auto-set posture
          if (
            stage === "stage-a" &&
            config.defaultReviewPosture !== undefined &&
            !("posture" in parsed)
          ) {
            next = machine.setReviewPosture(next, config.defaultReviewPosture);
          }
        }
        if ("posture" in parsed) {
          const p = POSTURE_MAP[String(parsed.posture)];
          if (p !== undefined) next = machine.setReviewPosture(next, p);
        }
        return next;
      }
      if ("ceoReview" in parsed) {
        // Valid in stage-b (primary); stage-c late submission is tolerated
        return machine.setCeoReviewReadiness(
          state,
          parsed.ceoReview as schema.CeoReviewReadiness,
          typeof parsed.reflection === "string" ? parsed.reflection : undefined,
        );
      }
    }
  } catch { /* not JSON — continue */ }

  // STEP 3: Stage-c keyword routing
  if (stage === "stage-c") {
    if (trimmed === "approve" || trimmed === "y" || trimmed === "yes") {
      return handleApproveAnswer(root, state, config, answer, user);
    }
    if (trimmed === "revise" || trimmed === "r") {
      return machine.clearRefinement(state);
    }
    // "park" / "cancel" fall through to existing cancel path below
  }

  // STEP 4: Manifest write-back (save project-default posture)
  if (trimmed === "save-posture") {
    const currentPosture = state.discovery.refinement?.reviewPosture;
    if (currentPosture !== undefined) {
      try {
        const mf = await persistence.readManifest(root);
        if (mf !== null) {
          await persistence.writeManifest(root, {
            ...mf,
            defaultReviewPosture: currentPosture,
          });
        }
        // Note: state returned unchanged; manifest is the side-effect
        // Caller sees no state diff — CLI output will confirm the save via console.error
        console.error(`Saved '${currentPosture}' as project default posture.`);
      } catch { /* best-effort */ }
    }
    return state;
  }

  // STEP 5: Clear manifest posture default
  if (trimmed === "clear-posture") {
    try {
      const mf = await persistence.readManifest(root);
      if (mf !== null) {
        // deno-lint-ignore no-explicit-any
        const { defaultReviewPosture: _drp, ...rest } = mf as any;
        await persistence.writeManifest(root, rest as schema.NosManifest);
        console.error("Cleared project default posture.");
      }
    } catch { /* best-effort */ }
    return state;
  }

  // STEP 6: Existing DISCOVERY_REFINEMENT branches (approve from pre-stage-c, split, keep,
  // alternatives, revision JSON, cancel — keep original logic)

  // "approve" (stage-a or stage-b, pre-CEO review) — original approve path
  if (trimmed === "approve") {
    const nextState = await handleApproveAnswer(
      root,
      state,
      config,
      answer,
      user,
    );
    if (nextState !== state) {
      // Compute delta narrative for transition message
      const initial = state.discovery.refinement?.initialCompletenessScore
        ?.overall;
      const final = state.discovery.refinement?.completenessScore?.overall;
      if (initial !== undefined && final !== undefined && initial !== final) {
        console.error(
          `Completeness improved from ${initial} to ${final}/10 through review.`,
        );
      } else if (final !== undefined) {
        console.error(`Spec reviewed at ${final}/10.`);
      }
      return nextState;
    }
  }

  // "split" → create sub-specs, cancel parent
  if (trimmed === "split") {
    return await handleSplit(root, state);
  }

  // "keep" → user chose to keep as one spec despite split proposal
  if (trimmed === "keep") {
    const newState = machine.addDecision(state, {
      id: `decision-split-keep-${Date.now()}`,
      question: "Split spec into separate areas?",
      choice: "Chose to keep as single spec despite multiple areas detected",
      promoted: false,
      timestamp: new Date().toISOString(),
    });
    const nextState = machine.approveDiscoveryReview(newState);
    if (nextState.spec !== null) {
      const specDir = `${root}/${persistence.paths.specDir(nextState.spec)}`;
      await livingSpec.createSpecSnapshot(
        `${specDir}/spec.md`,
        `${specDir}/spec.proposal.md`,
      ).catch(() => {/* best-effort */});
    }
    return nextState;
  }

  // Alternatives selection (after approved, before SPEC_PROPOSAL transition)
  const alternativesPresented = state.discovery.alternativesPresented === true;
  if (state.discovery.approved && !alternativesPresented) {
    let updatedState: schema.StateFile;
    if (trimmed === "skip" || trimmed === "none") {
      updatedState = machine.skipAlternatives(state);
    } else {
      let handled = false;
      try {
        const parsed = JSON.parse(answer);
        if (
          parsed !== null && typeof parsed === "object" && "approach" in parsed
        ) {
          const approach: schema.SelectedApproach = {
            id: String(parsed.approach),
            name: String(parsed.name ?? parsed.approach),
            summary: String(parsed.summary ?? ""),
            effort: String(parsed.effort ?? ""),
            risk: String(parsed.risk ?? ""),
            user: user?.name ?? "Unknown User",
            timestamp: new Date().toISOString(),
          };
          updatedState = machine.selectApproach(state, approach);
          handled = true;
        }
      } catch { /* Not JSON */ }
      if (!handled) {
        updatedState = machine.skipAlternatives(state);
      }
    }
    const nextState = machine.approveDiscoveryReview(updatedState!);
    if (nextState.spec !== null) {
      const specDir = `${root}/${persistence.paths.specDir(nextState.spec)}`;
      await livingSpec.createSpecSnapshot(
        `${specDir}/spec.md`,
        `${specDir}/spec.proposal.md`,
      ).catch(() => {/* best-effort */});
    }
    return nextState;
  }

  // Revision: parse JSON with { revise: { questionId: "corrected answer" } }
  try {
    const parsed = JSON.parse(answer);
    if (typeof parsed.revise === "object" && parsed.revise !== null) {
      let newState = state;
      const refinementToken = await consumeAskToken(
        root,
        state.spec,
        "refinement",
      );
      for (
        const [qId, qAnswer] of Object.entries(
          parsed.revise as Record<string, string>,
        )
      ) {
        if (typeof qAnswer === "string" && qAnswer.length > 0) {
          newState = machine.addDiscoveryAnswer(newState, qId, qAnswer, user);
          newState = applyTokenSourceToLastAnswer(
            newState,
            qId,
            refinementToken,
          );
        }
      }
      return newState;
    }
  } catch { /* Not JSON */ }

  return state;
};

export const handleAnswer = async (
  root: string,
  state: schema.StateFile,
  config: schema.NosManifest,
  activeConcerns: readonly schema.ConcernDefinition[],
  answer: string,
  user?: { name: string; email: string },
): Promise<schema.StateFile> => {
  switch (state.phase) {
    case "DISCOVERY": {
      // Listen first: store user context before mode selection
      const hasUserContext = state.discovery.userContext !== undefined &&
        state.discovery.userContext.length > 0;
      const hasDescription = state.specDescription !== null &&
        state.specDescription.length > 0;
      const discoveryMode = state.discovery.mode;

      if (!hasUserContext && discoveryMode === undefined && hasDescription) {
        // Plan import: triggered when the user selects "Convert plan" in listen-first
        if (answer.trim() === "import-plan") {
          const detected = await compiler.detectActivePlan(root);
          if (detected !== null) {
            try {
              const content = await runtime.fs.readTextFile(detected.path);
              return machine.importDetectedPlan(state, content, detected.path);
            } catch {
              // File deleted between detection and import — fall through to warning
            }
          }
          // Plan gone or expired — do NOT store "import-plan" as literal user context
          return machine.setUserContext(
            state,
            "⚠ No active plan found — plan.md was not detected or has expired. Please share your context directly.",
          );
        }

        // Normal listen-first: store user context before mode selection
        return machine.setUserContext(state, answer);
      }

      // Mode selection (after user context received)
      if (discoveryMode === undefined && hasDescription) {
        const validModes: readonly schema.DiscoveryMode[] = [
          "full",
          "validate",
          "technical-depth",
          "ship-fast",
          "explore",
        ];
        if (validModes.includes(answer as schema.DiscoveryMode)) {
          return machine.setDiscoveryMode(
            state,
            answer as schema.DiscoveryMode,
          );
        }
        // Invalid mode — default to full
        return machine.setDiscoveryMode(state, "full");
      }

      // Premise challenge (after mode, before questions — only when mode is set)
      const premisesCompleted = state.discovery.premisesCompleted === true;
      if (discoveryMode !== undefined && !premisesCompleted) {
        try {
          const parsed = JSON.parse(answer);
          if (
            parsed !== null && typeof parsed === "object" &&
            "premises" in parsed
          ) {
            const rawPremises = parsed.premises as Array<
              { text: string; agreed: boolean; revision?: string }
            >;
            const typedPremises: schema.Premise[] = rawPremises
              .map((p) => ({
                text: p.text ?? "",
                agreed: p.agreed ?? true,
                revision: p.revision,
                user: user?.name ?? "Unknown User",
                timestamp: new Date().toISOString(),
              }));
            // Jidoka M3: reject empty premises array
            if (typedPremises.length === 0) {
              throw new Error(
                "Premise challenge requires at least one premise. Empty array rejected.",
              );
            }
            return machine.completePremises(state, typedPremises);
          }
        } catch {
          // Not JSON — reject (Jidoka M3: empty premises = re-prompt)
          throw new Error(
            "Premise challenge requires valid JSON with premises array. Re-prompt the user.",
          );
        }
        // If answer is JSON but missing premises key — reject
        throw new Error(
          "Premise challenge requires a premises array. Cannot skip with empty input.",
        );
      }

      const isAgent = state.discovery.audience === "agent";

      // Try parsing answer as JSON object for batch submission
      let answersMap: Record<string, string> | null = null;
      try {
        const parsed = JSON.parse(answer);
        if (
          typeof parsed === "object" && parsed !== null &&
          !Array.isArray(parsed)
        ) {
          if (isAgent) {
            // Agent mode: only batch if ALL required question IDs are present
            const requiredIds = questions.QUESTIONS.map((q) => q.id);
            const hasAll = requiredIds.every((id) => id in parsed);
            if (hasAll) {
              answersMap = parsed as Record<string, string>;
            }
          } else {
            // Human mode: any JSON object is treated as batch
            answersMap = parsed as Record<string, string>;
          }
        }
      } catch {
        // Not JSON — fall through to single answer mode
      }

      let newState = state;

      if (answersMap !== null) {
        // Batch mode: add all answers at once (human/agentless CLI)
        // Jidoka C1: flag batch submissions for mandatory user confirmation
        for (const [qId, qAnswer] of Object.entries(answersMap)) {
          if (typeof qAnswer === "string" && qAnswer.length > 0) {
            newState = machine.addDiscoveryAnswer(newState, qId, qAnswer, user);
          }
        }
        // Mark that answers were batch-submitted (needs explicit user confirmation)
        newState = {
          ...newState,
          discovery: {
            ...newState.discovery,
            batchSubmitted: true,
          },
        };
      } else {
        // Single answer mode (agent one-at-a-time): answer current question and advance
        const allQuestions = questions.getQuestionsWithExtras(activeConcerns);
        const currentIdx = newState.discovery.currentQuestion;
        const currentQ = allQuestions[currentIdx];

        if (currentQ === undefined) return state;
        newState = machine.addDiscoveryAnswer(
          newState,
          currentQ.id,
          answer,
          user,
        );
        // Consume ask-token (best-effort) and annotate the just-appended
        // answer with STATED/INFERRED provenance.
        const stepId = DISCOVERY_QUESTION_IDS[currentIdx] ??
          `Q${currentIdx + 1}`;
        const tokenResult = await consumeAskToken(root, state.spec, stepId);
        newState = applyTokenSourceToLastAnswer(
          newState,
          currentQ.id,
          tokenResult,
        );
        newState = machine.advanceDiscoveryQuestion(newState);

        // Update spec.md + specState.placeholders progressively (Living Spec)
        const { newState: livingUpdated } =
          await applyLivingSpecToDiscoveryAnswer(
            root,
            newState,
            currentQ.id,
            answer,
            user,
            activeConcerns,
          );
        newState = livingUpdated;
      }

      // Check if discovery is complete — transition to DISCOVERY_REFINEMENT
      if (questions.isDiscoveryComplete(newState.discovery.answers)) {
        newState = machine.completeDiscovery(newState);
      }

      return newState;
    }

    case "DISCOVERY_REFINEMENT": {
      return await handleRefinementAnswer(root, state, config, answer, user);
    }

    case "SPEC_PROPOSAL": {
      // "save" — keep draft as-is, phase stays SPEC_PROPOSAL
      if (answer.trim().toLowerCase() === "save") {
        return state;
      }

      // Safety net: classification should have been auto-inferred on the
      // DISCOVERY_REFINEMENT → SPEC_PROPOSAL transition (see
      // `machine.autoClassifyIfMissing`). If it is still missing — e.g.
      // state written by older tooling before auto-classification landed —
      // infer it now and generate the spec draft before handling the answer.
      let workingState = state;
      if (workingState.classification === null) {
        workingState = machine.autoClassifyIfMissing(workingState);
        try {
          await specGenerator.generateSpec(
            root,
            workingState,
            activeConcerns,
          );
        } catch {
          // Keep classification even if spec gen fails
        }
      }

      // Already classified — check for refinement
      try {
        const parsed = JSON.parse(answer);
        if (
          typeof parsed.refinement === "string" &&
          parsed.refinement.length > 0
        ) {
          const refinementText = parsed.refinement;

          if (workingState.spec !== null) {
            const specFile = `${root}/${
              persistence.paths.specFile(workingState.spec)
            }`;
            const currentContent = await runtime.fs.readTextFile(specFile);

            // If refinement contains "task-" patterns, replace the Tasks section
            if (refinementText.includes("task-")) {
              // Split ONLY on "task-N:" prefix boundaries, preserving full descriptions
              const taskLines = parseRefinementTasks(refinementText);
              const newTasksSection = taskLines.map(
                (t: string) => `- [ ] ${t}`,
              ).join("\n");

              // Replace the ## Tasks section in the spec
              const tasksRegex = /## Tasks\n\n([\s\S]*?)(?=\n## |\n*$)/;
              const updatedContent = currentContent.replace(
                tasksRegex,
                `## Tasks\n\n${newTasksSection}\n`,
              );
              await runtime.fs.writeTextFile(specFile, updatedContent);
            }
          }

          return workingState; // Stay in SPEC_PROPOSAL
        }
      } catch {
        // Not JSON — ignore
      }

      return workingState;
    }

    case "SPEC_APPROVED": {
      // "save" — keep approved spec parked, don't start execution
      if (answer.trim().toLowerCase() === "save") {
        return state;
      }

      // User is ready — start execution
      const execState = machine.startExecution(state);

      // Update spec.md: "approved" → "executing"
      if (execState.spec !== null) {
        await specUpdater.updateSpecStatus(root, execState.spec, "executing");
        await specUpdater.updateProgressStatus(
          root,
          execState.spec,
          "executing",
        );
        // Create spec.approved.md snapshot (write-once, best-effort)
        const specDir = `${root}/${persistence.paths.specDir(execState.spec)}`;
        await livingSpec.createSpecSnapshot(
          `${specDir}/spec.md`,
          `${specDir}/spec.approved.md`,
        ).catch(() => {/* best-effort */});
      }

      return execState;
    }

    case "EXECUTING": {
      // Step 1: Agent says "done" → run verification first, then maybe status report
      if (!state.execution.awaitingStatusReport) {
        let newState = {
          ...state,
          execution: {
            ...state.execution,
            lastProgress: answer,
          },
        };

        // Run verification if configured (automated backpressure)
        if (
          config.verifyCommand !== null && config.verifyCommand !== undefined &&
          config.verifyCommand.length > 0
        ) {
          const verification = await runVerification(
            root,
            config.verifyCommand,
          );
          newState = {
            ...newState,
            execution: {
              ...newState.execution,
              lastVerification: verification,
            },
          };

          // If verification failed, do NOT ask for status report — just return
          // the failure. Agent must fix and try again.
          if (!verification.passed) {
            return newState;
          }
        }

        // Verification passed (or not configured) — ask for status report
        newState = {
          ...newState,
          execution: {
            ...newState.execution,
            awaitingStatusReport: true,
          },
        };

        return newState;
      }

      // Step 2: Agent submits status report JSON → process it
      return await processStatusReport(root, state, answer, activeConcerns);
    }

    case "BLOCKED": {
      // Unblock, record the resolution as a decision, return to execution
      const reason = state.execution.lastProgress ?? "Unknown";
      const decision: schema.Decision = {
        id: `d${state.decisions.length + 1}`,
        question: reason.replace(/^BLOCKED:\s*/, ""),
        choice: answer,
        promoted: false, // User can promote later via `rule add`
        timestamp: new Date().toISOString(),
      };

      let newState = machine.addDecision(state, decision);
      newState = machine.transition(newState, "EXECUTING");
      newState = {
        ...newState,
        execution: {
          ...newState.execution,
          lastProgress: `Resolved: ${answer}`,
        },
      };

      return newState;
    }

    default:
      return state;
  }
};

// =============================================================================
// Split Handling
// =============================================================================

const handleSplit = async (
  root: string,
  state: schema.StateFile,
): Promise<schema.StateFile> => {
  // Run split analysis
  const proposal = splitDetector.analyzeForSplit(state.discovery.answers);
  if (!proposal.detected || proposal.proposals.length === 0) {
    return state; // No split possible
  }

  const childNames: string[] = [];

  for (const item of proposal.proposals) {
    // Create spec directory
    const specDir = `${root}/${persistence.paths.specDir(item.name)}`;
    await runtime.fs.mkdir(specDir, { recursive: true });

    // Pre-fill discovery answers (only relevant ones)
    const relevantAnswers = state.discovery.answers.filter(
      (a) => item.relevantAnswers.includes(a.questionId),
    );

    // Create child state at DISCOVERY_REFINEMENT (answers pre-filled)
    const childState = machine.startSpec(
      schema.createInitialState(),
      item.name,
      `spec/${item.name}`,
    );

    // Add relevant answers
    let filledState = childState;
    for (const a of relevantAnswers) {
      filledState = machine.addDiscoveryAnswer(
        filledState,
        a.questionId,
        a.answer,
      );
    }

    // Transition to DISCOVERY_REFINEMENT
    filledState = machine.completeDiscovery(filledState);

    await persistence.writeSpecState(root, item.name, filledState);
    childNames.push(item.name);
  }

  // Cancel parent spec
  const parentCompleted = machine.completeSpec(
    state,
    "cancelled",
    `Split into: ${childNames.join(", ")}`,
  );

  return parentCompleted;
};

// =============================================================================
// Refinement Task Parsing
// =============================================================================

/**
 * Parse refinement text containing "task-N:" prefixed lines into task entries.
 * Splits ONLY on the task-N: prefix pattern, preserving full descriptions.
 */
export const parseRefinementTasks = (text: string): string[] => {
  return text
    .split(/(?=task-\d+:)/)
    .map((t) => t.replace(/[,;\n\s]+$/, "").trim())
    .filter((t) => /^task-\d+:/.test(t));
};

// =============================================================================
// Status Report Processing
// =============================================================================

const processStatusReport = async (
  root: string,
  state: schema.StateFile,
  answer: string,
  activeConcerns: readonly schema.ConcernDefinition[],
): Promise<schema.StateFile> => {
  // Try to parse the agent's status report as JSON
  let report: {
    completed?: string[];
    remaining?: string[];
    blocked?: string[];
    na?: string[];
    newIssues?: string[];
  };

  try {
    report = JSON.parse(answer);
  } catch {
    // If it's not JSON, treat the whole answer as a completion note
    // and clear the status report request
    return {
      ...state,
      execution: {
        ...state.execution,
        lastProgress: answer,
        awaitingStatusReport: false,
      },
    };
  }

  // ── Legacy migration: string[] debt → DebtItem[] ──
  let currentState = state;

  if (
    state.execution.debt !== null && state.execution.debt.items.length > 0 &&
    typeof state.execution.debt.items[0] === "string"
  ) {
    const legacyItems = state.execution.debt.items as unknown as string[];
    const migratedItems: schema.DebtItem[] = legacyItems.map((text, i) => ({
      id: `legacy-${i + 1}`,
      text,
      since: state.execution.debt!.fromIteration,
    }));
    currentState = {
      ...state,
      execution: {
        ...state.execution,
        debt: { ...state.execution.debt!, items: migratedItems },
      },
    };
    // Log migration for observability
    const encoder = new TextEncoder();
    const writer = runtime.process.stderr.getWriter();
    await writer.write(
      encoder.encode(
        "noskills: migrated legacy string[] debt to DebtItem[] format\n",
      ),
    );
    writer.releaseLock();
  }

  // ── Mandatory AC rejection ──
  // mandatory-tests and mandatory-docs cannot be marked N/A without justification
  const MANDATORY_AC_IDS = new Set(["mandatory-tests", "mandatory-docs"]);
  const naRaw = report.na ?? [];
  const rejectedMandatory = naRaw.filter((id) => MANDATORY_AC_IDS.has(id));
  if (rejectedMandatory.length > 0) {
    // Reject: return state unchanged with a rejection note in lastProgress
    return {
      ...currentState,
      execution: {
        ...currentState.execution,
        lastProgress:
          `REJECTED: Tests and documentation ACs require explicit justification to mark as N/A. Explain why tests or docs are not needed for this spec. Rejected IDs: ${
            rejectedMandatory.join(", ")
          }`,
        awaitingStatusReport: true,
      },
    };
  }

  // ── ID-based debt matching ──
  // completed/remaining/blocked: arrays of IDs referencing existing debt/AC items
  // na: IDs that don't apply to this task — removed permanently
  // newIssues: free-text strings for issues discovered during implementation
  const completedIds = report.completed ?? [];
  const completedSet = new Set(completedIds);
  const naIds = report.na ?? [];
  const naSet = new Set(naIds);
  const newIssueTexts = report.newIssues ?? [];
  const remainingIds = report.remaining ?? [];
  const blockedIds = report.blocked ?? [];
  const prevUnaddressed = currentState.execution.debt?.unaddressedIterations ??
    0;

  // Filter out completed AND N/A items from existing debt (match by ID)
  const survivingOldDebt = currentState.execution.debt !== null
    ? currentState.execution.debt.items.filter(
      (item) => !completedSet.has(item.id) && !naSet.has(item.id),
    )
    : [];

  // Create new debt items from newIssues with auto-increment IDs
  const counter = currentState.execution.debtCounter ?? 0;
  const newDebtItems: schema.DebtItem[] = newIssueTexts.map((text, i) => ({
    id: `debt-${counter + i + 1}`,
    text,
    since: currentState.execution.iteration,
  }));

  // Merge surviving old debt + newly discovered issues
  const allDebtItems = [...survivingOldDebt, ...newDebtItems];

  // Explicit completion signal: remaining=[] AND blocked=[] AND no new issues
  // When the agent says nothing remains, trust it — accept in one round-trip
  const explicitlyComplete = remainingIds.length === 0 &&
    blockedIds.length === 0 && newIssueTexts.length === 0;

  const mergedDebt: schema.DebtState | null =
    (explicitlyComplete || allDebtItems.length === 0) ? null : {
      items: allDebtItems,
      fromIteration: currentState.execution.debt?.fromIteration ??
        currentState.execution.iteration,
      unaddressedIterations: survivingOldDebt.length > 0
        ? prevUnaddressed + 1
        : 1,
    };

  // Persist N/A'd items so they're excluded from future criteria
  const updatedNaItems = [
    ...new Set([...(currentState.execution.naItems ?? []), ...naIds]),
  ];

  const progressParts: string[] = [];
  if (completedIds.length > 0) {
    progressParts.push(`Completed: ${completedIds.join(", ")}`);
  }
  if (naIds.length > 0) progressParts.push(`N/A: ${naIds.join(", ")}`);
  const progressSummary = progressParts.length > 0
    ? progressParts.join("; ")
    : "Status report submitted";

  // Task fully accepted: zero debt AND verification passed (or no verify configured)
  const verifyPassed = currentState.execution.lastVerification === null ||
    currentState.execution.lastVerification.passed === true;
  const taskComplete = mergedDebt === null && verifyPassed;

  // Updated debtCounter
  const newDebtCounter = counter + newIssueTexts.length;

  // ── Review-gate advancement ──
  // When criteriaScope === "review-gate", all spec tasks are already done.
  // The agent is evaluating concern review dimensions against the implementation.
  // taskComplete here means: the agent marked all current-concern dimensions as done.
  const criteriaScope = currentState.execution.criteriaScope;
  const gateConcernCursor = currentState.execution.gateConcernCursor ?? 0;

  if (criteriaScope === "review-gate") {
    // Use explicitlyComplete, not taskComplete: in gate mode allDebtItems is always
    // empty (no pre-existing debt), so taskComplete is always true regardless of
    // remaining dimensions. explicitlyComplete requires remaining:[] AND blocked:[].
    if (explicitlyComplete) {
      const concernsWithDims = concerns.getReviewDimensions(
          activeConcerns,
          currentState.classification,
        ).length > 0
        ? activeConcerns.filter(
          (c) =>
            concerns.getReviewDimensions([c], currentState.classification)
              .length > 0,
        )
        : [];
      const nextCursor = gateConcernCursor + 1;

      if (nextCursor >= concernsWithDims.length) {
        // All concerns reviewed — clear gate, return to normal execution
        // The compiler will then show "All tasks completed. Run `noskills done`."
        return {
          ...currentState,
          execution: {
            ...currentState.execution,
            criteriaScope: undefined,
            gateConcernCursor: undefined,
            awaitingStatusReport: false,
            debt: mergedDebt,
            debtCounter: newDebtCounter,
            naItems: updatedNaItems,
            lastProgress:
              "Review gate complete — all concern dimensions satisfied. Run `noskills done` to finish.",
          },
        };
      }

      // More concerns to review — advance cursor
      return {
        ...currentState,
        execution: {
          ...currentState.execution,
          criteriaScope: "review-gate",
          gateConcernCursor: nextCursor,
          awaitingStatusReport: true,
          debt: mergedDebt,
          debtCounter: newDebtCounter,
          naItems: updatedNaItems,
          lastProgress: `Review gate: concern ${
            concernsWithDims[nextCursor]?.name ?? String(nextCursor)
          } — submit findings`,
        },
      };
    }

    // Dimensions not all cleared — keep gate active
    return {
      ...currentState,
      execution: {
        ...currentState.execution,
        awaitingStatusReport: true,
        debt: mergedDebt,
        debtCounter: newDebtCounter,
        naItems: updatedNaItems,
        lastProgress:
          `Review gate: ${remainingIds.length} dimension(s) still remaining — verify them and resubmit with remaining:[]`,
      },
    };
  }

  // If task accepted, find the current task(s) and mark completed.
  // Supports batch: if the step-1 answer (lastProgress) contained a JSON
  // object with `completed: [id, ...]`, all matching tasks advance at once.
  if (taskComplete && currentState.spec !== null) {
    const parsed = await specParser.parseSpec(root, currentState.spec);
    if (parsed !== null) {
      const taskCompletedIds = currentState.execution.completedTasks ?? [];
      const taskCompletedSet = new Set(taskCompletedIds);

      // Try to extract batch task IDs from the step-1 answer (lastProgress)
      let batchIds: string[] = [];
      try {
        const prevAnswer = JSON.parse(
          currentState.execution.lastProgress ?? "",
        );
        if (Array.isArray(prevAnswer.completed)) {
          batchIds = (prevAnswer.completed as string[]).filter(
            (id: string) =>
              !taskCompletedSet.has(id) &&
              parsed.tasks.some((t) => t.id === id),
          );
        }
      } catch {
        // Not batch JSON — fall back to single task
      }

      // If no batch, find single current task (first incomplete)
      if (batchIds.length === 0) {
        const currentTask = parsed.tasks.find((t) =>
          !taskCompletedSet.has(t.id)
        );
        if (currentTask !== undefined) {
          batchIds = [currentTask.id];
        }
      }

      // Mark all batch tasks as completed
      const newlyCompleted: string[] = [];
      for (const taskId of batchIds) {
        await specUpdater.markTaskCompleted(root, currentState.spec, taskId);
        await specUpdater.updateProgressTask(
          root,
          currentState.spec,
          taskId,
          "done",
        );
        newlyCompleted.push(taskId);
      }

      if (newlyCompleted.length > 0) {
        const label = newlyCompleted.length === 1
          ? `Task ${newlyCompleted[0]} accepted`
          : `Tasks ${newlyCompleted.join(", ")} accepted`;

        const updatedCompletedTasks = [...taskCompletedIds, ...newlyCompleted];
        const allSpecTasksDone = parsed.tasks.every((t) =>
          updatedCompletedTasks.includes(t.id)
        );

        // If all spec tasks done and there are concern review dimensions,
        // enter review-gate instead of clearing awaitingStatusReport.
        if (allSpecTasksDone) {
          const concernsWithDims = activeConcerns.filter(
            (c) =>
              concerns.getReviewDimensions([c], currentState.classification)
                .length > 0,
          );
          if (concernsWithDims.length > 0) {
            return {
              ...currentState,
              execution: {
                ...currentState.execution,
                lastProgress:
                  `${label}: ${progressSummary}. All spec tasks complete — entering review gate.`,
                awaitingStatusReport: true,
                criteriaScope: "review-gate",
                gateConcernCursor: 0,
                debt: mergedDebt,
                completedTasks: updatedCompletedTasks,
                debtCounter: newDebtCounter,
                naItems: updatedNaItems,
              },
            };
          }
        }

        return {
          ...currentState,
          execution: {
            ...currentState.execution,
            lastProgress: `${label}: ${progressSummary}`,
            awaitingStatusReport: false,
            debt: mergedDebt,
            completedTasks: updatedCompletedTasks,
            debtCounter: newDebtCounter,
            naItems: updatedNaItems,
          },
        };
      }
    }
  }

  return {
    ...currentState,
    execution: {
      ...currentState.execution,
      lastProgress: taskComplete
        ? progressSummary
        : `Task not accepted — remaining items must be addressed first. ${progressSummary}`,
      awaitingStatusReport: false,
      debt: mergedDebt,
      debtCounter: newDebtCounter,
      naItems: updatedNaItems,
    },
  };
};

// =============================================================================
// Verification Runner
// =============================================================================

const runVerification = async (
  root: string,
  command: string,
): Promise<schema.VerificationResult> => {
  try {
    const { execSync } = await import("node:child_process");
    const output = execSync(command, {
      cwd: root,
      encoding: "utf-8",
      timeout: 60_000,
      stdio: ["pipe", "pipe", "pipe"],
    });

    return {
      passed: true,
      output: String(output).slice(0, 4000),
      timestamp: new Date().toISOString(),
    };
  } catch (err: unknown) {
    // execSync throws on non-zero exit — capture output from the error
    const execErr = err as {
      stdout?: string;
      stderr?: string;
      status?: number;
    };
    const output = ((execErr.stdout ?? "") + (execErr.stderr ?? "")).slice(
      0,
      4000,
    );

    if (execErr.status !== undefined) {
      // Command ran but returned non-zero exit code — verification failed
      return {
        passed: false,
        output: output || "Verification failed with no output",
        timestamp: new Date().toISOString(),
      };
    }

    // Command failed to execute entirely
    const message = err instanceof Error ? err.message : String(err);

    return {
      passed: false,
      output: `Verification command failed to execute: ${message}`,
      timestamp: new Date().toISOString(),
    };
  }
};

/**
 * Collect all touched files from two sources:
 * 1. state.execution.modifiedFiles — snapshot from stop hook at iteration end
 * 2. .eser/.state/progresses/files-changed.jsonl — real-time log from
 *    post-file-write hook
 *
 * Both sources are merged and deduplicated.
 */
const collectTouchedFiles = async (
  root: string,
  state: schema.StateFile,
): Promise<readonly string[]> => {
  const fromState = [...(state.execution.modifiedFiles ?? [])];
  const fromLog = await readFilesChangedLog(root);
  const merged = new Set([...fromState, ...fromLog]);

  return [...merged];
};

const readFilesChangedLog = async (
  root: string,
): Promise<readonly string[]> => {
  const logFile =
    `${root}/${persistence.paths.progressesDir}/files-changed.jsonl`;

  try {
    const content = await runtime.fs.readTextFile(logFile);
    const lines = content.trim().split("\n").filter(Boolean);
    const files: string[] = [];

    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as { file: string };
        if (!files.includes(entry.file)) {
          files.push(entry.file);
        }
      } catch {
        // skip malformed lines
      }
    }

    return files;
  } catch {
    return [];
  }
};
