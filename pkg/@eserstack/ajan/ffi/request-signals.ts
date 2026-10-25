// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * AbortSignals of in-flight bridge requests, by request id.
 *
 * A caller that passes `requestId` in a request JSON registers its signal
 * here first; the WASM reactor's host fetch (wasm/host-fetch.ts) looks it up
 * and aborts the fetch when it fires. The native library does not read it.
 *
 * @module
 */

const signals = new Map<string, AbortSignal>();

let counter = 0;

/**
 * Registers `signal` under a new request id.
 *
 * @param signal - The caller's AbortSignal
 * @returns The id to send as `requestId`, and a function that unregisters it
 */
export const registerRequestSignal = (
  signal: AbortSignal,
): { readonly requestId: string; readonly release: () => void } => {
  counter += 1;
  const requestId = `req-${counter}`;
  signals.set(requestId, signal);

  return {
    requestId,
    release: () => {
      signals.delete(requestId);
    },
  };
};

/**
 * The signal registered under `requestId`, if any.
 *
 * @param requestId - The id a request JSON carried
 * @returns The signal, or undefined
 */
export const requestSignal = (
  requestId: string | undefined,
): AbortSignal | undefined =>
  requestId === undefined ? undefined : signals.get(requestId);
