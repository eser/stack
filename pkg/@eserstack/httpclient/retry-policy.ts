// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * HttpClient's view of the retry policy, which lives in Go
 * (`resilience.ResolveRetryPlan` and `RetryPlan.Next` in
 * `pkg/ajan/httpclient/resilience`), reached through the bridge's
 * `httpRetryResolve` and `httpRetryNext`.
 *
 * The attempt loop stays in client.ts, because it runs the caller's request
 * interceptors and `fetchFn` before every attempt; this module only asks Go
 * how many attempts a request gets and what to do after a failed one, for the
 * fetch and the native transport alike. Internal: not exported from the
 * package.
 *
 * @module
 */

import type * as ffiTypes from "@eserstack/ajan/ffi";
import type * as bindings from "@eserstack/ajan/ffi/bindings";
import type * as types from "./types.ts";
import * as errors from "./errors.ts";
import * as ffiClient from "./ffi-client.ts";

/** The retry plan of one request, as Go resolved it. */
export type RetryPlan = {
  /** Attempts run while the attempt number is below this. */
  readonly maxAttempts: number;
  /** The plan as Go answered it, sent back with every decision. */
  readonly wire: bindings.HttpRetryPlan;
};

/** What to do after a failed attempt. */
export type RetryDecision = {
  readonly retry: boolean;
  readonly delayMs: number;
};

/** JSON has no NaN or infinities; the bridge reads them by name. */
const toWireNumber = (value: number): bindings.WireNumber =>
  Number.isFinite(value)
    ? value
    : (String(value) as "NaN" | "Infinity" | "-Infinity");

const fromWireNumber = (value: bindings.WireNumber | undefined): number =>
  typeof value === "number" ? value : Number(value);

/**
 * Writes a number field for the wire. A value of another type is sent as it
 * is, so Go refuses it by name instead of this module guessing.
 */
const wireField = (value: unknown): unknown =>
  typeof value === "number" ? toWireNumber(value) : value;

const toWireSetting = (
  setting: types.RetryConfig | false | undefined,
): bindings.HttpRetryConfigWire | false | undefined => {
  if (setting === undefined || setting === false) {
    return setting;
  }

  if (typeof setting !== "object" || setting === null) {
    // Outside the type; Go answers what it expected.
    return setting as unknown as bindings.HttpRetryConfigWire;
  }

  const statuses = setting.retryableStatuses;

  return {
    maxAttempts: wireField(setting.maxAttempts),
    initialDelay: wireField(setting.initialDelay),
    maxDelay: wireField(setting.maxDelay),
    factor: wireField(setting.factor),
    jitter: setting.jitter,
    retryableStatuses: Array.isArray(statuses)
      ? statuses.map((status: unknown) => wireField(status))
      : statuses,
    respectRetryAfter: setting.respectRetryAfter,
  } as bindings.HttpRetryConfigWire;
};

const bridge = (): ffiTypes.FFILibrary => {
  try {
    return ffiClient.requireLibSync();
  } catch (error) {
    const cause = error instanceof Error ? error : new Error(String(error));
    throw new errors.HttpClientError(
      `HttpClient runs its retry policy in Go through @eserstack/ajan: ${cause.message}`,
      { cause },
    );
  }
};

const refused = (answer: string): errors.HttpClientError =>
  new errors.HttpClientError(
    `HttpClient: the retry policy refused the request: ${answer}; check the retry settings against RetryConfig`,
  );

/**
 * Resolves the plan of one request from the client's and the request's retry
 * settings. A stream body, which the first attempt consumes, gets one
 * attempt.
 *
 * @throws {errors.HttpClientError} When the bridge is unavailable (its load
 *   error as `cause`) or Go refuses a setting outside RetryConfig.
 */
export const resolveRetryPlan = (
  clientRetry: types.RetryConfig | false | undefined,
  requestRetry: types.RetryConfig | false | undefined,
  streamBody: boolean,
): RetryPlan => {
  const answer = bridge().call("httpRetryResolve", {
    client: toWireSetting(clientRetry),
    request: toWireSetting(requestRetry),
    streamBody,
  });

  if (typeof answer.error === "string" && answer.error !== "") {
    throw refused(answer.error);
  }

  if (answer.plan === undefined) {
    throw refused("the answer has no plan");
  }

  return {
    maxAttempts: fromWireNumber(answer.plan.maxAttempts),
    wire: answer.plan,
  };
};

/**
 * Decides after the failed attempt number `attempt` (0 for the first).
 * `status` is the response status, 0 for a network failure; `retryAfterMs` is
 * the response's Retry-After, null when it has none.
 *
 * @throws {errors.HttpClientError} When the bridge is unavailable or refuses
 *   the request.
 */
export const nextRetry = (
  plan: RetryPlan,
  attempt: number,
  status: number,
  retryAfterMs: number | null,
): RetryDecision => {
  const answer = bridge().call("httpRetryNext", {
    plan: plan.wire,
    attempt,
    status,
    retryAfterMs: retryAfterMs === null ? null : toWireNumber(retryAfterMs),
    random: Math.random(),
  });

  if (typeof answer.error === "string" && answer.error !== "") {
    throw refused(answer.error);
  }

  return {
    retry: answer.retry === true,
    delayMs: fromWireNumber(answer.delayMs ?? 0),
  };
};
