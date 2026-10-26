// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The rules for asking discovery questions and for pre-filling and submitting
 * their answers.
 *
 * The behavioral rules of `noskills next` and every generated agent
 * instruction file take these rules from here. When each kept its own wording,
 * one said "do not pre-fill, do not batch" while another said "pre-fill and
 * submit all answers in one call", and an agent followed whichever it read
 * last. The Go mirror (pkg/ajan/noskillsfx/compiler.go) repeats the same text.
 *
 * @module
 */

/**
 * Returns the rule for asking discovery questions: the unanswered base
 * questions together, follow-ups one at a time. `noskills next` hands an
 * agent every unanswered base question in one output and takes their answers
 * as one JSON object; it hands out pending follow-ups one per output.
 */
export const discoveryQuestionRule = (): string =>
  "Ask the user the unanswered base discovery questions together, in one " +
  "exchange, and submit the confirmed answers as one JSON object keyed by " +
  "question id. Ask each follow-up question on its own and wait for its " +
  "answer before you ask the next.";

/**
 * Returns the discovery answer rule. `nextCommand` is the submit command in
 * the form the reader can run, for example
 * `npx eser@latest noskills spec my-spec next --answer`.
 */
export const discoveryAnswerRule = (nextCommand: string): string =>
  "Discovery answers come from the user. You may pre-fill a suggested answer " +
  "from what the user already wrote (the spec description, a plan, earlier " +
  "messages): mark it [STATED] when the user said it or [INFERRED] when it " +
  "is your reading, and have the user confirm or correct it. Submit only " +
  "confirmed answers, in the one call `transition.onComplete` shows " +
  `(\`${nextCommand}\`). Never submit an answer the user has not confirmed.`;
