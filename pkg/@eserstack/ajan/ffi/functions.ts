// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The native side of `@eserstack/functions/native`: it calls the functions of
 * `pkg/ajan/functionsfx` through the bridge's `functionCall` and
 * `functionList` names (ADR 0011).
 *
 * `@eserstack/functions` owns the port and does not import this package.
 * {@link FunctionCaller} has the shape of that port, so a caller passes
 * `functionCaller()` where the port is expected and the two packages stay
 * apart. This module turns the bridge's answer into one outcome: the output, or
 * an error with the kind Go gave it, so `fromNative` can build a `Result`
 * without knowing the wire format.
 *
 * @module
 */

import type * as bindings from "./bindings.ts";
import * as client from "./client.ts";
import type * as types from "./types.ts";

/** One call of a native function. */
export type FunctionCall = {
  /** The registered name of the function. */
  readonly name: string;
  /** The JSON-compatible input; absent reads as null. */
  readonly input?: unknown;
  /** Stops the Go function through its context when it aborts. */
  readonly signal?: AbortSignal;
};

/**
 * What a call comes to: the output, or an error. `kind` is the kind of the Go
 * error: `ValidationError`, `AbortError`, `AdaptError`, one of the bridge's
 * `UnknownFunction`, `NotAStream`, `StreamOnly` and `TooManyStreams`, or absent
 * for an error the function raised itself.
 */
export type FunctionOutcome =
  | { readonly ok: true; readonly output: unknown }
  | {
      readonly ok: false;
      readonly error: string;
      readonly kind?: string;
    };

/** Calls a native function. */
export type FunctionCaller = (call: FunctionCall) => Promise<FunctionOutcome>;

/**
 * Opens a native function that streams and gives its items, each as an outcome:
 * a value as `ok: true`, and the failure of the function, if there is one, as
 * the last item with `ok: false`.
 */
export type FunctionStreamCaller = (
  call: FunctionCall,
) => AsyncGenerator<FunctionOutcome>;

const ABORT_KIND = "AbortError";

const reasonMessage = (reason: unknown): string =>
  reason instanceof Error ? reason.message : String(reason);

/**
 * Calls one function on a loaded library.
 *
 * A signal that aborts ends the Go function and answers an `AbortError`
 * outcome. A name the library does not serve, or a refused request, throws the
 * dispatcher's error: no function ran, so there is no outcome to report.
 */
export const callFunction = async (
  lib: types.FFILibrary,
  call: FunctionCall,
): Promise<FunctionOutcome> => {
  const request: bindings.FunctionCallRequest = {
    name: call.name,
    input: call.input,
  };

  let answer: bindings.FunctionCallAnswer;

  try {
    answer = await lib.call(
      "functionCall",
      request,
      call.signal === undefined ? undefined : { signal: call.signal },
    );
  } catch (cause: unknown) {
    if (call.signal?.aborted === true) {
      return {
        ok: false,
        error: reasonMessage(call.signal.reason),
        kind: ABORT_KIND,
      };
    }

    throw cause;
  }

  if (answer.error !== undefined) {
    return answer.errorKind === undefined
      ? { ok: false, error: answer.error }
      : { ok: false, error: answer.error, kind: answer.errorKind };
  }

  return { ok: true, output: answer.output };
};

const failureOf = (
  answer: bindings.FunctionCallAnswer & { readonly error: string },
): FunctionOutcome =>
  answer.errorKind === undefined
    ? { ok: false, error: answer.error }
    : { ok: false, error: answer.error, kind: answer.errorKind };

/**
 * Opens a function that streams on a loaded library and gives its items as they
 * arrive.
 *
 * A failure that stops the function is the last item, with `ok: false`; an input
 * the function refused, or a name that does not stream, is the only item. A signal
 * that aborts ends the Go function, and the last item is an `AbortError`. A loop
 * that stops early closes the stream, which stops the function.
 */
export const streamFunction = async function* (
  lib: types.FFILibrary,
  call: FunctionCall,
): AsyncGenerator<FunctionOutcome> {
  const options =
    call.signal === undefined ? undefined : { signal: call.signal };
  const request: bindings.FunctionCallRequest = {
    name: call.name,
    input: call.input,
  };

  let stream: Awaited<ReturnType<typeof openStream>> | undefined;

  try {
    stream = await openStream(lib, request, options);

    if (stream.opened.error !== undefined) {
      yield failureOf({ ...stream.opened, error: stream.opened.error });

      return;
    }

    for (;;) {
      // Each read waits for the next item of the function.
      // oxlint-disable-next-line no-await-in-loop
      const chunk = await stream.read(options);

      if (chunk === null) {
        return;
      }

      if (chunk.error !== undefined) {
        yield failureOf({ ...chunk, error: chunk.error });

        return;
      }

      yield { ok: true, output: chunk.output };
    }
  } catch (cause: unknown) {
    if (call.signal?.aborted === true) {
      yield {
        ok: false,
        error: reasonMessage(call.signal.reason),
        kind: ABORT_KIND,
      };

      return;
    }

    throw cause;
  } finally {
    try {
      stream?.close();
    } catch {
      // An abort closed the stream already.
    }
  }
};

const openStream = (
  lib: types.FFILibrary,
  request: bindings.FunctionCallRequest,
  options: bindings.CallOptions | undefined,
) => lib.stream("functionStream", request, options);

/**
 * Lists the functions the library serves, sorted by name.
 *
 * @throws {Error} When the library answers an error.
 */
export const listFunctions = (
  lib: types.FFILibrary,
): readonly bindings.FunctionDescriptor[] => {
  const answer = lib.call("functionList");

  if (answer.error !== undefined) {
    throw new Error(`functionList: ${answer.error}`);
  }

  return answer.functions ?? [];
};

/**
 * A {@link FunctionStreamCaller} on the shared bridge: the library loads when
 * the first item is asked for, and a call that cannot load it throws the load
 * failure.
 */
export const functionStreamCaller = (): FunctionStreamCaller =>
  async function* (call): AsyncGenerator<FunctionOutcome> {
    yield* streamFunction(await client.requireLib(), call);
  };

/**
 * A {@link FunctionCaller} on the shared bridge: the library loads on the
 * first call, and a call that cannot load it throws the load failure.
 */
export const functionCaller =
  (): FunctionCaller =>
  async (call): Promise<FunctionOutcome> =>
    callFunction(await client.requireLib(), call);
