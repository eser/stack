// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Split detector — analyzes discovery answers for independent work areas
 * and proposes spec splitting when appropriate.
 *
 * @module
 */

import type * as schema from "../state/schema.ts";

// =============================================================================
// Types
// =============================================================================

export type SplitProposalItem = {
  readonly name: string;
  readonly description: string;
  readonly estimatedTasks: number;
  readonly relevantAnswers: readonly string[];
};

export type SplitProposal = {
  readonly detected: boolean;
  readonly reason: string;
  readonly proposals: readonly SplitProposalItem[];
};

// =============================================================================
// Constants
// =============================================================================

const NO_SPLIT: SplitProposal = {
  detected: false,
  reason: "",
  proposals: [],
};

/** Separator words/phrases that indicate independent work areas. */
const SEPARATOR_PATTERNS: readonly RegExp[] = [
  /\badditionally\b/i,
  /\bseparately\b/i,
  /\band also\b/i,
  /\banother issue\b/i,
  /\bsecond problem\b/i,
  /\bon the other hand\b/i,
  /\bplus\b/i,
];

/** "Also" at sentence boundary (not mid-phrase like "also affects"). */
const ALSO_SENTENCE_PATTERN = /(?:^|[.!?]\s+)also[,\s]/im;

/** Numbered list patterns. */
const NUMBERED_LIST_PATTERN =
  /(?:^|\n|\.\s+)\s*(?:\(\d+\)|\d+\.\s|(?:first|second|third|fourth|fifth)[:;,])/im;

/** AND joining unrelated verb phrases: "fix X AND restore Y". */
const AND_VERB_PATTERN =
  /\b(fix|add|restore|update|remove|refactor|rewrite|implement|create|migrate|convert)\s+\S+(?:\s+\S+){0,4}\s+AND\s+(fix|add|restore|update|remove|refactor|rewrite|implement|create|migrate|convert)\s+/i;

/** Coupling indicators — one area references another's output. */
const COUPLING_PATTERNS: readonly RegExp[] = [
  /\buse\s+(?:the\s+)?(?:new\s+)?(\w+)\s+(?:type|interface|class|module|function)\b/i,
  /\bafter\s+(?:adding|creating|implementing)\b/i,
  /\bdepends\s+on\b/i,
  /\bprerequisite\b/i,
  /\brequires\s+(?:the\s+)?(?:above|previous|first)\b/i,
  /\bthen\s+use\b/i,
];

// =============================================================================
// Public API
// =============================================================================

/**
 * Analyze discovery answers for independent work areas.
 * Returns a split proposal if 2+ independent areas detected.
 */
export const analyzeForSplit = (
  answers: readonly schema.DiscoveryAnswer[],
  discoveryMode?: string,
): SplitProposal => {
  // Never propose split in ship-fast mode
  if (discoveryMode === "ship-fast") return NO_SPLIT;

  const answerMap = new Map<string, string>();
  for (const a of answers) {
    answerMap.set(a.questionId, a.answer);
  }

  const statusQuo = answerMap.get("status_quo") ?? "";
  const ambition = answerMap.get("ambition") ?? "";
  const scopeBoundary = answerMap.get("scope_boundary") ?? "";
  const verification = answerMap.get("verification") ?? "";

  // Detect independent areas from numbered lists and separation markers
  const areas = detectAreas(statusQuo, ambition, scopeBoundary, verification);

  // Don't propose split for tightly coupled areas or small specs
  if (areas.length < 2) return NO_SPLIT;

  const totalEstimatedTasks = areas.reduce(
    (sum, a) => sum + a.estimatedTasks,
    0,
  );
  if (totalEstimatedTasks <= 3) return NO_SPLIT;

  // Check for tight coupling (sequential dependencies)
  if (areTightlyCoupled(areas)) return NO_SPLIT;

  return {
    detected: true,
    reason:
      `Discovery answers cover ${areas.length} independent areas that could be separate specs.`,
    proposals: areas,
  };
};

// =============================================================================
// Area Detection
// =============================================================================

type RawArea = {
  readonly text: string;
  readonly sourceQuestions: readonly string[];
};

/**
 * Detect independent work areas from discovery answer texts.
 *
 * Heuristics:
 * 1. Numbered lists in statusQuo or ambition
 * 2. Separator words: "also", "additionally", "separately", etc.
 * 3. AND patterns joining unrelated verbs
 */
const detectAreas = (
  statusQuo: string,
  ambition: string,
  _scopeBoundary: string,
  _verification: string,
): readonly SplitProposalItem[] => {
  // Try numbered list detection first (most reliable signal)
  const numberedAreas = detectNumberedLists(statusQuo, ambition);
  if (numberedAreas.length >= 2) {
    return numberedAreas.map(toProposalItem);
  }

  // Try separator word detection
  const separatorAreas = detectBySeparators(statusQuo, ambition);
  if (separatorAreas.length >= 2) {
    return separatorAreas.map(toProposalItem);
  }

  // Try AND pattern detection
  const andAreas = detectByAndPattern(statusQuo, ambition);
  if (andAreas.length >= 2) {
    return andAreas.map(toProposalItem);
  }

  return [];
};

/**
 * Detect areas from numbered list patterns like "(1)...(2)..." or "1. ... 2. ..."
 * or "First: ... Second: ...".
 */
const detectNumberedLists = (
  statusQuo: string,
  ambition: string,
): readonly RawArea[] => {
  // Check each source text for numbered patterns
  for (
    const [text, questionId] of [
      [statusQuo, "status_quo"],
      [ambition, "ambition"],
    ] as const
  ) {
    if (!NUMBERED_LIST_PATTERN.test(text)) continue;

    const items = splitNumberedList(text);
    if (items.length >= 2) {
      return items.map((item) => ({
        text: item.trim(),
        sourceQuestions: [questionId],
      }));
    }
  }

  return [];
};

/**
 * Split text on numbered list boundaries.
 */
const splitNumberedList = (text: string): readonly string[] => {
  // Try parenthesized numbers: (1) ... (2) ...
  const parenParts = text.split(/\(\d+\)\s*/);
  // First element is preamble before (1) — drop it, keep only numbered items
  const parenItems = parenParts.slice(1).map((p) => p.trim()).filter(
    (p) => p.length > 0,
  );
  if (parenItems.length >= 2) return parenItems;

  // Try "N. " pattern — can appear at start of line or after sentence boundary
  const dotParts = text.split(/(?:^|\n|(?<=\.)\s+)\s*\d+\.\s+/);
  // Drop preamble (first element before "1. "), keep numbered items
  const dotItems = dotParts.length > 1
    ? dotParts.slice(1).map((p) => p.trim()).filter((p) => p.length > 0)
    : [];
  if (dotItems.length >= 2) return dotItems;

  // Try "First: ... Second: ..." pattern — can appear anywhere
  const ordinalPattern =
    /(?:^|\n|(?<=\.)\s+)\s*(?:first|second|third|fourth|fifth)[:;,]\s*/i;
  const ordinalParts = text.split(ordinalPattern);
  // Drop preamble, keep ordinal items
  const ordinalItems = ordinalParts.length > 1
    ? ordinalParts.slice(1).map((p) => p.trim()).filter((p) => p.length > 0)
    : [];
  if (ordinalItems.length >= 2) return ordinalItems;

  return [];
};

/**
 * Detect areas by separator words like "additionally", "also", "separately".
 */
const detectBySeparators = (
  statusQuo: string,
  ambition: string,
): readonly RawArea[] => {
  for (
    const [text, questionId] of [
      [statusQuo, "status_quo"],
      [ambition, "ambition"],
    ] as const
  ) {
    // Check for "also" at sentence boundary
    if (ALSO_SENTENCE_PATTERN.test(text)) {
      const parts = splitOnSeparator(text, ALSO_SENTENCE_PATTERN);
      if (parts.length >= 2) {
        return parts.map((p) => ({
          text: p.trim(),
          sourceQuestions: [questionId],
        }));
      }
    }

    // Check other separator patterns
    for (const pattern of SEPARATOR_PATTERNS) {
      if (pattern.test(text)) {
        const parts = text.split(pattern).map((p) => p.trim()).filter(
          (p) => p.length > 0,
        );
        if (parts.length >= 2) {
          return parts.map((p) => ({
            text: p,
            sourceQuestions: [questionId],
          }));
        }
      }
    }
  }

  return [];
};

/**
 * Split text on a separator pattern, keeping both sides.
 */
const splitOnSeparator = (
  text: string,
  pattern: RegExp,
): readonly string[] => {
  const match = text.match(pattern);
  if (match === null || match.index === undefined) return [];

  const before = text.slice(0, match.index).trim();
  const after = text.slice(match.index + match[0].length).trim();

  if (before.length > 0 && after.length > 0) {
    return [before, after];
  }

  return [];
};

/**
 * Detect areas from "fix X AND restore Y" patterns.
 */
const detectByAndPattern = (
  statusQuo: string,
  ambition: string,
): readonly RawArea[] => {
  for (
    const [text, questionId] of [
      [statusQuo, "status_quo"],
      [ambition, "ambition"],
    ] as const
  ) {
    const match = AND_VERB_PATTERN.exec(text);
    if (match !== null && match.index !== undefined) {
      // Split on the AND
      const andIdx = text.toUpperCase().indexOf(" AND ", match.index);
      if (andIdx >= 0) {
        const before = text.slice(0, andIdx).trim();
        const after = text.slice(andIdx + 5).trim();
        if (before.length > 0 && after.length > 0) {
          return [
            { text: before, sourceQuestions: [questionId] },
            { text: after, sourceQuestions: [questionId] },
          ];
        }
      }
    }
  }

  return [];
};

// =============================================================================
// Proposal Item Construction
// =============================================================================

/**
 * Convert a raw detected area into a full SplitProposalItem.
 */
const toProposalItem = (area: RawArea): SplitProposalItem => {
  const name = slugify(area.text);
  const estimatedTasks = estimateTasks(area.text);

  return {
    name,
    description: area.text,
    estimatedTasks,
    relevantAnswers: [...area.sourceQuestions],
  };
};

/**
 * Generate a slug from area description text.
 * Takes the first few meaningful words and joins with hyphens.
 */
const slugify = (text: string): string => {
  const STOP_WORDS = new Set([
    "the",
    "a",
    "an",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "have",
    "has",
    "had",
    "do",
    "does",
    "did",
    "will",
    "would",
    "shall",
    "should",
    "may",
    "might",
    "must",
    "can",
    "could",
    "to",
    "of",
    "in",
    "for",
    "on",
    "with",
    "at",
    "by",
    "from",
    "that",
    "this",
    "it",
    "its",
    "and",
    "or",
    "but",
    "not",
    "no",
    "so",
    "if",
    "then",
    "too",
    "very",
    "just",
  ]);

  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 0 && !STOP_WORDS.has(w));

  const slug = words.slice(0, 4).join("-");

  // Ensure valid slug format (a-z, 0-9, hyphens, max 50 chars)
  const cleaned = slug
    .replace(/--+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);

  return cleaned.length > 0 ? cleaned : "area";
};

/**
 * Rough task count estimation based on text length and action verbs.
 */
const estimateTasks = (text: string): number => {
  const ACTION_VERBS =
    /\b(fix|add|restore|update|remove|refactor|rewrite|implement|create|migrate|convert|replace|extract|move|rename|split|merge|test|verify|validate|configure|setup|install|deploy)\b/gi;
  const verbMatches = text.match(ACTION_VERBS);
  const verbCount = verbMatches?.length ?? 0;

  // Base: 2 tasks minimum, +1 per extra verb beyond the first
  return Math.max(2, Math.min(verbCount + 1, 5));
};

// =============================================================================
// Coupling Detection
// =============================================================================

/**
 * Check if detected areas are tightly coupled (sequential dependencies).
 *
 * Returns true if:
 * - One area's description references another's output
 * - Areas share the same file paths
 * - One area is explicitly labeled as a prerequisite
 */
const areTightlyCoupled = (
  areas: readonly SplitProposalItem[],
): boolean => {
  for (let i = 0; i < areas.length; i++) {
    for (let j = i + 1; j < areas.length; j++) {
      const a = areas[i]!;
      const b = areas[j]!;

      // Check if either area references the other via coupling patterns
      const combined = `${a.description} ${b.description}`;
      for (const pattern of COUPLING_PATTERNS) {
        if (pattern.test(combined)) return true;
      }

      // Check if areas share specific nouns (potential file/type references)
      const aNounsSet = extractKeyNouns(a.description);
      const bNounsSet = extractKeyNouns(b.description);
      const shared = [...aNounsSet].filter((n) => bNounsSet.has(n));

      // If they share specific technical nouns (PascalCase, file paths, etc.), coupled
      if (shared.some((n) => /^[A-Z]/.test(n) || n.includes("."))) {
        return true;
      }
    }
  }

  return false;
};

/**
 * Extract key nouns from text — PascalCase identifiers, file-like paths,
 * and technical terms.
 */
const extractKeyNouns = (text: string): Set<string> => {
  const nouns = new Set<string>();

  // PascalCase identifiers (e.g., UserType, ChatHandler)
  const pascalMatches = text.match(/\b[A-Z][a-zA-Z0-9]+\b/g);
  if (pascalMatches !== null) {
    for (const m of pascalMatches) nouns.add(m);
  }

  // File-like paths (e.g., handler.ts, src/utils)
  const fileMatches = text.match(/\b[\w-]+\.\w{1,4}\b/g);
  if (fileMatches !== null) {
    for (const m of fileMatches) nouns.add(m);
  }

  return nouns;
};
