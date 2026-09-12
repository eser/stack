// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Command-mode WASM loader for the eser-ajan module.
 *
 * Loads the `eser-ajan.wasm` module which uses a JSON stdin/stdout protocol.
 * For each function call, the loader:
 *   1. Encodes a JSON request as stdin bytes
 *   2. Instantiates the WASM module with the WASI shim
 *   3. Runs `_start` to process the request
 *   4. Reads the JSON response from the captured stdout
 *
 * Works on Node.js, Bun, Deno, and browsers via the built-in WASI shim.
 *
 * ## Handle-based APIs cannot work in this mode
 *
 * `_start` runs the Go program to completion and exits, so an instance is spent
 * after a single request and step 2 above has to build a new one every time.
 * A new instance means new linear memory, and every Go-side handle registry
 * lives in that memory: AI models and streams, in-flight AI request ids,
 * loggers, HTTP clients and response streams, caches, posts services, codebase
 * walk and validate streams, tokenizers, TUI keypress readers, spawned child
 * processes and PTY sessions. A handle minted by one call therefore refers to
 * nothing by the time the next call looks it up, and the Go side answers
 * "handle not found".
 *
 * Making the instance persistent is not an option here -- that is what reactor
 * mode is for. So instead of handing back handles that are already dead, every
 * symbol that creates, consumes or releases one throws (see
 * `HANDLE_BOUND_FUNCTIONS`). The stateless one-shot symbols -- version, config
 * load, formats, crypto, codebase git and validation, collector, parsing,
 * cs, kit, noskills, workflow, shell exec -- work normally.
 *
 * @module
 */

import type * as types from "../ffi/types.ts";
import * as wasiShim from "./wasi-shim.ts";

/**
 * JSON request envelope matching the Go `request` struct in main_wasi.go.
 */
interface WasiRequest {
  fn: string;
  args?: Record<string, string>;
}

/**
 * JSON response envelope matching the Go `response` struct in main_wasi.go.
 */
interface WasiResponse {
  ok: boolean;
  result?: string;
  error?: string;
}

/**
 * Dispatch names whose Go implementation reads, writes or deletes an entry in a
 * handle registry, mapped to the exported symbol the caller sees.
 *
 * Derived from the dispatch switch in main_wasi.go together with the registries
 * in bridge.go (`modelHandles` / `modelRegistryNames` / `modelInFlight`,
 * `streamHandles`, `aiCancels`, `logHandles`, `httpClientHandles`,
 * `httpStreamHandles`, `cacheHandles`, `postsHandles`,
 * `codebaseWalkStreamHandles`, `codebaseValidateStreamHandles`,
 * `tokenizerHandles`, `tuiKeypressHandles`, `execHandles`, `ptyHandles`) rather
 * than from the symbol names, which do not reliably say: `aiBatchList` takes a
 * model handle, `cacheGetDir` takes a cache handle, and `aiCancelRequest`
 * consumes a request id registered by an earlier generate or stream call.
 *
 * Adding a Go export that touches one of those registries means adding it here
 * too; nothing else in this file distinguishes a stateful symbol from a
 * one-shot one.
 */
const HANDLE_BOUND_FUNCTIONS: Record<string, string> = {
  aiCreateModel: "EserAjanAiCreateModel",
  aiGenerateText: "EserAjanAiGenerateText",
  aiStreamText: "EserAjanAiStreamText",
  aiStreamRead: "EserAjanAiStreamRead",
  aiCancelRequest: "EserAjanAiCancelRequest",
  aiCloseModel: "EserAjanAiCloseModel",
  aiFreeStream: "EserAjanAiFreeStream",
  aiBatchCreate: "EserAjanAiBatchCreate",
  aiBatchGet: "EserAjanAiBatchGet",
  aiBatchList: "EserAjanAiBatchList",
  aiBatchDownload: "EserAjanAiBatchDownload",
  aiBatchCancel: "EserAjanAiBatchCancel",
  logCreate: "EserAjanLogCreate",
  logWrite: "EserAjanLogWrite",
  logClose: "EserAjanLogClose",
  logShouldLog: "EserAjanLogShouldLog",
  logConfigure: "EserAjanLogConfigure",
  httpCreate: "EserAjanHttpCreate",
  httpRequest: "EserAjanHttpRequest",
  httpClose: "EserAjanHttpClose",
  httpRequestStream: "EserAjanHttpRequestStream",
  httpStreamRead: "EserAjanHttpStreamRead",
  httpStreamClose: "EserAjanHttpStreamClose",
  cacheCreate: "EserAjanCacheCreate",
  cacheGetDir: "EserAjanCacheGetDir",
  cacheGetVersionedPath: "EserAjanCacheGetVersionedPath",
  cacheList: "EserAjanCacheList",
  cacheRemove: "EserAjanCacheRemove",
  cacheClear: "EserAjanCacheClear",
  cacheClose: "EserAjanCacheClose",
  postsCreateService: "EserAjanPostsCreateService",
  postsCompose: "EserAjanPostsCompose",
  postsGetTimeline: "EserAjanPostsGetTimeline",
  postsSearch: "EserAjanPostsSearch",
  postsClose: "EserAjanPostsClose",
  codebaseWalkFilesStreamCreate: "EserAjanCodebaseWalkFilesStreamCreate",
  codebaseWalkFilesStreamRead: "EserAjanCodebaseWalkFilesStreamRead",
  codebaseWalkFilesStreamClose: "EserAjanCodebaseWalkFilesStreamClose",
  codebaseValidateFilesStreamCreate:
    "EserAjanCodebaseValidateFilesStreamCreate",
  codebaseValidateFilesStreamRead: "EserAjanCodebaseValidateFilesStreamRead",
  codebaseValidateFilesStreamClose: "EserAjanCodebaseValidateFilesStreamClose",
  parsingTokenizeStreamCreate: "EserAjanParsingTokenizeStreamCreate",
  parsingTokenizeStreamPush: "EserAjanParsingTokenizeStreamPush",
  parsingTokenizeStreamClose: "EserAjanParsingTokenizeStreamClose",
  shellTuiKeypressCreate: "EserAjanShellTuiKeypressCreate",
  shellTuiKeypressRead: "EserAjanShellTuiKeypressRead",
  shellTuiKeypressClose: "EserAjanShellTuiKeypressClose",
  shellExecSpawn: "EserAjanShellExecSpawn",
  shellExecRead: "EserAjanShellExecRead",
  shellExecWrite: "EserAjanShellExecWrite",
  shellExecClose: "EserAjanShellExecClose",
  shellPtySpawn: "EserAjanShellPtySpawn",
  shellPtyRead: "EserAjanShellPtyRead",
  shellPtyWrite: "EserAjanShellPtyWrite",
  shellPtyResize: "EserAjanShellPtyResize",
  shellPtyKill: "EserAjanShellPtyKill",
  shellPtyClose: "EserAjanShellPtyClose",
};

/**
 * The single wording for "this symbol needs state that command mode cannot
 * keep". Every handle-bound symbol reports the same thing, so callers can match
 * on it and users only ever learn one remedy.
 */
const handleBoundError = (symbol: string): Error =>
  new Error(
    `${symbol} is unavailable through the eser-ajan WASM command-mode ` +
      `fallback: the WASM module is re-instantiated for every symbol call, so ` +
      `its handle registries start empty each time and handles cannot be ` +
      `carried across calls. Install the native library (the @eserstack/ajan ` +
      `platform package for this OS and architecture) or set ` +
      `ESER_AJAN_LIB_PATH to an existing build.`,
  );

/**
 * Loads the command-mode WASM module and returns an FFILibrary-compatible handle.
 *
 * Each symbol call instantiates a fresh WASI shim with the request piped
 * through stdin, then reads the JSON response from captured stdout. Handle-based
 * symbols throw instead of dispatching -- see the module doc comment.
 *
 * @param wasmPath - Absolute path to the `eser-ajan.wasm` file.
 * @returns An FFILibrary-compatible object.
 */
export const loadCommandWasm = async (
  wasmPath: string,
): Promise<types.FFILibrary> => {
  const nodeFs = await import("node:fs");

  // Read the WASM binary once and compile it for reuse
  const wasmBytes = nodeFs.readFileSync(wasmPath);
  const wasmModule = await WebAssembly.compile(wasmBytes);

  /**
   * Invokes a function in the command-mode WASM module.
   *
   * Creates a fresh WASI shim per call with stdin pre-loaded from
   * the serialized request, then reads stdout for the response.
   */
  const invoke = (request: WasiRequest): WasiResponse => {
    const requestJson = JSON.stringify(request);
    const stdinBytes = new TextEncoder().encode(requestJson);

    const wasi = new wasiShim.WasiShim({ stdin: stdinBytes });

    const instance = new WebAssembly.Instance(wasmModule, {
      wasi_snapshot_preview1: wasi.wasiImport,
    });

    // Run the WASM module — _start reads stdin, processes, writes stdout
    wasi.start(instance);

    // Read the response from captured stdout
    const responseText = wasi.getStdout().trim();

    if (responseText.length === 0) {
      return { ok: false, error: "WASM module produced no output" };
    }

    return JSON.parse(responseText) as WasiResponse;
  };

  /**
   * Invokes a function and returns the result string.
   * Throws on error responses.
   *
   * Handle-bound functions are rejected here rather than at each call site so
   * that the check cannot be reached around, and so the 100 symbol keys below
   * stay literal for the ABI parity guard in
   * `@eserstack/codebase/ajan-ffi-parity.test.ts`.
   */
  const call = (fn: string, args?: Record<string, string>): string => {
    const handleBoundSymbol = HANDLE_BOUND_FUNCTIONS[fn];

    if (handleBoundSymbol !== undefined) {
      throw handleBoundError(handleBoundSymbol);
    }

    const request: WasiRequest = { fn };
    if (args !== undefined) {
      request.args = args;
    }

    const response = invoke(request);

    if (!response.ok) {
      throw new Error(
        `eser-ajan WASM call "${fn}" failed: ${
          response.error ?? "unknown error"
        }`,
      );
    }

    return response.result ?? "";
  };

  // Every symbol keeps its literal key and its literal dispatch name: the ABI
  // parity guard reads both out of this source text, so a generated map or a
  // shared stub table would empty its extraction. Entries listed in
  // HANDLE_BOUND_FUNCTIONS throw from `call` before anything is dispatched.
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
        // No-op in WASM mode — Go's GC handles memory.
      },
      EserAjanConfigLoad: (optionsJSON: string) =>
        call("configLoad", { optionsJSON }),
      EserAjanDIResolve: (name: string) => call("diResolve", { name }),
      EserAjanAiCreateModel: (configJSON: string) =>
        call("aiCreateModel", { configJSON }),
      EserAjanAiGenerateText: (modelHandle: string, optionsJSON: string) =>
        call("aiGenerateText", { modelHandle, optionsJSON }),
      EserAjanAiStreamText: (modelHandle: string, optionsJSON: string) =>
        call("aiStreamText", { modelHandle, optionsJSON }),
      EserAjanAiStreamRead: (streamHandle: string) =>
        call("aiStreamRead", { streamHandle }),
      EserAjanAiCancelRequest: (requestJSON: string) =>
        call("aiCancelRequest", { requestJSON }),
      EserAjanAiCloseModel: (modelHandle: string) =>
        call("aiCloseModel", { modelHandle }),
      EserAjanAiFreeStream: (streamHandle: string) =>
        call("aiFreeStream", { streamHandle }),
      EserAjanAiBatchCreate: (requestJSON: string) =>
        call("aiBatchCreate", { requestJSON }),
      EserAjanAiBatchGet: (requestJSON: string) =>
        call("aiBatchGet", { requestJSON }),
      EserAjanAiBatchList: (requestJSON: string) =>
        call("aiBatchList", { requestJSON }),
      EserAjanAiBatchDownload: (requestJSON: string) =>
        call("aiBatchDownload", { requestJSON }),
      EserAjanAiBatchCancel: (requestJSON: string) =>
        call("aiBatchCancel", { requestJSON }),
      EserAjanFormatEncode: (requestJSON: string) =>
        call("formatEncode", { requestJSON }),
      EserAjanFormatDecode: (requestJSON: string) =>
        call("formatDecode", { requestJSON }),
      EserAjanFormatList: () => call("formatList"),
      EserAjanFormatEncodeDocument: (requestJSON: string) =>
        call("formatEncodeDocument", { requestJSON }),
      EserAjanLogCreate: (configJSON: string) =>
        call("logCreate", { configJSON }),
      EserAjanLogWrite: (requestJSON: string) =>
        call("logWrite", { requestJSON }),
      EserAjanLogClose: (handle: string) => call("logClose", { handle }),
      EserAjanLogShouldLog: (requestJSON: string) =>
        call("logShouldLog", { requestJSON }),
      EserAjanLogConfigure: (requestJSON: string) =>
        call("logConfigure", { requestJSON }),
      EserAjanHttpCreate: (configJSON: string) =>
        call("httpCreate", { configJSON }),
      EserAjanHttpRequest: (requestJSON: string) =>
        call("httpRequest", { requestJSON }),
      EserAjanHttpClose: (handle: string) => call("httpClose", { handle }),
      EserAjanHttpRequestStream: (requestJSON: string) =>
        call("httpRequestStream", { requestJSON }),
      EserAjanHttpStreamRead: (handle: string) =>
        call("httpStreamRead", { handle }),
      EserAjanHttpStreamClose: (handle: string) =>
        call("httpStreamClose", { handle }),
      EserAjanNoskillsInit: (requestJSON: string) =>
        call("noskillsInit", { requestJSON }),
      EserAjanNoskillsSpecNew: (requestJSON: string) =>
        call("noskillsSpecNew", { requestJSON }),
      EserAjanNoskillsNext: (requestJSON: string) =>
        call("noskillsNext", { requestJSON }),
      EserAjanWorkflowRun: (requestJSON: string) =>
        call("workflowRun", { requestJSON }),
      EserAjanCryptoHash: (requestJSON: string) =>
        call("cryptoHash", { requestJSON }),
      EserAjanCacheCreate: (requestJSON: string) =>
        call("cacheCreate", { requestJSON }),
      EserAjanCacheGetDir: (requestJSON: string) =>
        call("cacheGetDir", { requestJSON }),
      EserAjanCacheGetVersionedPath: (requestJSON: string) =>
        call("cacheGetVersionedPath", { requestJSON }),
      EserAjanCacheList: (requestJSON: string) =>
        call("cacheList", { requestJSON }),
      EserAjanCacheRemove: (requestJSON: string) =>
        call("cacheRemove", { requestJSON }),
      EserAjanCacheClear: (requestJSON: string) =>
        call("cacheClear", { requestJSON }),
      EserAjanCacheClose: (requestJSON: string) =>
        call("cacheClose", { requestJSON }),
      EserAjanCsGenerate: (requestJSON: string) =>
        call("csGenerate", { requestJSON }),
      EserAjanCsSync: (requestJSON: string) => call("csSync", { requestJSON }),
      EserAjanKitListRecipes: (requestJSON: string) =>
        call("kitListRecipes", { requestJSON }),
      EserAjanKitApplyRecipe: (requestJSON: string) =>
        call("kitApplyRecipe", { requestJSON }),
      EserAjanKitCloneRecipe: (requestJSON: string) =>
        call("kitCloneRecipe", { requestJSON }),
      EserAjanKitNewProject: (requestJSON: string) =>
        call("kitNewProject", { requestJSON }),
      EserAjanKitUpdateRecipe: (requestJSON: string) =>
        call("kitUpdateRecipe", { requestJSON }),
      EserAjanPostsCreateService: (requestJSON: string) =>
        call("postsCreateService", { requestJSON }),
      EserAjanPostsCompose: (requestJSON: string) =>
        call("postsCompose", { requestJSON }),
      EserAjanPostsGetTimeline: (requestJSON: string) =>
        call("postsGetTimeline", { requestJSON }),
      EserAjanPostsSearch: (requestJSON: string) =>
        call("postsSearch", { requestJSON }),
      EserAjanPostsClose: (requestJSON: string) =>
        call("postsClose", { requestJSON }),
      EserAjanCodebaseGitCurrentBranch: (requestJSON: string) =>
        call("codebaseGitCurrentBranch", { requestJSON }),
      EserAjanCodebaseGitLatestTag: (requestJSON: string) =>
        call("codebaseGitLatestTag", { requestJSON }),
      EserAjanCodebaseGitLog: (requestJSON: string) =>
        call("codebaseGitLog", { requestJSON }),
      EserAjanCodebaseValidateCommitMsg: (requestJSON: string) =>
        call("codebaseValidateCommitMsg", { requestJSON }),
      EserAjanCodebaseGenerateChangelog: (requestJSON: string) =>
        call("codebaseGenerateChangelog", { requestJSON }),
      EserAjanCodebaseBumpVersion: (requestJSON: string) =>
        call("codebaseBumpVersion", { requestJSON }),
      EserAjanCodebaseWalkFiles: (requestJSON: string) =>
        call("codebaseWalkFiles", { requestJSON }),
      EserAjanCodebaseValidateFiles: (requestJSON: string) =>
        call("codebaseValidateFiles", { requestJSON }),
      EserAjanCodebaseCheckCircularDeps: (requestJSON: string) =>
        call("codebaseCheckCircularDeps", { requestJSON }),
      EserAjanCodebaseCheckExportNames: (requestJSON: string) =>
        call("codebaseCheckExportNames", { requestJSON }),
      EserAjanCodebaseCheckModExports: (requestJSON: string) =>
        call("codebaseCheckModExports", { requestJSON }),
      EserAjanCodebaseCheckPackageConfigs: (requestJSON: string) =>
        call("codebaseCheckPackageConfigs", { requestJSON }),
      EserAjanCodebaseCheckDocs: (requestJSON: string) =>
        call("codebaseCheckDocs", { requestJSON }),
      EserAjanCodebaseWalkFilesStreamCreate: (requestJSON: string) =>
        call("codebaseWalkFilesStreamCreate", { requestJSON }),
      EserAjanCodebaseWalkFilesStreamRead: (handle: string) =>
        call("codebaseWalkFilesStreamRead", { handle }),
      EserAjanCodebaseWalkFilesStreamClose: (handle: string) =>
        call("codebaseWalkFilesStreamClose", { handle }),
      EserAjanCodebaseValidateFilesStreamCreate: (requestJSON: string) =>
        call("codebaseValidateFilesStreamCreate", { requestJSON }),
      EserAjanCodebaseValidateFilesStreamRead: (handle: string) =>
        call("codebaseValidateFilesStreamRead", { handle }),
      EserAjanCodebaseValidateFilesStreamClose: (handle: string) =>
        call("codebaseValidateFilesStreamClose", { handle }),
      EserAjanCollectorSpecifierToIdentifier: (requestJSON: string) =>
        call("collectorSpecifierToIdentifier", { requestJSON }),
      EserAjanCollectorWalkFiles: (requestJSON: string) =>
        call("collectorWalkFiles", { requestJSON }),
      EserAjanCollectorGenerateManifest: (requestJSON: string) =>
        call("collectorGenerateManifest", { requestJSON }),
      EserAjanParsingTokenize: (requestJSON: string) =>
        call("parsingTokenize", { requestJSON }),
      EserAjanParsingSimpleTokens: () => call("parsingSimpleTokens"),
      EserAjanParsingTokenizeStreamCreate: (requestJSON: string) =>
        call("parsingTokenizeStreamCreate", { requestJSON }),
      EserAjanParsingTokenizeStreamPush: (requestJSON: string) =>
        call("parsingTokenizeStreamPush", { requestJSON }),
      EserAjanParsingTokenizeStreamClose: (requestJSON: string) =>
        call("parsingTokenizeStreamClose", { requestJSON }),
      EserAjanShellExec: (requestJSON: string) =>
        call("shellExec", { requestJSON }),
      EserAjanShellTuiKeypressCreate: (requestJSON: string) =>
        call("shellTuiKeypressCreate", { requestJSON }),
      EserAjanShellTuiKeypressRead: (handle: string) =>
        call("shellTuiKeypressRead", { handle }),
      EserAjanShellTuiKeypressClose: (handle: string) =>
        call("shellTuiKeypressClose", { handle }),
      EserAjanShellTuiSetStdinRaw: (requestJSON: string) =>
        call("shellTuiSetStdinRaw", { requestJSON }),
      EserAjanShellTuiGetSize: (requestJSON: string) =>
        call("shellTuiGetSize", { requestJSON }),
      EserAjanShellExecSpawn: (requestJSON: string) =>
        call("shellExecSpawn", { requestJSON }),
      EserAjanShellExecRead: (handle: string) =>
        call("shellExecRead", { handle }),
      EserAjanShellExecWrite: (requestJSON: string) =>
        call("shellExecWrite", { requestJSON }),
      EserAjanShellExecClose: (handle: string) =>
        call("shellExecClose", { handle }),
      EserAjanShellPtySpawn: (requestJSON: string) =>
        call("shellPtySpawn", { requestJSON }),
      // Deferred through `then` so the handle-bound rejection surfaces on the
      // returned promise: this symbol is declared async, and a synchronous
      // throw would break callers that only attach a `catch`.
      EserAjanShellPtyRead: (handle: string): Promise<string> =>
        Promise.resolve().then(() => call("shellPtyRead", { handle })),
      EserAjanShellPtyWrite: (requestJSON: string) =>
        call("shellPtyWrite", { requestJSON }),
      EserAjanShellPtyResize: (requestJSON: string) =>
        call("shellPtyResize", { requestJSON }),
      EserAjanShellPtyKill: (requestJSON: string) =>
        call("shellPtyKill", { requestJSON }),
      EserAjanShellPtyClose: (handle: string) =>
        call("shellPtyClose", { handle }),
    },
    close: () => {
      // No persistent resources to release in command mode.
    },
  };
};
