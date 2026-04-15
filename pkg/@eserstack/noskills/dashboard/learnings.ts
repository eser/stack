// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Cross-session learnings — persistent JSONL log of mistakes, conventions,
 * and successes discovered during spec execution.
 *
 * @module
 */

import { runtime } from "@eserstack/standards/cross-runtime";

// =============================================================================
// Types
// =============================================================================

export type LearningType = "mistake" | "convention" | "success" | "dependency";

export type Learning = {
  readonly ts: string;
  readonly spec: string;
  readonly type: LearningType;
  readonly text: string;
  readonly severity: "high" | "medium" | "low";
};

// =============================================================================
// Paths
// =============================================================================

const LEARNINGS_FILE = ".eser/learnings.jsonl";

// =============================================================================
// Write
// =============================================================================

/** Append a learning to the JSONL log. */
export const addLearning = async (
  root: string,
  learning: Learning,
): Promise<void> => {
  const file = `${root}/${LEARNINGS_FILE}`;
  const line = JSON.stringify(learning) + "\n";

  let existing = "";
  try {
    existing = await runtime.fs.readTextFile(file);
  } catch {
    // File doesn't exist yet
  }
  await runtime.fs.writeTextFile(file, existing + line);
};

// =============================================================================
// Read
// =============================================================================

/** Read all learnings. */
export const readLearnings = async (
  root: string,
): Promise<readonly Learning[]> => {
  const file = `${root}/${LEARNINGS_FILE}`;

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
        return JSON.parse(line) as Learning;
      } catch {
        return null;
      }
    })
    .filter((l): l is Learning => l !== null);
};

/** Remove a learning by index (0-based). */
export const removeLearning = async (
  root: string,
  index: number,
): Promise<boolean> => {
  const all = await readLearnings(root);
  if (index < 0 || index >= all.length) return false;

  const remaining = all.filter((_, i) => i !== index);
  const file = `${root}/${LEARNINGS_FILE}`;
  const content = remaining.map((l) => JSON.stringify(l)).join("\n") +
    (remaining.length > 0 ? "\n" : "");
  await runtime.fs.writeTextFile(file, content);
  return true;
};

// =============================================================================
// Relevance filtering
// =============================================================================

/** Get learnings relevant to a spec description. Max 5. */
export const getRelevantLearnings = async (
  root: string,
  specDescription: string,
): Promise<readonly Learning[]> => {
  const all = await readLearnings(root);
  if (all.length === 0) return [];

  const descWords = new Set(
    specDescription.toLowerCase().split(/\s+/).filter((w) => w.length > 3),
  );

  // Score each learning by keyword overlap with spec description
  const scored = all.map((learning) => {
    const textWords = learning.text.toLowerCase().split(/\s+/);
    let score = 0;

    // High-severity learnings always get a boost
    if (learning.severity === "high") score += 3;
    if (learning.severity === "medium") score += 1;

    // Conventions always relevant
    if (learning.type === "convention") score += 2;

    // Keyword overlap
    for (const word of textWords) {
      if (word.length > 3 && descWords.has(word)) {
        score += 2;
      }
    }

    // General learnings (short text, broadly applicable) get a small boost
    if (learning.text.length < 80) score += 1;

    return { learning, score };
  });

  // Sort by score descending, take top 5
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 5).map((s) => s.learning);
};

/** Format learnings for compiler output. */
export const formatLearnings = (
  learnings: readonly Learning[],
): readonly string[] => {
  return learnings.map((l) => {
    const icon = l.type === "mistake"
      ? "\u26A0"
      : l.type === "success"
      ? "\u2713"
      : l.type === "convention"
      ? "\u2713"
      : "\u26A0";
    const label = l.type === "mistake"
      ? "Past mistake"
      : l.type === "success"
      ? "Success"
      : l.type === "convention"
      ? "Convention"
      : "Dependency";
    return `${icon} ${label}: ${l.text} (from spec: ${l.spec})`;
  });
};
