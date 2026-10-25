// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The WASM loader of eser-ajan: one reused instance of the wasi-profile
 * reactor (decision-45).
 *
 * The module is compiled once per process and one instance serves every call,
 * so handles (parsing and codebase streams, caches) live across calls. A call
 * writes the dispatch name and its length-prefixed string arguments into the
 * module's input arena, runs `eser_ajan_call` and reads the JSON envelope at
 * `eser_ajan_result_ptr` (see main_wasi_reactor.go for the protocol).
 *
 * Host rules:
 * - At load, the `version` call is a handshake: its envelope names the ABI
 *   version, the profile and every name the build serves. A module with
 *   another ABI version is refused.
 * - A name outside the profile throws {@link UnsupportedInWasmError} without
 *   calling into the module.
 * - Any exception that is not an envelope (a trap, a RangeError, proc_exit)
 *   marks the instance dead, and the next call builds a new one from the
 *   cached module. Its handles are gone with it.
 * - `memory.buffer` is read again after every export call, because the
 *   module's memory can grow and detach the old buffer.
 * - With node:wasi available, the module gets a preopen of the working
 *   directory, so the filesystem names work. Under the plain WASI shim (the
 *   browser example) they answer the WASI error.
 *
 * @module
 */

import type * as types from "../ffi/types.ts";
import * as hostFetch from "./host-fetch.ts";
import * as wasiShim from "./wasi-shim.ts";

/** The reactor ABI this loader speaks, from main_wasi_reactor.go. */
export const REACTOR_ABI_VERSION = 2;

/** The envelope `eser_ajan_call` stores for one call. */
export interface ReactorEnvelope {
  readonly ok: boolean;
  readonly result?: string;
  readonly error?: string;
  /** Handshake fields, set on the `version` envelope only. */
  readonly abi?: number;
  readonly profile?: string;
  readonly names?: readonly string[];
}

/** What the `version` handshake reported at load. */
export interface ReactorHandshake {
  readonly abi: number;
  readonly profile: string;
  readonly names: readonly string[];
  readonly version: string;
}

/** A call to a name the loaded WASM profile does not serve. */
export class UnsupportedInWasmError extends Error {
  readonly code = "UNSUPPORTED_IN_WASM";
  readonly fn: string;

  constructor(fn: string, profile: string) {
    super(
      `eser-ajan WASM: "${fn}" is not in the ${profile} profile ` +
        `(UNSUPPORTED_IN_WASM). Install the native library (the ` +
        `@eserstack/ajan platform package for this OS and architecture) or ` +
        `set ESER_AJAN_LIB_PATH to an existing build.`,
    );
    this.fn = fn;
    this.name = "UnsupportedInWasmError";
  }
}

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

// globalThis does not declare process on every runtime.
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
 * node:wasi when the runtime provides it, with a preopen of the working
 * directory; otherwise the built-in shim, which has no filesystem. The import
 * happens once, so replacing a failed instance later is synchronous.
 */
const createWasiHostFactory = async (): Promise<WasiHostFactory> => {
  let nodeWasi: typeof import("node:wasi") | null = null;
  try {
    nodeWasi = await import("node:wasi");
  } catch {
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
): ReactorHandshake => {
  if (version.abi !== REACTOR_ABI_VERSION) {
    throw new Error(
      `eser-ajan WASM module ${wasmPath} speaks reactor ABI ${
        version.abi ?? "none"
      }, but this loader speaks ABI ${REACTOR_ABI_VERSION}; use a module and a loader from the same release`,
    );
  }

  return {
    abi: version.abi,
    profile: version.profile ?? "unknown",
    names: version.names ?? [],
    version: version.result ?? "",
  };
};

/**
 * Compiles the reactor module at `wasmPath`, instantiates it and checks the
 * handshake.
 *
 * @throws {Error} When the module speaks another ABI version
 */
export const createReactorHost = async (
  wasmPath: string,
  options: ReactorHostOptions = {},
): Promise<ReactorHost> => {
  const nodeFs = await import("node:fs");
  const wasmModule = await WebAssembly.compile(nodeFs.readFileSync(wasmPath));

  const makeHost = await createWasiHostFactory();

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

/**
 * Loads the reactor module and returns an FFILibrary-compatible handle, whose
 * symbols map to the reactor's dispatch names.
 *
 * @param wasmPath - Absolute path to the `eser-ajan.wasm` file.
 * @returns An FFILibrary-compatible object.
 */
export const loadReactorWasm = async (
  wasmPath: string,
): Promise<types.FFILibrary> => {
  const reactor = await createReactorHost(wasmPath);
  const served = new Set(reactor.handshake.names);

  /**
   * Calls one dispatch name. A bridge function answers failures as JSON with
   * an "error" field, which the native library returns as a string too, so the
   * answer comes back whenever there is one; only a call that produced none
   * (an unknown name, a wrong argument count) throws.
   */
  const call = (fn: string, ...args: string[]): string => {
    if (!served.has(fn)) {
      throw new UnsupportedInWasmError(fn, reactor.handshake.profile);
    }

    const envelope = reactor.callEnvelope(fn, ...args);
    if (envelope.result !== undefined) {
      return envelope.result;
    }

    throw new Error(
      `eser-ajan WASM call "${fn}" failed: ${
        envelope.error ?? "unknown error"
      }`,
    );
  };

  /** {@link call} for the names that wait on the host's fetch. */
  const callAsync = async (fn: string, ...args: string[]): Promise<string> => {
    if (!served.has(fn)) {
      throw new UnsupportedInWasmError(fn, reactor.handshake.profile);
    }

    const envelope = await reactor.callEnvelopeAsync(fn, ...args);
    if (envelope.result !== undefined) {
      return envelope.result;
    }

    throw new Error(
      `eser-ajan WASM call "${fn}" failed: ${
        envelope.error ?? "unknown error"
      }`,
    );
  };

  // Every symbol keeps its literal key and its literal dispatch name: the ABI
  // parity guard in @eserstack/codebase/ajan-ffi-parity.test.ts reads both
  // out of this source text.
  return {
    symbols: {
      EserAjanVersion: () => call("version"),
      EserAjanInit: () => {
        call("init");
        return 0;
      },
      EserAjanShutdown: () => {
        call("shutdown");
      },
      EserAjanFree: (_ptr: unknown) => {
        // No-op: the reactor's results are copied out of its memory.
      },
      EserAjanConfigLoad: (optionsJSON: string) =>
        call("configLoad", optionsJSON),
      EserAjanDIResolve: (name: string) => call("diResolve", name),
      EserAjanAiCreateModel: (configJSON: string) =>
        call("aiCreateModel", configJSON),
      EserAjanAiGenerateText: (modelHandle: string, optionsJSON: string) =>
        call("aiGenerateText", modelHandle, optionsJSON),
      EserAjanAiStreamText: (modelHandle: string, optionsJSON: string) =>
        call("aiStreamText", modelHandle, optionsJSON),
      EserAjanAiStreamRead: (streamHandle: string) =>
        call("aiStreamRead", streamHandle),
      EserAjanAiCancelRequest: (requestJSON: string) =>
        call("aiCancelRequest", requestJSON),
      EserAjanAiCloseModel: (modelHandle: string) =>
        call("aiCloseModel", modelHandle),
      EserAjanAiFreeStream: (streamHandle: string) =>
        call("aiFreeStream", streamHandle),
      EserAjanAiBatchCreate: (requestJSON: string) =>
        call("aiBatchCreate", requestJSON),
      EserAjanAiBatchGet: (requestJSON: string) =>
        call("aiBatchGet", requestJSON),
      EserAjanAiBatchList: (requestJSON: string) =>
        call("aiBatchList", requestJSON),
      EserAjanAiBatchDownload: (requestJSON: string) =>
        call("aiBatchDownload", requestJSON),
      EserAjanAiBatchCancel: (requestJSON: string) =>
        call("aiBatchCancel", requestJSON),
      EserAjanFormatEncode: (requestJSON: string) =>
        call("formatEncode", requestJSON),
      EserAjanFormatDecode: (requestJSON: string) =>
        call("formatDecode", requestJSON),
      EserAjanFormatList: () => call("formatList"),
      EserAjanFormatEncodeDocument: (requestJSON: string) =>
        call("formatEncodeDocument", requestJSON),
      EserAjanLogCreate: (configJSON: string) => call("logCreate", configJSON),
      EserAjanLogWrite: (requestJSON: string) => call("logWrite", requestJSON),
      EserAjanLogClose: (handle: string) => call("logClose", handle),
      EserAjanLogShouldLog: (requestJSON: string) =>
        call("logShouldLog", requestJSON),
      EserAjanLogConfigure: (requestJSON: string) =>
        call("logConfigure", requestJSON),
      EserAjanHttpCreate: (configJSON: string) =>
        call("httpCreate", configJSON),
      // The three that wait on the host's fetch answer a promise.
      EserAjanHttpRequest: (requestJSON: string) =>
        callAsync("httpRequest", requestJSON),
      EserAjanHttpClose: (handle: string) => call("httpClose", handle),
      EserAjanHttpRequestStream: (requestJSON: string) =>
        callAsync("httpRequestStream", requestJSON),
      EserAjanHttpStreamRead: (handle: string) =>
        callAsync("httpStreamRead", handle),
      EserAjanHttpStreamClose: (handle: string) =>
        call("httpStreamClose", handle),
      EserAjanNoskillsInit: (requestJSON: string) =>
        call("noskillsInit", requestJSON),
      EserAjanNoskillsSpecNew: (requestJSON: string) =>
        call("noskillsSpecNew", requestJSON),
      EserAjanNoskillsNext: (requestJSON: string) =>
        call("noskillsNext", requestJSON),
      EserAjanWorkflowRun: (requestJSON: string) =>
        call("workflowRun", requestJSON),
      EserAjanCryptoHash: (requestJSON: string) =>
        call("cryptoHash", requestJSON),
      EserAjanCacheCreate: (requestJSON: string) =>
        call("cacheCreate", requestJSON),
      EserAjanCacheGetDir: (requestJSON: string) =>
        call("cacheGetDir", requestJSON),
      EserAjanCacheGetVersionedPath: (requestJSON: string) =>
        call("cacheGetVersionedPath", requestJSON),
      EserAjanCacheList: (requestJSON: string) =>
        call("cacheList", requestJSON),
      EserAjanCacheRemove: (requestJSON: string) =>
        call("cacheRemove", requestJSON),
      EserAjanCacheClear: (requestJSON: string) =>
        call("cacheClear", requestJSON),
      EserAjanCacheClose: (requestJSON: string) =>
        call("cacheClose", requestJSON),
      EserAjanCsGenerate: (requestJSON: string) =>
        call("csGenerate", requestJSON),
      EserAjanCsSync: (requestJSON: string) => call("csSync", requestJSON),
      EserAjanKitListRecipes: (requestJSON: string) =>
        call("kitListRecipes", requestJSON),
      EserAjanKitApplyRecipe: (requestJSON: string) =>
        call("kitApplyRecipe", requestJSON),
      EserAjanKitCloneRecipe: (requestJSON: string) =>
        call("kitCloneRecipe", requestJSON),
      EserAjanKitNewProject: (requestJSON: string) =>
        call("kitNewProject", requestJSON),
      EserAjanKitUpdateRecipe: (requestJSON: string) =>
        call("kitUpdateRecipe", requestJSON),
      EserAjanPostsCreateService: (requestJSON: string) =>
        call("postsCreateService", requestJSON),
      EserAjanPostsCompose: (requestJSON: string) =>
        call("postsCompose", requestJSON),
      EserAjanPostsGetTimeline: (requestJSON: string) =>
        call("postsGetTimeline", requestJSON),
      EserAjanPostsSearch: (requestJSON: string) =>
        call("postsSearch", requestJSON),
      EserAjanPostsClose: (requestJSON: string) =>
        call("postsClose", requestJSON),
      EserAjanCodebaseGitCurrentBranch: (requestJSON: string) =>
        call("codebaseGitCurrentBranch", requestJSON),
      EserAjanCodebaseGitLatestTag: (requestJSON: string) =>
        call("codebaseGitLatestTag", requestJSON),
      EserAjanCodebaseGitLog: (requestJSON: string) =>
        call("codebaseGitLog", requestJSON),
      EserAjanCodebaseValidateCommitMsg: (requestJSON: string) =>
        call("codebaseValidateCommitMsg", requestJSON),
      EserAjanCodebaseGenerateChangelog: (requestJSON: string) =>
        call("codebaseGenerateChangelog", requestJSON),
      EserAjanCodebaseBumpVersion: (requestJSON: string) =>
        call("codebaseBumpVersion", requestJSON),
      EserAjanCodebaseWalkFiles: (requestJSON: string) =>
        call("codebaseWalkFiles", requestJSON),
      EserAjanCodebaseValidateFiles: (requestJSON: string) =>
        call("codebaseValidateFiles", requestJSON),
      EserAjanCodebaseCheckCircularDeps: (requestJSON: string) =>
        call("codebaseCheckCircularDeps", requestJSON),
      EserAjanCodebaseCheckExportNames: (requestJSON: string) =>
        call("codebaseCheckExportNames", requestJSON),
      EserAjanCodebaseCheckModExports: (requestJSON: string) =>
        call("codebaseCheckModExports", requestJSON),
      EserAjanCodebaseCheckDocs: (requestJSON: string) =>
        call("codebaseCheckDocs", requestJSON),
      EserAjanCodebaseWalkFilesStreamCreate: (requestJSON: string) =>
        call("codebaseWalkFilesStreamCreate", requestJSON),
      EserAjanCodebaseWalkFilesStreamRead: (handle: string) =>
        call("codebaseWalkFilesStreamRead", handle),
      EserAjanCodebaseWalkFilesStreamClose: (handle: string) =>
        call("codebaseWalkFilesStreamClose", handle),
      EserAjanCodebaseValidateFilesStreamCreate: (requestJSON: string) =>
        call("codebaseValidateFilesStreamCreate", requestJSON),
      EserAjanCodebaseValidateFilesStreamRead: (handle: string) =>
        call("codebaseValidateFilesStreamRead", handle),
      EserAjanCodebaseValidateFilesStreamClose: (handle: string) =>
        call("codebaseValidateFilesStreamClose", handle),
      EserAjanCollectorSpecifierToIdentifier: (requestJSON: string) =>
        call("collectorSpecifierToIdentifier", requestJSON),
      EserAjanCollectorWalkFiles: (requestJSON: string) =>
        call("collectorWalkFiles", requestJSON),
      EserAjanCollectorGenerateManifest: (requestJSON: string) =>
        call("collectorGenerateManifest", requestJSON),
      EserAjanParsingTokenize: (requestJSON: string) =>
        call("parsingTokenize", requestJSON),
      EserAjanParsingSimpleTokens: () => call("parsingSimpleTokens"),
      EserAjanParsingTokenizeStreamCreate: (requestJSON: string) =>
        call("parsingTokenizeStreamCreate", requestJSON),
      EserAjanParsingTokenizeStreamPush: (requestJSON: string) =>
        call("parsingTokenizeStreamPush", requestJSON),
      EserAjanParsingTokenizeStreamClose: (requestJSON: string) =>
        call("parsingTokenizeStreamClose", requestJSON),
      EserAjanShellExec: (requestJSON: string) =>
        call("shellExec", requestJSON),
      EserAjanShellTuiKeypressCreate: (requestJSON: string) =>
        call("shellTuiKeypressCreate", requestJSON),
      EserAjanShellTuiKeypressRead: (handle: string) =>
        call("shellTuiKeypressRead", handle),
      EserAjanShellTuiKeypressClose: (handle: string) =>
        call("shellTuiKeypressClose", handle),
      EserAjanShellTuiSetStdinRaw: (requestJSON: string) =>
        call("shellTuiSetStdinRaw", requestJSON),
      EserAjanShellTuiGetSize: (requestJSON: string) =>
        call("shellTuiGetSize", requestJSON),
      EserAjanShellExecSpawn: (requestJSON: string) =>
        call("shellExecSpawn", requestJSON),
      EserAjanShellExecRead: (handle: string) => call("shellExecRead", handle),
      EserAjanShellExecWrite: (requestJSON: string) =>
        call("shellExecWrite", requestJSON),
      EserAjanShellExecClose: (handle: string) =>
        call("shellExecClose", handle),
      EserAjanShellPtySpawn: (requestJSON: string) =>
        call("shellPtySpawn", requestJSON),
      // Deferred through `then` so a failure surfaces on the returned promise:
      // this symbol is declared async, and a synchronous throw would break
      // callers that only attach a `catch`.
      EserAjanShellPtyRead: (handle: string): Promise<string> =>
        Promise.resolve().then(() => call("shellPtyRead", handle)),
      EserAjanShellPtyWrite: (requestJSON: string) =>
        call("shellPtyWrite", requestJSON),
      EserAjanShellPtyResize: (requestJSON: string) =>
        call("shellPtyResize", requestJSON),
      EserAjanShellPtyKill: (requestJSON: string) =>
        call("shellPtyKill", requestJSON),
      EserAjanShellPtyClose: (handle: string) => call("shellPtyClose", handle),
    },
    close: () => {
      reactor.close();
    },
  };
};
