// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Word-overlap similarity for comparing the expected discovery question
 * text to what the agent actually asked the user. Used by the
 * post-ask-user-question hook to detect modified questions.
 *
 * @module
 */

/** Normalize a question to a set of lowercased word tokens. */
const tokenize = (text: string): Set<string> => {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2), // drop very short words
  );
};

/**
 * Jaccard similarity: |A ∩ B| / |A ∪ B|. Returns 0..1. Empty inputs → 0.
 */
export const compareQuestions = (
  expected: string,
  asked: string,
): number => {
  const a = tokenize(expected);
  const b = tokenize(asked);
  if (a.size === 0 || b.size === 0) return 0;

  let intersection = 0;
  for (const word of a) {
    if (b.has(word)) intersection++;
  }
  const union = a.size + b.size - intersection;
  if (union === 0) return 0;
  return intersection / union;
};

/** Above this, we treat the asked question as "exact" to the expected. */
export const SIMILARITY_EXACT_THRESHOLD = 0.7;
