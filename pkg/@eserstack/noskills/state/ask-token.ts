// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The ask token (`persistence.paths.askTokenFile`): the AskUserQuestion hook
 * writes it, and `noskills next` reads it when an answer arrives. It lists
 * the discovery steps the user was asked through AskUserQuestion, so an
 * answer to one of them is marked STATED instead of INFERRED. The base
 * questions are asked together, up to 4 per AskUserQuestion call, so one
 * token can hold several steps.
 *
 * @module
 */

/** How long a token stays valid after the question was asked. */
export const ASK_TOKEN_TTL_MS: number = 30 * 60 * 1000;

/** One question the user was asked, tied to the step it answers. */
export type AskTokenStep = {
  readonly stepId: string;
  /** "exact" when asked as noskills wrote it, "modified" when rephrased. */
  readonly match: "exact" | "modified";
  readonly originalQuestion?: string;
  readonly askedQuestion?: string;
};

/** The token file's content. */
export type AskToken = {
  readonly token: string;
  readonly spec: string | null;
  readonly steps: readonly AskTokenStep[];
  readonly createdAt: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const stepOf = (value: unknown): AskTokenStep | null => {
  if (!isRecord(value) || typeof value["stepId"] !== "string") return null;

  return {
    stepId: value["stepId"],
    match: value["match"] === "modified" ? "modified" : "exact",
    ...(typeof value["originalQuestion"] === "string"
      ? { originalQuestion: value["originalQuestion"] }
      : {}),
    ...(typeof value["askedQuestion"] === "string"
      ? { askedQuestion: value["askedQuestion"] }
      : {}),
  };
};

/**
 * The steps of the token text `raw` when it belongs to `spec` and is younger
 * than ASK_TOKEN_TTL_MS at `nowMs`; null for any other text. A token written
 * before tokens listed their steps holds one, in top-level `stepId` and
 * `match` fields.
 */
export const validStepsOf = (
  raw: string,
  spec: string | null,
  nowMs: number,
): readonly AskTokenStep[] | null => {
  let token: unknown;
  try {
    token = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(token)) return null;

  const tokenSpec = typeof token["spec"] === "string" ? token["spec"] : null;
  if (tokenSpec !== spec) return null;

  const createdAt =
    typeof token["createdAt"] === "string"
      ? new Date(token["createdAt"]).getTime()
      : Number.NaN;
  const ageMs = nowMs - createdAt;
  if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > ASK_TOKEN_TTL_MS) {
    return null;
  }

  const listed = Array.isArray(token["steps"]) ? token["steps"] : [token];

  return listed
    .map(stepOf)
    .filter((step): step is AskTokenStep => step !== null);
};
