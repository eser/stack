// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Time limits and cancellation shared by the REST client, the certificate
 * fetch and attach. Internal: not exported from the package.
 *
 * @module
 */

import * as errors from "./errors.ts";

/**
 * Settles like `pending`, or rejects with the signal's reason as soon as the
 * signal aborts, so work that ignores the signal still cannot outlive it. A
 * value that arrives after the abort goes to `discardLate`, which releases it.
 */
export function raceSignal<T>(
  pending: Promise<T>,
  signal: AbortSignal,
  discardLate: (value: T) => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    if (signal.aborted) {
      onAbort();
    } else {
      signal.addEventListener("abort", onAbort, { once: true });
    }

    pending.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        if (signal.aborted) {
          discardLate(value);
          return;
        }
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        // After an abort the promise is already rejected, and this is a no-op.
        reject(error);
      },
    );
  });
}

/**
 * Runs `work` with one signal that aborts when `callerSignal` does or when
 * `timeoutMs` passes. A failure caused by the time limit becomes a
 * `NoskillsTimeoutError` naming `operation`; the caller's abort and every
 * other failure propagate unchanged.
 */
export async function withDeadline<T>(
  operation: string,
  timeoutMs: number,
  callerSignal: AbortSignal | undefined,
  work: (signal: AbortSignal) => Promise<T>,
  discardLate: (value: T) => void = () => {},
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError(
      `${operation}: timeoutMs ${timeoutMs} is not a positive number of milliseconds`,
    );
  }

  const deadline = AbortSignal.timeout(timeoutMs);
  const signal = callerSignal === undefined
    ? deadline
    : AbortSignal.any([callerSignal, deadline]);

  try {
    return await raceSignal(work(signal), signal, discardLate);
  } catch (error) {
    if (deadline.aborted && callerSignal?.aborted !== true) {
      throw new errors.NoskillsTimeoutError(operation, timeoutMs, {
        cause: error,
      });
    }
    throw error;
  }
}
