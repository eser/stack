// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * spec/living.ts — Living Spec library.
 *
 * Pure functions for generating, updating, and checking the completeness of
 * .eser/specs/{name}/spec.md. Disk I/O is isolated to `applyAnswerToFile` and
 * `applyNaToFile` so the rest of the module is testable without a filesystem.
 *
 * Architecture: JSON state is the canonical truth; spec.md is the view.
 * The completeness gate reads from state, never from the markdown file.
 *
 * @module
 */

import * as yaml from "yaml";
import * as schema from "../state/schema.ts";
import { runtime } from "@eserstack/standards/cross-runtime";

// =============================================================================
// Base sections (always present in every spec)
// =============================================================================

export type BaseSection = {
  readonly id: string;
  readonly title: string;
  readonly placeholder: string;
  readonly position: string;
};

export const BASE_SECTIONS: readonly BaseSection[] = [
  {
    id: "summary",
    title: "Summary",
    placeholder:
      "_Synthesize the spec in 2-3 sentences: what changes, why it matters, for whom._",
    position: "base:0",
  },
  {
    id: "problem-statement",
    title: "Problem Statement",
    placeholder:
      "_Describe the current pain: what is broken, missing, or inefficient? For whom? What happens today when they try?_",
    position: "base:1",
  },
  {
    id: "ambition",
    title: "Ambition",
    placeholder:
      "_What does success look like? Paint the 12-month ideal state — not just this feature, but the trajectory it starts._",
    position: "base:2",
  },
  {
    id: "reversibility",
    title: "Reversibility",
    placeholder:
      "_If this ships and is wrong, how do we undo it? Rollback steps, feature flags, migration reversibility, blast radius._",
    position: "base:3",
  },
  {
    id: "user-impact",
    title: "User Impact",
    placeholder:
      "_Who benefits and how? What changes for them — before/after their day, their workflow, their frustration?_",
    position: "base:4",
  },
  {
    id: "verification-strategy",
    title: "Verification Strategy",
    placeholder:
      "_How will we know it worked? Automated tests, manual smoke tests, metrics to watch, acceptance checklist._",
    position: "base:5",
  },
  {
    id: "scope-boundary",
    title: "Scope Boundary",
    placeholder:
      "_What is explicitly OUT of scope? Name specific features, use cases, or edge cases this spec does NOT address._",
    position: "base:6",
  },
  {
    id: "premises",
    title: "Premises",
    placeholder:
      "_List every assumption this spec makes. If an assumption turns out wrong, what breaks?_",
    position: "base:7",
  },
  {
    id: "tasks",
    title: "Tasks",
    placeholder:
      "_Break implementation into concrete tasks. Each task: what it does, how to verify it is done, any ordering constraints._",
    position: "base:8",
  },
  {
    id: "acceptance-criteria",
    title: "Acceptance Criteria",
    placeholder:
      "_Binary, testable criteria. Each item: the system does X when Y. No fuzzy language._",
    position: "base:9",
  },
];

// =============================================================================
// Merged section type
// =============================================================================

/** A fully resolved spec section with all fields present. */
export type SpecSection = {
  readonly id: string;
  readonly title: string;
  readonly placeholder: string;
  readonly condition: string | null;
  readonly position: string;
  /** Id of the concern that contributed this section; absent for base sections. */
  readonly concernSource?: string;
};

// =============================================================================
// Section normalization (backward compat migration ramp)
// =============================================================================

/**
 * Normalize a ConcernDefinition.specSections entry to SpecSectionDefinition.
 * Supports the legacy string[] format — auto-migrates with synthetic ids.
 * Logs a deprecation warning so library authors know to upgrade.
 */
const normalizeSection = (
  concernId: string,
  raw: schema.SpecSectionDefinition | string,
  idx: number,
): schema.SpecSectionDefinition => {
  if (typeof raw === "string") {
    const id = `${concernId}-${
      raw.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
    }`;
    return {
      id,
      title: raw,
      placeholder: `_${raw}: to be addressed during discovery._`,
      condition: null,
      position: `after:tasks:${idx}`,
    };
  }
  return raw;
};

// =============================================================================
// Section merging
// =============================================================================

/**
 * Merge base sections + concern-contributed sections into a single ordered list.
 * Concern sections use `position: "after:section-id"` to anchor to a base section.
 * Sections referencing an unknown anchor are appended after `acceptance-criteria`.
 */
export const mergeSections = (
  activeConcerns: readonly schema.ConcernDefinition[],
): readonly SpecSection[] => {
  const base: SpecSection[] = BASE_SECTIONS.map((s) => ({
    ...s,
    condition: null,
  }));
  const baseIds = new Set(base.map((s) => s.id));

  // Collect concern sections with normalized shape
  const insertAfter = new Map<string, SpecSection[]>();

  for (const concern of activeConcerns) {
    for (let i = 0; i < concern.specSections.length; i++) {
      const raw = concern.specSections[i]!;
      const normalized = normalizeSection(concern.id, raw, i);
      const section: SpecSection = { ...normalized, concernSource: concern.id };

      const afterMatch = normalized.position.match(/^after:([^:]+)/);
      const anchorCandidate = afterMatch !== null ? afterMatch[1] : undefined;
      const anchor =
        anchorCandidate !== undefined && baseIds.has(anchorCandidate)
          ? anchorCandidate
          : "acceptance-criteria";

      const existing = insertAfter.get(anchor) ?? [];
      insertAfter.set(anchor, [...existing, section]);
    }
  }

  // Build the ordered list by interleaving concern sections after their anchor
  const result: SpecSection[] = [];
  for (const baseSection of base) {
    result.push(baseSection);
    const extras = insertAfter.get(baseSection.id) ?? [];
    result.push(...extras);
  }

  return result;
};

// =============================================================================
// Classification-driven visibility
// =============================================================================

type ClassificationFlag = (c: schema.SpecClassification) => boolean;

const CLASSIFICATION_CONDITIONS: Record<string, ClassificationFlag> = {
  involvesWebUI: (c) => c.involvesWebUI,
  involvesCLI: (c) => c.involvesCLI,
  involvesPublicAPI: (c) => c.involvesPublicAPI,
  involvesMigration: (c) => c.involvesMigration,
  involvesDataHandling: (c) => c.involvesDataHandling,
};

/**
 * Re-evaluate which sections are visible under the given classification.
 * Conditional sections flip between `conditional-hidden` and `placeholder` as
 * classification flags change. Already-filled or N/A sections are unaffected.
 */
export const applyClassificationToPlaceholders = (
  placeholders: readonly schema.PlaceholderStatus[],
  sectionDefs: readonly SpecSection[],
  classification: schema.SpecClassification | null,
): readonly schema.PlaceholderStatus[] => {
  const defMap = new Map<string, SpecSection>(
    sectionDefs.map((s) => [s.id, s]),
  );

  return placeholders.map((p) => {
    const def = defMap.get(p.sectionId);
    if (def === undefined || def.condition === null) return p;

    // Don't change already-filled or N/A sections
    if (p.status === "filled" || p.status === "na") return p;

    const condFn = CLASSIFICATION_CONDITIONS[def.condition];
    if (condFn === undefined) return p;

    const shouldBeVisible = classification !== null && condFn(classification);

    if (shouldBeVisible && p.status === "conditional-hidden") {
      return { ...p, status: "placeholder" as const };
    }
    if (!shouldBeVisible && p.status === "placeholder") {
      return { ...p, status: "conditional-hidden" as const };
    }
    return p;
  });
};

/**
 * Build a human-readable string describing which classification flags changed.
 * Used by Expansion F (conditional reveal notifications) to explain why sections appeared.
 */
export const classificationReasonText = (
  prev: schema.SpecClassification | null,
  next: schema.SpecClassification | null,
): string => {
  if (next === null) return "unknown";
  const labels: Array<[keyof schema.SpecClassification, string]> = [
    ["involvesWebUI", "UI work"],
    ["involvesCLI", "CLI interaction"],
    ["involvesPublicAPI", "public API changes"],
    ["involvesMigration", "migration or deprecation"],
    ["involvesDataHandling", "data handling"],
  ];
  const changes: string[] = [];
  for (const [key, label] of labels) {
    if (key === "source" || key === "inferredFrom") continue;
    const prevVal = prev !== null ? Boolean(prev[key]) : false;
    const nextVal = Boolean(next[key]);
    if (!prevVal && nextVal) changes.push(label);
  }
  return changes.length > 0
    ? changes.join(", ")
    : "project classification update";
};

// =============================================================================
// Reveal notifications (Expansion F helper)
// =============================================================================

export type RevealNotification = {
  readonly revealed: readonly string[];
  readonly hidden: readonly string[];
};

/**
 * Compare two placeholder arrays and return which section IDs became visible or hidden.
 * Returns null when there is no change — callers can skip the output block entirely.
 */
export const getRevealNotification = (
  prev: readonly schema.PlaceholderStatus[],
  next: readonly schema.PlaceholderStatus[],
): RevealNotification | null => {
  const prevVisible = new Set(
    prev.filter((p) => p.status !== "conditional-hidden").map((p) =>
      p.sectionId
    ),
  );
  const nextVisible = new Set(
    next.filter((p) => p.status !== "conditional-hidden").map((p) =>
      p.sectionId
    ),
  );
  const revealed = [...nextVisible].filter((id) => !prevVisible.has(id));
  const hidden = [...prevVisible].filter((id) => !nextVisible.has(id));
  if (revealed.length === 0 && hidden.length === 0) return null;
  return { revealed, hidden };
};

// =============================================================================
// TOC rendering (Expansion A)
// =============================================================================

const STATUS_SYMBOLS: Record<schema.PlaceholderStatus["status"], string> = {
  filled: "✓",
  placeholder: "○",
  na: "—",
  "conditional-hidden": "⊘",
};

const TOC_START = "<!-- TOC:START -->";
const TOC_END = "<!-- TOC:END -->";

/**
 * Render a table-of-contents block from the current placeholder state.
 * Wrapped in HTML comment markers for atomic replacement by `replaceTOCBlock`.
 */
export const renderTOC = (
  placeholders: readonly schema.PlaceholderStatus[],
): string => {
  const lines: string[] = [TOC_START, "## Sections"];
  for (const p of placeholders) {
    const sym = STATUS_SYMBOLS[p.status];
    if (p.status === "na" && p.naReason !== undefined) {
      lines.push(`- ${sym} ${p.sectionTitle} _(N/A: ${p.naReason})_`);
    } else if (p.status === "conditional-hidden") {
      lines.push(`- ${sym} ${p.sectionTitle} _(hidden — condition not met)_`);
    } else {
      lines.push(`- ${sym} ${p.sectionTitle}`);
    }
  }
  lines.push(TOC_END);
  return lines.join("\n");
};

// =============================================================================
// Frontmatter (YAML round-trip)
// =============================================================================

const FRONTMATTER_DELIMITER = "---";

/** Parse YAML frontmatter from spec.md content. */
export const parseFrontmatter = (
  content: string,
): { readonly metadata: schema.SpecMetadata; readonly body: string } => {
  const lines = content.split("\n");
  if (lines[0] !== FRONTMATTER_DELIMITER) {
    return {
      metadata: {
        created: { date: "", user: "" },
        lastModified: { date: "", user: "" },
        contributors: [],
        approvals: [],
        pendingDecisions: [],
      },
      body: content,
    };
  }
  const endIdx = lines.indexOf(FRONTMATTER_DELIMITER, 1);
  if (endIdx === -1) {
    throw new Error(
      "spec.md frontmatter is malformed: found opening --- but no closing ---. " +
        "Inspect the file manually and restore a valid YAML frontmatter block.",
    );
  }
  const yamlStr = lines.slice(1, endIdx).join("\n");
  const parsed = yaml.parse(yamlStr) as schema.SpecMetadata;
  const body = lines.slice(endIdx + 1).join("\n");
  return { metadata: parsed, body };
};

/**
 * Render SpecMetadata as a YAML frontmatter block.
 * Does NOT include a trailing newline — callers must add a separator when joining.
 */
export const renderFrontmatter = (metadata: schema.SpecMetadata): string => {
  const yamlStr = yaml.stringify(metadata, { lineWidth: 0 });
  // yaml.stringify ends with \n; trim it so the block ends cleanly with ---
  return `${FRONTMATTER_DELIMITER}\n${yamlStr.trimEnd()}\n${FRONTMATTER_DELIMITER}`;
};

// =============================================================================
// Placeholder marker replacement
// =============================================================================

export const placeholderMarker = (sectionId: string): string =>
  `<!-- PLACEHOLDER:${sectionId} -->`;

/**
 * Replace the placeholder marker for `sectionId` with `body` in the content string.
 * Throws if the marker is not found — this indicates spec.md corruption or a
 * section that was already filled. Callers should handle this error by surfacing
 * it to the user rather than silently overwriting.
 */
export const replacePlaceholderMarker = (
  content: string,
  sectionId: string,
  body: string,
): string => {
  const marker = placeholderMarker(sectionId);
  if (!content.includes(marker)) {
    throw new Error(
      `Placeholder marker not found for section "${sectionId}". ` +
        "spec.md may have been manually edited or this section was already filled. " +
        "Inspect the file and restore the marker, or mark the section as filled in state JSON directly.",
    );
  }
  return content.replace(marker, body);
};

/**
 * Replace the TOC block (between TOC markers) with a freshly rendered TOC.
 * Gracefully skips if no TOC block is found.
 */
export const replaceTOCBlock = (
  content: string,
  placeholders: readonly schema.PlaceholderStatus[],
): string => {
  const startIdx = content.indexOf(TOC_START);
  const endIdx = content.indexOf(TOC_END);
  if (startIdx === -1 || endIdx === -1) return content;
  const newToc = renderTOC(placeholders);
  return content.slice(0, startIdx) + newToc +
    content.slice(endIdx + TOC_END.length);
};

// =============================================================================
// Placeholder state mutations (pure)
// =============================================================================

/** Mark a placeholder as filled. Returns a new placeholders array (pure). */
export const markPlaceholderFilled = (
  placeholders: readonly schema.PlaceholderStatus[],
  sectionId: string,
  user: string,
  now: Date,
  source: "STATED" | "INFERRED" = "STATED",
): readonly schema.PlaceholderStatus[] =>
  placeholders.map((p) =>
    p.sectionId === sectionId
      ? {
        ...p,
        status: "filled" as const,
        filledBy: user,
        filledAt: now.toISOString(),
        source,
      }
      : p
  );

/**
 * Mark a placeholder as N/A with a required reason.
 * Reason must be ≥20 chars (matches Jidoka I1 answer length rule).
 * Throws if reason is blank or too short — do not silently accept vague N/As.
 */
export const markPlaceholderNa = (
  placeholders: readonly schema.PlaceholderStatus[],
  sectionId: string,
  reason: string,
  user: string,
  now: Date,
): readonly schema.PlaceholderStatus[] => {
  if (reason.trim().length < 20) {
    throw new Error(
      `N/A reason for "${sectionId}" is too short (${reason.trim().length} chars, minimum 20). ` +
        "Provide a specific reason why this section does not apply. " +
        "Vague N/As are hand-waving — the Jidoka gate will reject them.",
    );
  }
  return placeholders.map((p) =>
    p.sectionId === sectionId
      ? {
        ...p,
        status: "na" as const,
        naReason: reason.trim(),
        naBy: user,
        naAt: now.toISOString(),
      }
      : p
  );
};

// =============================================================================
// Completeness check (pure — reads only from state JSON)
// =============================================================================

/**
 * Check whether the spec is complete enough to advance to SPEC_PROPOSAL.
 *
 * Rules:
 * - `conditional-hidden` sections are NOT required (not visible to the user).
 * - `filled` sections are resolved.
 * - `na` with a valid reason (≥20 chars) is resolved.
 * - `na` WITHOUT a reason is unresolved — closes the hand-waving escape hatch.
 * - `placeholder` is always unresolved.
 * - Pending decisions block advancement.
 */
export const checkSpecCompleteness = (
  specState: schema.SpecState,
): {
  readonly canAdvance: boolean;
  readonly unresolvedSections: readonly {
    readonly sectionId: string;
    readonly sectionTitle: string;
  }[];
  readonly pendingDecisions: readonly schema.PendingDecision[];
} => {
  const unresolvedSections = specState.placeholders
    .filter((p) => {
      if (p.status === "conditional-hidden") return false;
      if (p.status === "filled") return false;
      if (
        p.status === "na" && p.naReason !== undefined &&
        p.naReason.trim().length >= 20
      ) {
        return false;
      }
      return true;
    })
    .map((p) => ({ sectionId: p.sectionId, sectionTitle: p.sectionTitle }));

  const pendingDecisions = specState.metadata.pendingDecisions;

  return {
    canAdvance: unresolvedSections.length === 0 &&
      pendingDecisions.length === 0,
    unresolvedSections,
    pendingDecisions,
  };
};

// =============================================================================
// Metadata mutations (pure)
// =============================================================================

export type MetadataAction =
  | { readonly type: "answer"; readonly user: string; readonly section: string }
  | {
    readonly type: "delegation-created";
    readonly user: string;
    readonly section: string;
    readonly question: string;
    readonly waitingFor: readonly string[];
  }
  | {
    readonly type: "delegation-answered";
    readonly user: string;
    readonly section: string;
  }
  | { readonly type: "approval"; readonly user: string }
  | { readonly type: "note"; readonly user: string };

/**
 * Apply a metadata mutation action. Returns a new SpecMetadata (pure transform).
 * Every action updates `lastModified` and upserts into `contributors`.
 */
export const applyMetadataAction = (
  metadata: schema.SpecMetadata,
  action: MetadataAction,
  now: Date,
): schema.SpecMetadata => {
  const dateStr = now.toISOString();
  const lastModified = { date: dateStr, user: action.user };

  const newEntry: schema.ContributorEntry = {
    user: action.user,
    lastAction: action.type,
    date: dateStr,
  };
  const existingIdx = metadata.contributors.findIndex((c) =>
    c.user === action.user
  );
  const contributors = existingIdx >= 0
    ? metadata.contributors.map((c, i) => i === existingIdx ? newEntry : c)
    : [...metadata.contributors, newEntry];

  switch (action.type) {
    case "delegation-created": {
      const decision: schema.PendingDecision = {
        section: action.section,
        question: action.question,
        waitingFor: action.waitingFor,
      };
      return {
        ...metadata,
        lastModified,
        contributors,
        pendingDecisions: [...metadata.pendingDecisions, decision],
      };
    }
    case "delegation-answered":
      return {
        ...metadata,
        lastModified,
        contributors,
        pendingDecisions: metadata.pendingDecisions.filter((d) =>
          d.section !== action.section
        ),
      };
    case "approval": {
      const existingApprovalIdx = metadata.approvals.findIndex((a) =>
        a.user === action.user
      );
      const newApproval: schema.ApprovalEntry = {
        user: action.user,
        status: "approved",
        date: dateStr,
      };
      const approvals = existingApprovalIdx >= 0
        ? metadata.approvals.map((a, i) =>
          i === existingApprovalIdx ? newApproval : a
        )
        : [...metadata.approvals, newApproval];
      return { ...metadata, lastModified, contributors, approvals };
    }
    default:
      return { ...metadata, lastModified, contributors };
  }
};

// =============================================================================
// Question ID → Section ID mapping
// =============================================================================

/** Map discovery question IDs to the spec section they populate. */
const QUESTION_TO_SECTION: Record<string, string> = {
  status_quo: "problem-statement",
  user_impact: "user-impact",
  ambition: "ambition",
  scope_boundary: "scope-boundary",
  verification: "verification-strategy",
  reversibility: "reversibility",
};

export const questionIdToSectionId = (questionId: string): string =>
  QUESTION_TO_SECTION[questionId] ?? questionId;

// =============================================================================
// Initial spec generation
// =============================================================================

/**
 * Generate the initial spec.md content and associated state.
 * Called from `spec new` immediately after the directory + state file are written.
 *
 * The output is a complete, immediately renderable markdown document with:
 * - YAML frontmatter (metadata)
 * - A live TOC with all sections in placeholder status
 * - One section heading + placeholder marker per visible section
 * - Conditional sections omitted until classification reveals them
 */
export const generateInitialSpec = (args: {
  readonly specName: string;
  readonly activeConcerns: readonly schema.ConcernDefinition[];
  readonly classification: schema.SpecClassification | null;
  readonly creator: { readonly name: string; readonly email: string };
  readonly now: Date;
}): {
  readonly content: string;
  readonly placeholders: readonly schema.PlaceholderStatus[];
  readonly metadata: schema.SpecMetadata;
} => {
  const { specName, activeConcerns, classification, creator, now } = args;
  const dateStr = now.toISOString();

  const sectionDefs = mergeSections(activeConcerns);

  // Build initial placeholder state
  const placeholders: schema.PlaceholderStatus[] = sectionDefs.map((s) => {
    if (s.condition === null) {
      return {
        sectionId: s.id,
        sectionTitle: s.title,
        status: "placeholder" as const,
        concernSource: s.concernSource,
      };
    }
    const condFn = CLASSIFICATION_CONDITIONS[s.condition];
    const isVisible = classification !== null && condFn !== undefined &&
      condFn(classification);
    return {
      sectionId: s.id,
      sectionTitle: s.title,
      status: isVisible
        ? "placeholder" as const
        : "conditional-hidden" as const,
      concernSource: s.concernSource,
    };
  });

  const metadata: schema.SpecMetadata = {
    created: { date: dateStr, user: creator.name },
    lastModified: { date: dateStr, user: creator.name },
    contributors: [{
      user: creator.name,
      lastAction: "created",
      date: dateStr,
    }],
    approvals: [],
    pendingDecisions: [],
  };

  // Build document parts
  const parts: string[] = [];
  parts.push(renderFrontmatter(metadata));
  parts.push(`# Spec: ${specName}`);
  parts.push(renderTOC(placeholders));

  for (const sec of sectionDefs) {
    const p = placeholders.find((px) => px.sectionId === sec.id);
    if (p === undefined || p.status === "conditional-hidden") continue;
    parts.push(
      `## ${sec.title}\n\n${placeholderMarker(sec.id)}\n${sec.placeholder}`,
    );
  }

  return {
    content: parts.join("\n\n"),
    placeholders,
    metadata,
  };
};

// =============================================================================
// File mutation (disk I/O — only functions below perform filesystem operations)
// =============================================================================

/**
 * Apply a discovery answer to spec.md on disk.
 *
 * Algorithm (one read, one write):
 * 1. Read the file.
 * 2. Parse frontmatter to extract the body.
 * 3. Replace the placeholder marker for `sectionId` with the answer body + attribution.
 * 4. Regenerate the TOC block from the updated `visiblePlaceholders`.
 * 5. If classification changed, reveal newly visible sections and remove newly hidden ones.
 * 6. Re-render frontmatter from the updated `metadata`.
 * 7. Write the file once.
 *
 * Throws if the placeholder marker is not found (indicates manual edit / corruption).
 */
export const applyAnswerToFile = async (args: {
  readonly path: string;
  readonly sectionId: string;
  readonly body: string;
  readonly attribution: { readonly user: string; readonly date: Date };
  readonly metadata: schema.SpecMetadata;
  readonly visiblePlaceholders: readonly schema.PlaceholderStatus[];
  readonly classificationChanged: boolean;
  readonly newlyRevealedSections?: readonly SpecSection[];
  readonly newlyHiddenIds?: readonly string[];
}): Promise<void> => {
  const { path, sectionId, body, attribution, metadata, visiblePlaceholders } =
    args;

  const raw = await runtime.fs.readTextFile(path);
  const { body: docBody } = parseFrontmatter(raw);
  const newFrontmatter = renderFrontmatter(metadata);

  const dateStr = attribution.date.toISOString().split("T")[0];
  const answerBody =
    `${body}\n\n_Answered by ${attribution.user} on ${dateStr}_`;

  let newBody = replacePlaceholderMarker(docBody, sectionId, answerBody);
  newBody = replaceTOCBlock(newBody, visiblePlaceholders);

  if (args.classificationChanged) {
    // Reveal newly visible sections: append heading + marker at end
    for (const sec of args.newlyRevealedSections ?? []) {
      newBody += `\n\n## ${sec.title}\n\n${
        placeholderMarker(sec.id)
      }\n${sec.placeholder}`;
    }
    // Hide sections: remove heading + marker block
    for (const hiddenId of args.newlyHiddenIds ?? []) {
      const marker = placeholderMarker(hiddenId);
      const markerIdx = newBody.indexOf(marker);
      if (markerIdx === -1) continue;
      // Walk backward to find the nearest ## heading
      const beforeMarker = newBody.slice(0, markerIdx);
      const headingMatch = /\n## [^\n]+\n/.exec(
        beforeMarker.slice(beforeMarker.lastIndexOf("\n## ")),
      );
      if (headingMatch === null) continue;
      const headingStart = beforeMarker.lastIndexOf("\n## ");
      // Find end of marker line
      const markerLineEnd = newBody.indexOf("\n", markerIdx) + 1;
      newBody = newBody.slice(0, headingStart) + newBody.slice(markerLineEnd);
    }
  }

  // Re-render frontmatter + body. body already has a leading \n from parseFrontmatter.
  await runtime.fs.writeTextFile(path, `${newFrontmatter}\n${newBody}`);
};

/**
 * Apply an N/A marking to spec.md on disk.
 * Similar to `applyAnswerToFile` but renders the N/A surface line.
 */
export const applyNaToFile = async (args: {
  readonly path: string;
  readonly sectionId: string;
  readonly reason: string;
  readonly attribution: { readonly user: string; readonly date: Date };
  readonly metadata: schema.SpecMetadata;
  readonly visiblePlaceholders: readonly schema.PlaceholderStatus[];
}): Promise<void> => {
  const {
    path,
    sectionId,
    reason,
    attribution,
    metadata,
    visiblePlaceholders,
  } = args;

  const raw = await runtime.fs.readTextFile(path);
  const { body: docBody } = parseFrontmatter(raw);
  const newFrontmatter = renderFrontmatter(metadata);

  const dateStr = attribution.date.toISOString().split("T")[0];
  const naBody = `_Marked N/A by ${attribution.user} on ${dateStr}: ${reason}_`;

  let newBody = replacePlaceholderMarker(docBody, sectionId, naBody);
  newBody = replaceTOCBlock(newBody, visiblePlaceholders);

  await runtime.fs.writeTextFile(path, `${newFrontmatter}\n${newBody}`);
};

/**
 * Copy src spec.md to an immutable snapshot path.
 * Skips silently if dstPath already exists — snapshots are write-once.
 * Call from commands/next.ts after phase transitions, not from machine.ts.
 * Note: stat failure for reasons other than ENOENT incorrectly proceeds to write —
 * acceptable best-effort (outer .catch() absorbs the write failure).
 */
export const createSpecSnapshot = async (
  srcPath: string,
  dstPath: string,
): Promise<void> => {
  try {
    await runtime.fs.stat(dstPath);
    return; // already exists — immutable, skip
  } catch {
    // doesn't exist — proceed
  }
  const content = await runtime.fs.readTextFile(srcPath);
  await runtime.fs.writeTextFile(dstPath, content);
};
