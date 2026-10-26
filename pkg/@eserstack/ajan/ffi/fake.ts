// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * A library for tests: the typed `call` and `stream` of {@link FFILibrary},
 * answered by handlers instead of the Go bridge.
 *
 * The answers go through the same envelope and decoding path as the real
 * backends, so a test sees what a caller sees: an answer with an `error`
 * field comes back as an answer, and a name without a handler throws
 * {@link errors.UnknownFunctionError}.
 *
 * ```ts
 * const lib = createFakeLibrary({
 *   calls: { formatList: () => ({ formats: [] }) },
 * });
 * ```
 *
 * @module
 */

import type * as bindings from "./bindings.ts";
import * as library from "./library.ts";
import type * as types from "./types.ts";

/** The handler of a call name: request in, answer out. */
export type FakeCall<N extends bindings.CallName> = (
  request: bindings.RequestOf<N>,
) => bindings.ResponseOf<N> | Promise<bindings.ResponseOf<N>>;

/** The handlers of a stream name. */
export interface FakeStream<N extends bindings.StreamName> {
  readonly open: (request: bindings.RequestOf<N>) => bindings.OpenedOf<N>;
  readonly read?: (handle: string) => bindings.ChunkOf<N> | null;
  readonly close?: (handle: string) => bindings.ClosedOf<N>;
}

/** Options for {@link createFakeLibrary}. */
export interface FakeLibraryOptions {
  readonly calls?: { readonly [N in bindings.CallName]?: FakeCall<N> };
  readonly streams?: { readonly [N in bindings.StreamName]?: FakeStream<N> };
  readonly backend?: types.Backend;
  /** Runs when the library closes. */
  readonly onClose?: () => void;
}

const decodeRequest = (request: string): unknown => {
  if (request === "") {
    return undefined;
  }

  try {
    return JSON.parse(request);
  } catch {
    // A bare handle.
    return request;
  }
};

const toEnvelope = (answer: unknown): types.Envelope => {
  const result = JSON.stringify(answer ?? null);
  const error = (answer as { readonly error?: unknown } | null)?.error;
  const failed = typeof error === "string" && error !== "";

  return failed
    ? { ok: false, code: "HANDLER_ERROR", error, result }
    : { ok: true, result };
};

const unknown = (target: string): types.Envelope => ({
  ok: false,
  code: "UNKNOWN_FUNCTION",
  error: `unknown function: ${target}`,
});

/**
 * Builds a library whose names are answered by `options`' handlers.
 *
 * @param options - The handlers and the backend to report
 * @returns The library
 */
export const createFakeLibrary = (
  options: FakeLibraryOptions = {},
): types.FFILibrary => {
  const calls = (options.calls ?? {}) as Readonly<
    Record<string, (request: unknown) => unknown>
  >;
  const streams = (options.streams ?? {}) as Readonly<
    Record<
      string,
      {
        readonly open: (request: unknown) => unknown;
        readonly read?: (handle: string) => unknown;
        readonly close?: (handle: string) => unknown;
      }
    >
  >;
  const handleOwners = new Map<string, string>();

  const callSync = (name: string, request: string): types.Envelope => {
    const handler = calls[name];
    if (handler === undefined) {
      return unknown(name);
    }

    return toEnvelope(handler(decodeRequest(request)));
  };

  const openSync = (name: string, request: string): types.Envelope => {
    const handler = streams[name];
    if (handler === undefined) {
      return unknown(name);
    }

    const opened = handler.open(decodeRequest(request));
    const handle = (opened as { readonly handle?: unknown } | null)?.handle;
    if (typeof handle === "string") {
      handleOwners.set(handle, name);
    }

    return toEnvelope(opened);
  };

  const owned = (handle: string) => {
    const name = handleOwners.get(handle);

    return name === undefined ? undefined : streams[name];
  };

  const transport: types.Transport = {
    call: callSync,
    callAsync: async (name, request) => {
      const handler = calls[name];
      if (handler === undefined) {
        return unknown(name);
      }

      return toEnvelope(await handler(decodeRequest(request)));
    },
    streamOpen: openSync,
    streamRead: (handle) => {
      const stream = owned(handle);
      if (stream === undefined) {
        return { ok: false, code: "UNKNOWN_HANDLE", error: handle };
      }

      return toEnvelope(stream.read?.(handle) ?? null);
    },
    streamClose: (handle) => {
      const stream = owned(handle);
      if (stream === undefined) {
        return { ok: false, code: "UNKNOWN_HANDLE", error: handle };
      }

      return toEnvelope(stream.close?.(handle) ?? {});
    },
    close: () => {
      options.onClose?.();
    },
  };

  return library.createLibrary({
    backend: options.backend ?? "native",
    handshake: {
      version: "fake",
      abi: library.ABI_VERSION,
      profile: options.backend === "wasm" ? "wasi" : "native",
      names: [...Object.keys(calls), ...Object.keys(streams)].sort(),
      streams: Object.keys(streams).sort(),
    },
    transport,
  });
};
