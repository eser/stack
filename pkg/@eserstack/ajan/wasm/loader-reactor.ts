// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The WASM loader of eser-ajan: one reused instance of the wasi-profile
 * reactor (decision-45).
 *
 * The module is compiled once per process and one instance serves every call,
 * so handles (parsing and codebase streams, caches) live across calls. A call
 * writes the dispatch name and its length-prefixed string arguments into the
 * module's input arena, runs `eser_ajan_call` and reads the dispatcher's JSON
 * envelope at `eser_ajan_result_ptr` (see main_wasi_reactor.go for the
 * protocol). A registry name takes one argument, its request; the stream
 * operations are the reserved names `stream.open`, `stream.read` and
 * `stream.close` (reactor_protocol.go).
 *
 * Host rules:
 * - At load, the `version` call is a handshake: it answers the ABI version,
 *   the profile and every name the build serves. A module with another ABI
 *   version is refused.
 * - A name the binding table marks `wasm: "no"` throws
 *   `UnsupportedInWasmError` without calling into the module.
 * - Any exception that is not an envelope (a trap, a RangeError, proc_exit)
 *   marks the instance dead, and the next call builds a new one from the
 *   cached module. Its handles are gone with it.
 * - `memory.buffer` is read again after every export call, because the
 *   module's memory can grow and detach the old buffer.
 * - With node:wasi available, the module gets a preopen of the working
 *   directory, so the filesystem names (`wasm: "fs"`) work. Under the plain
 *   WASI shim (the browser example) they answer the WASI error.
 *
 * @module
 */

import * as library from "../ffi/library.ts";
import * as resolve from "../ffi/resolve.ts";
import type * as types from "../ffi/types.ts";
import * as hostFetch from "./host-fetch.ts";
import * as wasiShim from "./wasi-shim.ts";

/** The dispatcher ABI this loader speaks, from dispatch.go. */
export const REACTOR_ABI_VERSION: number = library.ABI_VERSION;

/**
 * The envelope `eser_ajan_call` stores for one call: the dispatcher's
 * envelope. A module from before ABI 3 also put its ABI version on the
 * `version` envelope, which the handshake check reads to name it.
 */
export interface ReactorEnvelope extends types.Envelope {
  readonly abi?: number;
}

/** What the `version` handshake reported at load. */
export type ReactorHandshake = types.Handshake;

export { UnsupportedInWasmError } from "../ffi/errors.ts";

/** The exports of the reactor module. */
export type ReactorExports = {
  readonly memory: WebAssembly.Memory;
  readonly eser_ajan_alloc: (size: number) => number;
  readonly eser_ajan_call: (
    namePtr: number,
    nameLen: number,
    argsPtr: number,
    argsLen: number,
  ) => number;
  readonly eser_ajan_result_ptr: () => number;
  /** The same call for the names that wait on the host (ABI 2, TASK-277). */
  readonly eser_ajan_call_async: (
    namePtr: number,
    nameLen: number,
    argsPtr: number,
    argsLen: number,
  ) => number;
  readonly eser_ajan_async_result_ptr: () => number;
};

/** The WASI side of one instance. */
type WasiHost = {
  readonly imports: WebAssembly.Imports;
  readonly initialize: (instance: WebAssembly.Instance) => void;
  /** Passes what the module wrote to stdout and stderr on to the process. */
  readonly drain: () => void;
};

// globalThis does not declare process on every runtime. The loader reads
// Node's process itself, not the cross-runtime layer, because it runs on hosts
// without Node's built-ins (see "Process access" in ffi/resolve.ts).
// oxlint-disable-next-line typescript/no-explicit-any
const g = globalThis as any;

const writeToProcess = (stream: "stdout" | "stderr", bytes: Uint8Array) => {
  if (bytes.length > 0) {
    g.process?.[stream]?.write?.(bytes);
  }
};

/** Builds the WASI side of a new instance, synchronously. */
type WasiHostFactory = () => WasiHost;

const shimHost = (): WasiHost => {
  const shim = new wasiShim.WasiShim();

  return {
    imports: { wasi_snapshot_preview1: shim.wasiImport },
    initialize: (instance) => shim.initialize(instance),
    drain: () => {
      const output = shim.takeOutput();
      writeToProcess("stdout", output.stdout);
      writeToProcess("stderr", output.stderr);
    },
  };
};

/**
 * The WASI host factory over `nodeWasi`: node:wasi with a preopen of the
 * working directory, or the built-in shim, which has no filesystem, when the
 * runtime has no node:wasi. Building an instance's host is synchronous, so
 * replacing a failed instance later is too.
 */
const wasiHostFactory = (
  nodeWasi: typeof import("node:wasi") | undefined,
): WasiHostFactory => {
  if (nodeWasi === undefined) {
    return shimHost;
  }

  const wasiModule = nodeWasi;
  return () => {
    try {
      const cwd: string = g.process.cwd();
      const wasi = new wasiModule.WASI({
        version: "preview1",
        args: ["eser-ajan"],
        // Go reads PWD for its working directory, so relative paths resolve
        // against the host's.
        env: { PWD: cwd },
        preopens: { [cwd]: cwd },
        returnOnExit: true,
      });

      return {
        imports: wasi.getImportObject() as WebAssembly.Imports,
        initialize: (instance) => wasi.initialize(instance),
        drain: () => {},
      };
    } catch {
      // node:wasi exists but cannot run here; use the shim.
      return shimHost();
    }
  };
};

/** node:wasi through a dynamic import, `undefined` where it does not exist. */
const importNodeWasi = async (): Promise<
  typeof import("node:wasi") | undefined
> => {
  try {
    return await import("node:wasi");
  } catch {
    return undefined;
  }
};

/**
 * A compiled reactor module with the WASI host factory for its instances:
 * everything a load needs before the first instance.
 */
export interface PreparedReactor {
  readonly wasmPath: string;
  readonly module: WebAssembly.Module;
  readonly makeHost: WasiHostFactory;
}

/**
 * Compiles the reactor module at `wasmPath` off the calling thread
 * (`WebAssembly.compile`) and picks its WASI host.
 */
export const prepareReactor = async (
  wasmPath: string,
): Promise<PreparedReactor> => {
  const nodeFs = await import("node:fs");
  const wasmModule = await WebAssembly.compile(nodeFs.readFileSync(wasmPath));

  return {
    wasmPath,
    module: wasmModule,
    makeHost: wasiHostFactory(await importNodeWasi()),
  };
};

/**
 * Compiles the reactor module at `wasmPath` on the calling thread
 * (`new WebAssembly.Module`) and picks its WASI host. `node:fs` and
 * `node:wasi` come from `process.getBuiltinModule`.
 *
 * @throws {Error} When the host has no synchronous `node:fs`, or the file
 *   does not compile
 */
export const prepareReactorSync = (wasmPath: string): PreparedReactor => {
  const nodeFs =
    resolve.getBuiltinModuleSync<typeof import("node:fs")>("node:fs");
  if (nodeFs === undefined) {
    throw new Error(
      "the synchronous WASM load needs node:fs through process.getBuiltinModule, which this host does not offer",
    );
  }

  return {
    wasmPath,
    module: new WebAssembly.Module(nodeFs.readFileSync(wasmPath)),
    makeHost: wasiHostFactory(
      resolve.getBuiltinModuleSync<typeof import("node:wasi")>("node:wasi"),
    ),
  };
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** The arguments as little-endian uint32 lengths, each followed by its bytes. */
const encodeArgs = (args: readonly string[]): Uint8Array => {
  const encoded = args.map((arg) => encoder.encode(arg));
  const size = encoded.reduce((total, bytes) => total + 4 + bytes.length, 0);
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  let offset = 0;
  for (const bytes of encoded) {
    view.setUint32(offset, bytes.length, true);
    out.set(bytes, offset + 4);
    offset += 4 + bytes.length;
  }
  return out;
};

/** One reactor module and the instance that serves its calls. */
export interface ReactorHost {
  /** What the `version` handshake reported. */
  readonly handshake: ReactorHandshake;
  /** Runs one call and returns its envelope. */
  readonly callEnvelope: (fn: string, ...args: string[]) => ReactorEnvelope;
  /**
   * Runs one call that may wait on the host's fetch, through
   * `WebAssembly.promising`. These calls run one at a time; synchronous calls
   * go on while one waits.
   */
  readonly callEnvelopeAsync: (
    fn: string,
    ...args: string[]
  ) => Promise<ReactorEnvelope>;
  /** Drops the instance; the next call builds a new one. */
  readonly close: () => void;
}

/** Options for {@link createReactorHost}. */
export interface ReactorHostOptions {
  /**
   * Wraps the exports of each new instance, for tests that need a call to
   * fail the way a trapped instance does.
   */
  readonly wrapExports?: (exports: ReactorExports) => ReactorExports;
}

/**
 * Checks the `version` envelope of a freshly loaded module and returns its
 * handshake.
 *
 * @throws {Error} When the module speaks another ABI version
 */
export const checkHandshake = (
  version: ReactorEnvelope,
  wasmPath: string,
): ReactorHandshake =>
  library.checkHandshake(version.result ?? "", wasmPath, version.abi);

/**
 * Compiles the reactor module at `wasmPath`, instantiates it and checks the
 * handshake.
 *
 * @throws {Error} When the module speaks another ABI version
 */
export const createReactorHost = async (
  wasmPath: string,
  options: ReactorHostOptions = {},
): Promise<ReactorHost> =>
  createReactorHostFrom(await prepareReactor(wasmPath), options);

/**
 * Instantiates a prepared reactor module and checks the handshake.
 * Synchronous: the module is already compiled.
 *
 * @throws {Error} When the module speaks another ABI version
 */
export const createReactorHostFrom = (
  prepared: PreparedReactor,
  options: ReactorHostOptions = {},
): ReactorHost => {
  const { wasmPath, module: wasmModule, makeHost } = prepared;

  type Live = {
    readonly exports: ReactorExports;
    readonly host: WasiHost;
    readonly callAsync: (...args: number[]) => Promise<number>;
  };
  let current: Live | null = null;

  const instantiate = (): Live => {
    const host = makeHost();
    let memory: WebAssembly.Memory | null = null;
    const instance = new WebAssembly.Instance(wasmModule, {
      ...host.imports,
      eser_host: hostFetch.createHostImports(() => memory!),
    });
    host.initialize(instance);
    const raw = instance.exports as unknown as ReactorExports;
    const exports = options.wrapExports?.(raw) ?? raw;
    memory = exports.memory;

    const promising = (
      WebAssembly as unknown as {
        promising?: (fn: unknown) => (...args: number[]) => Promise<number>;
      }
    ).promising;
    const callAsync =
      hostFetch.hasJspi() && promising !== undefined
        ? promising(exports.eser_ajan_call_async)
        : (...args: number[]) =>
            Promise.resolve().then(() =>
              (exports.eser_ajan_call_async as (...a: number[]) => number)(
                ...args,
              ),
            );

    return { exports, host, callAsync };
  };

  /** Writes the name and the arguments into the input arena. */
  const writeInput = (
    exports: ReactorExports,
    fn: string,
    args: readonly string[],
  ): readonly [number, number, number, number] => {
    const name = encoder.encode(fn);
    const argBytes = encodeArgs(args);
    const ptr = exports.eser_ajan_alloc(name.length + argBytes.length);
    const input = new Uint8Array(
      exports.memory.buffer,
      ptr,
      name.length + argBytes.length,
    );
    input.set(name, 0);
    input.set(argBytes, name.length);

    return [ptr, name.length, ptr + name.length, argBytes.length];
  };

  const invoke = (fn: string, args: readonly string[]): ReactorEnvelope => {
    // A dead or closed instance is replaced from the cached module.
    current ??= instantiate();
    const { exports, host } = current;
    try {
      const length = exports.eser_ajan_call(...writeInput(exports, fn, args));
      const resultPtr = exports.eser_ajan_result_ptr();
      const text = decoder.decode(
        new Uint8Array(exports.memory.buffer, resultPtr, length).slice(),
      );
      host.drain();

      return JSON.parse(text) as ReactorEnvelope;
    } catch (error) {
      host.drain();
      // Not an envelope: the instance may be corrupt, so the next call gets a
      // new one.
      current = null;
      throw new Error(
        `eser-ajan WASM call "${fn}" failed and the instance was replaced: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { cause: error },
      );
    }
  };

  // One waiting call at a time: the host hands each response over through
  // one buffer per instance.
  let asyncQueue: Promise<unknown> = Promise.resolve();

  const invokeAsync = (
    fn: string,
    args: readonly string[],
  ): Promise<ReactorEnvelope> => {
    const run = async (): Promise<ReactorEnvelope> => {
      current ??= instantiate();
      const live = current;
      try {
        const length = await live.callAsync(
          ...writeInput(live.exports, fn, args),
        );
        const resultPtr = live.exports.eser_ajan_async_result_ptr();
        const text = decoder.decode(
          new Uint8Array(live.exports.memory.buffer, resultPtr, length).slice(),
        );
        live.host.drain();

        return JSON.parse(text) as ReactorEnvelope;
      } catch (error) {
        live.host.drain();
        if (current === live) {
          current = null;
        }
        throw new Error(
          `eser-ajan WASM call "${fn}" failed and the instance was replaced: ${
            error instanceof Error ? error.message : String(error)
          }`,
          { cause: error },
        );
      }
    };

    const result = asyncQueue.then(run, run);
    asyncQueue = result.catch(() => {});

    return result;
  };

  const handshake = checkHandshake(invoke("version", []), wasmPath);

  return {
    handshake,
    callEnvelope: (fn, ...args) => invoke(fn, args),
    callEnvelopeAsync: (fn, ...args) => invokeAsync(fn, args),
    close: () => {
      current = null;
    },
  };
};

/** The reserved names of the stream operations (reactor_protocol.go). */
const STREAM_OPEN = "stream.open";
const STREAM_READ = "stream.read";
const STREAM_CLOSE = "stream.close";

/**
 * Builds the dispatcher transport over one reactor host. The async
 * operations wait on the host's fetch through `WebAssembly.promising`.
 */
export const createReactorTransport = (
  reactor: ReactorHost,
): types.Transport => ({
  call: (name, request) => reactor.callEnvelope(name, request),
  streamOpen: (name, request) =>
    reactor.callEnvelope(STREAM_OPEN, name, request),
  streamRead: (handle) => reactor.callEnvelope(STREAM_READ, handle),
  streamClose: (handle) => reactor.callEnvelope(STREAM_CLOSE, handle),
  callAsync: (name, request) => reactor.callEnvelopeAsync(name, request),
  streamOpenAsync: (name, request) =>
    reactor.callEnvelopeAsync(STREAM_OPEN, name, request),
  streamReadAsync: (handle) => reactor.callEnvelopeAsync(STREAM_READ, handle),
  close: () => {
    reactor.close();
  },
});

/**
 * Loads the reactor module and returns the typed library over it.
 *
 * @param wasmPath - Absolute path to the `eser-ajan.wasm` file.
 * @returns The library.
 */
export const loadReactorWasm = async (
  wasmPath: string,
): Promise<types.FFILibrary> =>
  loadPreparedReactor(await prepareReactor(wasmPath));

/**
 * Instantiates a prepared reactor module and returns the typed library over
 * it. Synchronous: the module is already compiled.
 */
export const loadPreparedReactor = (
  prepared: PreparedReactor,
): types.FFILibrary => {
  const reactor = createReactorHostFrom(prepared);

  return library.createLibrary({
    backend: "wasm",
    handshake: reactor.handshake,
    transport: createReactorTransport(reactor),
  });
};

/**
 * Loads the reactor module without awaiting: it compiles on the calling
 * thread (see {@link prepareReactorSync}).
 *
 * @param wasmPath - Absolute path to the `eser-ajan.wasm` file.
 * @returns The library.
 */
export const loadReactorWasmSync = (wasmPath: string): types.FFILibrary =>
  loadPreparedReactor(prepareReactorSync(wasmPath));
