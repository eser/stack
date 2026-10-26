// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Shared types for the FFI abstraction layer.
 *
 * Both backends, the node:ffi library and the WASM fallback, reach the Go
 * dispatch registry through the same four operations (dispatch.go): call a
 * name, open a stream, read it, close it. Each answers an {@link Envelope}.
 * {@link FFILibrary} puts the typed binding table (bindings.ts) on top.
 *
 * @module
 */

import type * as bindings from "./bindings.ts";
import type * as offload from "./offload.ts";

export type { Handshake } from "./bindings.ts";
export type { WorkerStats } from "./offload.ts";

/** Which backend serves a library. */
export type Backend = "native" | "wasm";

/**
 * The answer of every dispatcher operation. `result` is the bridge function's
 * JSON answer; `ok: false` with a `result` is an answer that carries an error,
 * and an envelope without `result` means no bridge function ran (`code` says
 * why: UNKNOWN_FUNCTION, UNSUPPORTED_IN_WASM, KIND_MISMATCH, UNKNOWN_HANDLE,
 * BAD_REQUEST).
 */
export interface Envelope {
  readonly ok: boolean;
  readonly result?: string;
  readonly code?: string;
  readonly error?: string;
}

/** The four dispatcher operations of one backend. */
export interface Transport {
  readonly call: (name: string, request: string) => Envelope;
  readonly streamOpen: (name: string, request: string) => Envelope;
  readonly streamRead: (handle: string) => Envelope;
  readonly streamClose: (handle: string) => Envelope;
  /**
   * The same operations for the async names (bindings.ts), on a backend that
   * waits on the host for them. Without them, the async names run through
   * the synchronous operations above.
   */
  readonly callAsync?: (name: string, request: string) => Promise<Envelope>;
  readonly streamOpenAsync?: (
    name: string,
    request: string,
  ) => Promise<Envelope>;
  readonly streamReadAsync?: (handle: string) => Promise<Envelope>;
  /** Releases the backend. */
  readonly close: () => void;
}

/** An open stream of a stream name. */
export interface AjanStream<N extends bindings.StreamName> {
  readonly name: N;
  /** The stream's handle, or "" when the open answered an error. */
  readonly handle: string;
  /** The open answer. Check its `error` before reading. */
  readonly opened: bindings.OpenedOf<N>;
  /**
   * The next chunk, or null when the stream is done. A blocking stream reads
   * in its own worker and answers a promise; its signal ends the read.
   */
  readonly read: (
    options?: bindings.CallOptions,
  ) => bindings.ReadResult<N, bindings.ChunkOf<N> | null>;
  /**
   * Closes the stream and releases its handle, synchronously on the calling
   * thread. A blocking stream's worker ends with it.
   */
  readonly close: () => bindings.ClosedOf<N>;
}

/**
 * A loaded eser-ajan library, from either backend.
 *
 * `call` and `stream` answer the bridge function's parsed JSON, including an
 * answer that carries an `error` field, so each package keeps its own error
 * mapping. They throw an {@link AjanCallError} subclass only when no bridge
 * function ran: an unknown name, a name the WASM fallback does not serve, a
 * refused request.
 */
export interface FFILibrary {
  /** Which backend serves this library. */
  readonly backend: Backend;
  /** What the version handshake reported at load. */
  readonly handshake: bindings.Handshake;
  /**
   * Runs a call name. A blocking name runs in a pool worker and answers a
   * promise; the other names answer synchronously.
   */
  readonly call: <N extends bindings.CallName>(
    name: N,
    ...args: bindings.CallArgs<N>
  ) => bindings.CallResult<N>;
  /** Opens a stream name. */
  readonly stream: <N extends bindings.StreamName>(
    name: N,
    ...args: bindings.CallArgs<N>
  ) => bindings.MaybeAsync<N, AjanStream<N>>;
  /**
   * The counts of the workers behind the blocking names. A backend without
   * workers (the WASM fallback, a fake) reports zeros.
   */
  readonly workers: () => offload.WorkerStats;
  /**
   * Closes the library handle and releases resources: it runs the cancel
   * entry of each blocking name still in flight and ends every worker.
   */
  readonly close: () => void;
}

/** Platform-specific shared library file extensions. */
export type LibraryExtension = ".so" | ".dylib" | ".dll";
