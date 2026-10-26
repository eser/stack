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
 * - After `close`, every operation throws instead of reaching into a library
 *   that is no longer there.
 *
 * @module
 */

import * as bindings from "./bindings.ts";
import * as errors from "./errors.ts";
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
}

/**
 * Builds the typed library over one backend's transport.
 *
 * @param options - The backend, its handshake and its transport
 * @returns The library
 */
export const createLibrary = (options: LibraryOptions): types.FFILibrary => {
  const { backend, handshake, transport } = options;
  let closed = false;

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

  const call = (name: string, request?: unknown): unknown => {
    assertOpen(name);
    const spec = assertServed(name);
    const wire = encodeRequest(request);

    if (spec?.async === true) {
      const pending =
        transport.callAsync?.(name, wire) ??
        Promise.resolve().then(() => transport.call(name, wire));

      return pending.then((envelope) => unwrap(name, envelope));
    }

    return unwrap(name, transport.call(name, wire));
  };

  const openStream = (
    name: string,
    async: boolean,
    opened: unknown,
  ): types.AjanStream<bindings.StreamName> => {
    const answer = opened as { readonly handle?: unknown } | null;
    const handle = typeof answer?.handle === "string" ? answer.handle : "";

    const readSync = (): unknown => {
      assertOpen(name);
      return unwrap(name, transport.streamRead(handle));
    };

    return {
      name: name as bindings.StreamName,
      handle,
      opened: opened as never,
      read: (async
        ? () => {
            assertOpen(name);
            const pending =
              transport.streamReadAsync?.(handle) ??
              Promise.resolve().then(() => transport.streamRead(handle));

            return pending.then((envelope) => unwrap(name, envelope));
          }
        : readSync) as never,
      close: (() => {
        assertOpen(name);
        return unwrap(name, transport.streamClose(handle));
      }) as never,
    };
  };

  const stream = (name: string, request?: unknown): unknown => {
    assertOpen(name);
    const spec = assertServed(name);
    const wire = encodeRequest(request);
    const async = spec?.async === true;

    if (async) {
      const pending =
        transport.streamOpenAsync?.(name, wire) ??
        Promise.resolve().then(() => transport.streamOpen(name, wire));

      return pending.then((envelope) =>
        openStream(name, true, unwrap(name, envelope)),
      );
    }

    return openStream(
      name,
      false,
      unwrap(name, transport.streamOpen(name, wire)),
    );
  };

  return {
    backend,
    handshake,
    call: call as types.FFILibrary["call"],
    stream: stream as types.FFILibrary["stream"],
    close: (): void => {
      if (closed) {
        return;
      }

      closed = true;
      transport.close();
    },
  };
};
