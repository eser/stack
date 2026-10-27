// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The typed library both backends hand out: `call` and `stream` over the
 * binding table, on top of one backend's {@link types.Transport}.
 *
 * - A request is sent as is when it is a string (the handle-only names) and
 *   as JSON otherwise; a name that takes no request sends "".
 * - An envelope with a `result` answers the parsed result, error answers
 *   included; one without throws the {@link errors.AjanCallError} for its code.
 * - On the WASM backend, a name the table marks `wasm: "no"` throws
 *   {@link errors.UnsupportedInWasmError} without a round trip.
 * - With an offload (the native backend), a blocking name runs in a worker:
 *   a call in the pool, a stream's reads (and the open of an async stream) in
 *   the stream's own worker. Every other name runs on the calling thread.
 * - An AbortSignal in the options of a blocking name runs the name's cancel
 *   entry on the calling thread and rejects with the signal's reason.
 * - After `close`, every operation throws instead of reaching into a library
 *   that is no longer there. Closing runs the cancel entry of every blocking
 *   name still in flight, then ends the workers. A process that exits with
 *   the library open runs those cancel entries too.
 *
 * @module
 */

import * as bindings from "./bindings.ts";
import * as errors from "./errors.ts";
import type * as offload from "./offload.ts";
import type * as types from "./types.ts";

/** The dispatcher ABI this loader speaks, from dispatch.go. */
export const ABI_VERSION = 3;

/**
 * Checks the handshake a backend answered at load and returns it.
 *
 * @param raw - The handshake JSON
 * @param path - The library or module path, for the error message
 * @param fallbackAbi - The ABI to report when the answer is not a handshake
 *   (a WASM module from before ABI 3 put it on its envelope)
 * @throws {errors.AbiMismatchError} When the ABI version differs
 */
export const checkHandshake = (
  raw: string,
  path: string,
  fallbackAbi?: number,
): types.Handshake => {
  let parsed: Partial<types.Handshake> | null = null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value === "object" && value !== null) {
      parsed = value as Partial<types.Handshake>;
    }
  } catch {
    parsed = null;
  }

  const abi =
    typeof parsed?.abi === "number" ? parsed.abi : (fallbackAbi ?? null);
  if (abi !== ABI_VERSION) {
    throw new errors.AbiMismatchError(path, ABI_VERSION, abi);
  }

  return {
    version: parsed?.version ?? "",
    abi,
    profile: parsed?.profile ?? "unknown",
    names: parsed?.names ?? [],
    streams: parsed?.streams ?? [],
  };
};

/** The request string for the wire. */
const encodeRequest = (request: unknown): string => {
  if (request === undefined) {
    return "";
  }

  return typeof request === "string" ? request : JSON.stringify(request);
};

/** The error for an envelope that ran no bridge function. */
const envelopeError = (
  target: string,
  envelope: types.Envelope,
  profile: string,
): errors.AjanCallError => {
  const message = `eser-ajan: ${target}: ${envelope.error ?? "no answer"}`;

  switch (envelope.code) {
    case "UNKNOWN_FUNCTION":
      return new errors.UnknownFunctionError(target, message);
    case "UNSUPPORTED_IN_WASM":
      return new errors.UnsupportedInWasmError(target, profile);
    default:
      return new errors.AjanCallError(
        target,
        envelope.code ?? "NO_RESULT",
        message,
      );
  }
};

/** Options for {@link createLibrary}. */
export interface LibraryOptions {
  readonly backend: types.Backend;
  readonly handshake: types.Handshake;
  readonly transport: types.Transport;
  /** The workers for the blocking names; without it they run inline. */
  readonly offload?: offload.Offload;
}

/** What {@link types.FFILibrary.workers} reports without workers. */
const NO_WORKERS: offload.WorkerStats = {
  poolSize: 0,
  pool: 0,
  busy: 0,
  queued: 0,
  peakPool: 0,
  readers: 0,
  posted: 0,
};

/** A request with the `requestId` its cancel entry needs. */
const withRequestId = (
  request: unknown,
): { readonly request: unknown; readonly requestId: string } => {
  if (typeof request !== "object" || request === null) {
    const requestId = crypto.randomUUID();

    return { request: { requestId }, requestId };
  }

  const fields = request as Readonly<Record<string, unknown>>;
  if (typeof fields["requestId"] === "string") {
    return { request, requestId: fields["requestId"] };
  }

  // The AI names that run on a model handle carry the id in their options.
  const nested = fields["options"];
  if (typeof nested === "object" && nested !== null) {
    const options = nested as Readonly<Record<string, unknown>>;
    if (typeof options["requestId"] === "string") {
      return { request, requestId: options["requestId"] };
    }

    const requestId = crypto.randomUUID();

    return {
      request: { ...fields, options: { ...options, requestId } },
      requestId,
    };
  }

  const requestId = crypto.randomUUID();

  return { request: { ...fields, requestId }, requestId };
};

/**
 * Runs a cancel entry. A cancel that cannot be delivered, because the
 * library or the handle is already gone, leaves nothing running to stop, so
 * its failure is not the caller's.
 */
const runCancel = (cancel: () => void): void => {
  try {
    cancel();
  } catch {
    // Nothing is left in flight to end.
  }
};

/**
 * The in-flight cancel entries of every library with workers, run when the
 * process exits. Node ends a worker only after its native call returns, so
 * `process.exit()` with a reader blocked in Go (a PTY whose child never
 * exits) would never finish; cancelling first ends those calls at once. The
 * libraries stay open, so exit listeners that log still can.
 */
const exitCancels = new Set<() => void>();
let exitHookInstalled = false;

const installExitHook = (): void => {
  if (exitHookInstalled) {
    return;
  }

  exitHookInstalled = true;
  // Read like ffi/resolve.ts reads it: the WASM loader shares this module on
  // hosts without Node's built-ins, and the cross-runtime layer has no exit
  // event to listen for.
  globalThis.process?.once?.("exit", () => {
    for (const cancelInflight of exitCancels) {
      cancelInflight();
    }
  });
};

/**
 * Builds the typed library over one backend's transport.
 *
 * @param options - The backend, its handshake, its transport and its workers
 * @returns The library
 */
export const createLibrary = (options: LibraryOptions): types.FFILibrary => {
  const { backend, handshake, transport, offload } = options;
  let closed = false;
  // The cancel entries of the blocking operations in flight, run by close.
  const inflight = new Set<() => void>();

  const assertOpen = (target: string): void => {
    if (closed) {
      throw new Error(
        `${target}: the ${backend} eser-ajan library is already closed. ` +
          "Open a new handle before calling it again.",
      );
    }
  };

  const assertServed = (name: string): bindings.BindingSpec | undefined => {
    const spec = bindings.bindingOf(name);
    if (backend === "wasm" && spec?.wasm === "no") {
      throw new errors.UnsupportedInWasmError(name, handshake.profile);
    }

    return spec;
  };

  const unwrap = (target: string, envelope: types.Envelope): unknown => {
    if (envelope.result === undefined) {
      throw envelopeError(target, envelope, handshake.profile);
    }

    return envelope.result === "" ? null : JSON.parse(envelope.result);
  };

  /**
   * Settles with `pending`, or rejects with the signal's reason once it
   * fires, after running `cancel`. While `pending` runs, close can run
   * `cancel` too.
   */
  const guarded = <T>(
    pending: Promise<T>,
    signal: AbortSignal | undefined,
    cancel: (() => void) | null,
  ): Promise<T> => {
    if (cancel !== null) {
      inflight.add(cancel);
      const done = (): void => {
        inflight.delete(cancel);
      };
      pending.then(done, done);
    }

    if (signal === undefined) {
      return pending;
    }

    return new Promise<T>((resolve, reject) => {
      const onAbort = (): void => {
        if (cancel !== null) {
          runCancel(cancel);
        }
        reject(signal.reason);
      };

      signal.addEventListener("abort", onAbort, { once: true });
      pending.then(
        (value) => {
          signal.removeEventListener("abort", onAbort);
          resolve(value);
        },
        (error: unknown) => {
          signal.removeEventListener("abort", onAbort);
          reject(error);
        },
      );
    });
  };

  /** The cancel entry of a blocking operation, or null when it has none. */
  const cancelOf = (
    spec: bindings.BindingSpec,
    requestId: string | null,
    close: (() => void) | null,
    handle: string,
  ): (() => void) | null => {
    switch (spec.cancel) {
      case "aiCancelRequest":
        return requestId === null
          ? null
          : () => {
              transport.call("aiCancelRequest", JSON.stringify({ requestId }));
            };
      case "close":
        return close;
      case "shellPtyKill":
        return handle === ""
          ? null
          : () => {
              transport.call(
                "shellPtyKill",
                JSON.stringify({ handle, signal: "SIGKILL" }),
              );
            };
      default:
        return null;
    }
  };

  /** Encodes a request, adding the `requestId` an AI cancel needs. */
  const prepare = (
    spec: bindings.BindingSpec | undefined,
    request: unknown,
  ): { readonly wire: string; readonly requestId: string | null } => {
    if (spec?.cancel !== "aiCancelRequest") {
      return { wire: encodeRequest(request), requestId: null };
    }

    const prepared = withRequestId(request);

    return {
      wire: encodeRequest(prepared.request),
      requestId: prepared.requestId,
    };
  };

  const call = (
    name: string,
    request?: unknown,
    callOptions?: bindings.CallOptions,
  ): unknown => {
    assertOpen(name);
    const spec = assertServed(name);
    const signal = callOptions?.signal;

    if (spec?.blocking === true || spec?.async === true) {
      if (signal?.aborted === true) {
        return Promise.reject(signal.reason);
      }

      const { wire, requestId } = prepare(spec, request);
      const pending =
        spec.blocking && offload !== undefined
          ? offload.call(name, wire)
          : (transport.callAsync?.(name, wire) ??
            Promise.resolve().then(() => transport.call(name, wire)));

      return guarded(pending, signal, cancelOf(spec, requestId, null, "")).then(
        (envelope) => unwrap(name, envelope),
      );
    }

    signal?.throwIfAborted();

    return unwrap(name, transport.call(name, encodeRequest(request)));
  };

  const openStream = (
    name: string,
    spec: bindings.BindingSpec | undefined,
    opened: unknown,
    lane: offload.ReaderLane | null,
    requestId: string | null,
  ): types.AjanStream<bindings.StreamName> => {
    const answer = opened as { readonly handle?: unknown } | null;
    const handle = typeof answer?.handle === "string" ? answer.handle : "";
    const blocking = spec?.blocking === true;
    const async = spec?.async === true;

    // The lane serves reads until the stream closes or reads to its end; a
    // stream whose open answered no handle has nothing to read.
    let laneOpen = lane !== null && handle !== "";
    const endLane = (): void => {
      laneOpen = false;
      lane?.end();
    };
    if (!laneOpen) {
      endLane();
    }

    let isClosed = false;
    let closedAnswer: unknown = null;
    const closeHandle = (): unknown => {
      if (!isClosed) {
        isClosed = true;
        try {
          closedAnswer = unwrap(name, transport.streamClose(handle));
        } finally {
          endLane();
        }
      }

      return closedAnswer;
    };

    const readSync = (): unknown => {
      assertOpen(name);
      return unwrap(name, transport.streamRead(handle));
    };

    const readAsync = (readOptions?: bindings.CallOptions): unknown => {
      assertOpen(name);
      const signal = readOptions?.signal;
      if (signal?.aborted === true) {
        return Promise.reject(signal.reason);
      }

      const pending =
        laneOpen && lane !== null
          ? lane.read(name, handle)
          : async
            ? (transport.streamReadAsync?.(handle) ??
              Promise.resolve().then(() => transport.streamRead(handle)))
            : Promise.resolve().then(() => transport.streamRead(handle));

      const cancel =
        spec === undefined
          ? null
          : cancelOf(spec, requestId, closeHandle, handle);

      return guarded(pending, signal, cancel).then((envelope) => {
        const chunk = unwrap(name, envelope);
        if (chunk === null) {
          endLane();
        }

        return chunk;
      });
    };

    return {
      name: name as bindings.StreamName,
      handle,
      opened: opened as never,
      read: (async || blocking
        ? readAsync
        : (readOptions?: bindings.CallOptions) => {
            readOptions?.signal?.throwIfAborted();
            return readSync();
          }) as never,
      close: (() => {
        assertOpen(name);
        return closeHandle();
      }) as never,
    };
  };

  /**
   * Closes the handle of a stream whose open answered after its caller gave
   * up on it.
   */
  const releaseLateOpen = (pending: Promise<types.Envelope>): void => {
    pending.then(
      (envelope) => {
        const answer = (
          envelope.result === undefined || envelope.result === ""
            ? null
            : JSON.parse(envelope.result)
        ) as { readonly handle?: unknown } | null;
        if (typeof answer?.handle === "string" && answer.handle !== "") {
          runCancel(() => transport.streamClose(answer.handle as string));
        }
      },
      () => {},
    );
  };

  const stream = (
    name: string,
    request?: unknown,
    streamOptions?: bindings.CallOptions,
  ): unknown => {
    assertOpen(name);
    const spec = assertServed(name);
    const signal = streamOptions?.signal;
    const async = spec?.async === true;
    const { wire, requestId } = prepare(spec, request);

    if (async && signal?.aborted === true) {
      return Promise.reject(signal.reason);
    }
    if (!async) {
      signal?.throwIfAborted();
    }

    const lane =
      spec?.blocking === true && offload !== undefined
        ? offload.reader()
        : null;

    if (async) {
      const pending =
        lane !== null
          ? lane.open(name, wire)
          : (transport.streamOpenAsync?.(name, wire) ??
            Promise.resolve().then(() => transport.streamOpen(name, wire)));

      const cancel =
        spec === undefined ? null : cancelOf(spec, requestId, null, "");

      return guarded(pending, signal, cancel).then(
        (envelope) => {
          try {
            return openStream(
              name,
              spec,
              unwrap(name, envelope),
              lane,
              requestId,
            );
          } catch (error) {
            lane?.end();
            throw error;
          }
        },
        (error: unknown) => {
          lane?.end();
          releaseLateOpen(pending);
          throw error;
        },
      );
    }

    let opened: unknown;
    try {
      opened = unwrap(name, transport.streamOpen(name, wire));
    } catch (error) {
      lane?.end();
      throw error;
    }

    return openStream(name, spec, opened, lane, requestId);
  };

  const cancelInflight = (): void => {
    for (const cancel of [...inflight]) {
      runCancel(cancel);
    }
    inflight.clear();
  };

  if (offload !== undefined) {
    exitCancels.add(cancelInflight);
    installExitHook();
  }

  return {
    backend,
    handshake,
    call: call as types.FFILibrary["call"],
    stream: stream as types.FFILibrary["stream"],
    workers: () => offload?.stats() ?? NO_WORKERS,
    close: (): void => {
      if (closed) {
        return;
      }

      closed = true;
      exitCancels.delete(cancelInflight);
      // Stop what is in flight first: a worker cannot end while its Go call
      // runs, and a cancelled call returns at once.
      cancelInflight();
      offload?.close();
      transport.close();
    },
  };
};
