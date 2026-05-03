// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Reactor-mode WASM loader for the eser-ajan module.
 *
 * Loads the `eser-ajan-reactor.wasm` module which exports functions directly
 * via `//go:wasmexport`. The loader keeps the WASM instance alive and calls
 * exported functions directly — faster than command mode.
 *
 * String return protocol:
 *   1. Call the exported function → returns byte length (i32)
 *   2. Call `eser_ajan_result_ptr()` → returns pointer to result buffer
 *   3. Read `length` bytes from WASM memory at that pointer → decode as UTF-8
 *
 * Works on Node.js, Bun, Deno, and browsers via the built-in WASI shim.
 *
 * @module
 */

import type * as types from "../ffi/types.ts";
import * as wasiShim from "./wasi-shim.ts";

/**
 * Shape of the WASM instance exports for the reactor-mode module.
 */
interface ReactorExports {
  memory: WebAssembly.Memory;
  _start?: () => void;
  _initialize?: () => void;
  eser_ajan_result_ptr: () => number;
  eser_ajan_version: () => number;
  eser_ajan_init: () => number;
  eser_ajan_shutdown: () => void;
  eser_ajan_config_load: () => number;
  eser_ajan_di_resolve: () => number;
}

/**
 * Loads the reactor-mode WASM module and returns an FFILibrary-compatible handle.
 *
 * The WASM instance is kept alive and exported functions are called directly.
 * This is faster than command mode but more complex due to the shared buffer
 * protocol for string returns.
 *
 * @param wasmPath - Absolute path to the `eser-ajan-reactor.wasm` file.
 * @returns An FFILibrary-compatible object.
 */
export const loadReactorWasm = async (
  wasmPath: string,
): Promise<types.FFILibrary> => {
  const nodeFs = await import("node:fs");

  // Read and compile the WASM binary
  const wasmBytes = nodeFs.readFileSync(wasmPath);
  const wasmModule = await WebAssembly.compile(wasmBytes);

  // Create a persistent WASI shim for the reactor lifetime
  const wasi = new wasiShim.WasiShim();

  const instance = new WebAssembly.Instance(wasmModule, {
    wasi_snapshot_preview1: wasi.wasiImport,
  });

  const exports = instance.exports as unknown as ReactorExports;

  // Initialize the WASI reactor
  wasi.initialize(instance);

  /**
   * Reads a string result from WASM memory using the shared buffer protocol.
   *
   * @param byteLength - Number of bytes returned by the exported function.
   * @returns The decoded UTF-8 string.
   */
  const readResult = (byteLength: number): string => {
    if (byteLength <= 0) {
      return "";
    }

    const ptr = exports.eser_ajan_result_ptr();
    if (ptr === 0) {
      return "";
    }

    const memoryBuffer = new Uint8Array(exports.memory.buffer, ptr, byteLength);
    // Copy the bytes — the buffer may be overwritten on the next call
    const copy = new Uint8Array(byteLength);
    copy.set(memoryBuffer);

    return new TextDecoder().decode(copy);
  };

  return {
    symbols: {
      EserAjanVersion: () => {
        const len = exports.eser_ajan_version();
        return readResult(len);
      },
      EserAjanInit: () => {
        return exports.eser_ajan_init();
      },
      EserAjanShutdown: () => {
        exports.eser_ajan_shutdown();
      },
      EserAjanFree: (_ptr: unknown) => {
        // No-op in WASM mode — Go's GC handles memory.
      },
      EserAjanConfigLoad: (_optionsJSON: string) => {
        // Reactor mode doesn't support string args for config_load yet.
        // A future shared-memory protocol will enable passing args.
        const len = exports.eser_ajan_config_load();
        return readResult(len);
      },
      EserAjanDIResolve: (_name: string) => {
        // Same limitation as config_load — string args not yet supported.
        const len = exports.eser_ajan_di_resolve();
        return readResult(len);
      },
      // Format, log, and AI methods require string args which reactor mode doesn't yet support.
      EserAjanFormatEncode: (_requestJSON: string) =>
        '{"error":"Format calls require native FFI or command-mode WASM"}',
      EserAjanFormatDecode: (_requestJSON: string) =>
        '{"error":"Format calls require native FFI or command-mode WASM"}',
      EserAjanFormatList: () =>
        '{"error":"Format calls require native FFI or command-mode WASM"}',
      EserAjanFormatEncodeDocument: (_requestJSON: string) =>
        '{"error":"Format calls require native FFI or command-mode WASM"}',
      // Log and AI methods require string args which reactor mode doesn't yet support.
      // Return error JSON so callers can propagate a clean error.
      EserAjanLogCreate: (_configJSON: string) =>
        '{"error":"Log calls require native FFI or command-mode WASM"}',
      EserAjanLogWrite: (_requestJSON: string) =>
        '{"error":"Log calls require native FFI or command-mode WASM"}',
      EserAjanLogClose: (_handle: string) => "",
      EserAjanLogShouldLog: (_requestJSON: string) =>
        '{"error":"Log calls require native FFI or command-mode WASM"}',
      EserAjanLogConfigure: (_requestJSON: string) =>
        '{"error":"Log calls require native FFI or command-mode WASM"}',
      EserAjanAiCreateModel: (_configJSON: string) =>
        '{"error":"AI calls require native FFI or command-mode WASM"}',
      EserAjanAiGenerateText: (_modelHandle: string, _optionsJSON: string) =>
        '{"error":"AI calls require native FFI or command-mode WASM"}',
      EserAjanAiStreamText: (_modelHandle: string, _optionsJSON: string) =>
        '{"error":"AI calls require native FFI or command-mode WASM"}',
      EserAjanAiStreamRead: (_streamHandle: string) =>
        '{"error":"AI calls require native FFI or command-mode WASM"}',
      EserAjanAiCloseModel: (_modelHandle: string) => "",
      EserAjanAiFreeStream: (_streamHandle: string) => "",
      // Batch methods require stateful server-side resources which reactor mode doesn't support.
      EserAjanAiBatchCreate: (_requestJSON: string) =>
        '{"error":"AI batch calls require native FFI or command-mode WASM"}',
      EserAjanAiBatchGet: (_requestJSON: string) =>
        '{"error":"AI batch calls require native FFI or command-mode WASM"}',
      EserAjanAiBatchList: (_requestJSON: string) =>
        '{"error":"AI batch calls require native FFI or command-mode WASM"}',
      EserAjanAiBatchDownload: (_requestJSON: string) =>
        '{"error":"AI batch calls require native FFI or command-mode WASM"}',
      EserAjanAiBatchCancel: (_requestJSON: string) =>
        '{"error":"AI batch calls require native FFI or command-mode WASM"}',
      // HTTP methods require string args which reactor mode doesn't yet support.
      EserAjanHttpCreate: (_configJSON: string) =>
        '{"error":"HTTP calls require native FFI or command-mode WASM"}',
      EserAjanHttpRequest: (_requestJSON: string) =>
        '{"error":"HTTP calls require native FFI or command-mode WASM"}',
      EserAjanHttpClose: (_handle: string) => "",
      // HTTP streaming requires stateful handles which reactor mode doesn't support.
      EserAjanHttpRequestStream: (_requestJSON: string) =>
        '{"error":"HTTP stream calls require native FFI or command-mode WASM"}',
      EserAjanHttpStreamRead: (_handle: string) =>
        '{"error":"HTTP stream calls require native FFI or command-mode WASM"}',
      EserAjanHttpStreamClose: (_handle: string) => "",
      // Noskills methods require string args which reactor mode doesn't yet support.
      EserAjanNoskillsInit: (_requestJSON: string) =>
        '{"error":"Noskills calls require native FFI or command-mode WASM"}',
      EserAjanNoskillsSpecNew: (_requestJSON: string) =>
        '{"error":"Noskills calls require native FFI or command-mode WASM"}',
      EserAjanNoskillsNext: (_requestJSON: string) =>
        '{"error":"Noskills calls require native FFI or command-mode WASM"}',
      // Workflow methods require string args which reactor mode doesn't yet support.
      EserAjanWorkflowRun: (_requestJSON: string) =>
        '{"error":"Workflow calls require native FFI or command-mode WASM"}',
      // Crypto and cache methods require string args which reactor mode doesn't yet support.
      EserAjanCryptoHash: (_requestJSON: string) =>
        '{"error":"Crypto calls require native FFI or command-mode WASM"}',
      EserAjanCacheCreate: (_requestJSON: string) =>
        '{"error":"Cache calls require native FFI or command-mode WASM"}',
      EserAjanCacheGetDir: (_requestJSON: string) =>
        '{"error":"Cache calls require native FFI or command-mode WASM"}',
      EserAjanCacheGetVersionedPath: (_requestJSON: string) =>
        '{"error":"Cache calls require native FFI or command-mode WASM"}',
      EserAjanCacheList: (_requestJSON: string) =>
        '{"error":"Cache calls require native FFI or command-mode WASM"}',
      EserAjanCacheRemove: (_requestJSON: string) =>
        '{"error":"Cache calls require native FFI or command-mode WASM"}',
      EserAjanCacheClear: (_requestJSON: string) =>
        '{"error":"Cache calls require native FFI or command-mode WASM"}',
      EserAjanCacheClose: (_requestJSON: string) => "",
      // CS methods require string args which reactor mode doesn't yet support.
      EserAjanCsGenerate: (_requestJSON: string) =>
        '{"error":"CS calls require native FFI or command-mode WASM"}',
      EserAjanCsSync: (_requestJSON: string) =>
        '{"error":"CS calls require native FFI or command-mode WASM"}',
      // Kit methods require string args which reactor mode doesn't yet support.
      EserAjanKitListRecipes: (_requestJSON: string) =>
        '{"error":"Kit calls require native FFI or command-mode WASM"}',
      EserAjanKitApplyRecipe: (_requestJSON: string) =>
        '{"error":"Kit calls require native FFI or command-mode WASM"}',
      EserAjanKitCloneRecipe: (_requestJSON: string) =>
        '{"error":"Kit calls require native FFI or command-mode WASM"}',
      EserAjanKitNewProject: (_requestJSON: string) =>
        '{"error":"Kit calls require native FFI or command-mode WASM"}',
      EserAjanKitUpdateRecipe: (_requestJSON: string) =>
        '{"error":"Kit calls require native FFI or command-mode WASM"}',
      // Posts methods require string args which reactor mode doesn't yet support.
      EserAjanPostsCreateService: (_requestJSON: string) =>
        '{"error":"Posts calls require native FFI or command-mode WASM"}',
      EserAjanPostsCompose: (_requestJSON: string) =>
        '{"error":"Posts calls require native FFI or command-mode WASM"}',
      EserAjanPostsGetTimeline: (_requestJSON: string) =>
        '{"error":"Posts calls require native FFI or command-mode WASM"}',
      EserAjanPostsSearch: (_requestJSON: string) =>
        '{"error":"Posts calls require native FFI or command-mode WASM"}',
      EserAjanPostsClose: (_requestJSON: string) =>
        '{"error":"Posts calls require native FFI or command-mode WASM"}',
      // Codebase methods require string args which reactor mode doesn't yet support.
      EserAjanCodebaseGitCurrentBranch: (_requestJSON: string) =>
        '{"error":"Codebase calls require native FFI or command-mode WASM"}',
      EserAjanCodebaseGitLatestTag: (_requestJSON: string) =>
        '{"error":"Codebase calls require native FFI or command-mode WASM"}',
      EserAjanCodebaseGitLog: (_requestJSON: string) =>
        '{"error":"Codebase calls require native FFI or command-mode WASM"}',
      EserAjanCodebaseValidateCommitMsg: (_requestJSON: string) =>
        '{"error":"Codebase calls require native FFI or command-mode WASM"}',
      EserAjanCodebaseGenerateChangelog: (_requestJSON: string) =>
        '{"error":"Codebase calls require native FFI or command-mode WASM"}',
      EserAjanCodebaseBumpVersion: (_requestJSON: string) =>
        '{"error":"Codebase calls require native FFI or command-mode WASM"}',
      EserAjanCodebaseWalkFiles: (_requestJSON: string) =>
        '{"error":"Codebase calls require native FFI or command-mode WASM"}',
      EserAjanCodebaseValidateFiles: (_requestJSON: string) =>
        '{"error":"Codebase calls require native FFI or command-mode WASM"}',
      EserAjanCodebaseCheckCircularDeps: (_requestJSON: string) =>
        '{"error":"Codebase calls require native FFI or command-mode WASM"}',
      EserAjanCodebaseCheckExportNames: (_requestJSON: string) =>
        '{"error":"Codebase calls require native FFI or command-mode WASM"}',
      EserAjanCodebaseCheckModExports: (_requestJSON: string) =>
        '{"error":"Codebase calls require native FFI or command-mode WASM"}',
      EserAjanCodebaseCheckPackageConfigs: (_requestJSON: string) =>
        '{"error":"Codebase calls require native FFI or command-mode WASM"}',
      EserAjanCodebaseCheckDocs: (_requestJSON: string) =>
        '{"error":"Codebase calls require native FFI or command-mode WASM"}',
      EserAjanCodebaseWalkFilesStreamCreate: (_requestJSON: string) =>
        '{"error":"Codebase streaming requires native FFI or command-mode WASM"}',
      EserAjanCodebaseWalkFilesStreamRead: (_handle: string) => "null",
      EserAjanCodebaseWalkFilesStreamClose: (_handle: string) => "{}",
      EserAjanCodebaseValidateFilesStreamCreate: (_requestJSON: string) =>
        '{"error":"Codebase streaming requires native FFI or command-mode WASM"}',
      EserAjanCodebaseValidateFilesStreamRead: (_handle: string) => "null",
      EserAjanCodebaseValidateFilesStreamClose: (_handle: string) => "{}",
      // Collector methods require string args which reactor mode doesn't yet support.
      EserAjanCollectorSpecifierToIdentifier: (_requestJSON: string) =>
        '{"error":"Collector calls require native FFI or command-mode WASM"}',
      EserAjanCollectorWalkFiles: (_requestJSON: string) =>
        '{"error":"Collector calls require native FFI or command-mode WASM"}',
      EserAjanCollectorGenerateManifest: (_requestJSON: string) =>
        '{"error":"Collector calls require native FFI or command-mode WASM"}',
      // Parsing methods require string args which reactor mode doesn't yet support.
      EserAjanParsingTokenize: (_requestJSON: string) =>
        '{"error":"Parsing calls require native FFI or command-mode WASM"}',
      EserAjanParsingSimpleTokens: () =>
        '{"error":"Parsing calls require native FFI or command-mode WASM"}',
      EserAjanParsingTokenizeStreamCreate: (_requestJSON: string) =>
        '{"error":"Parsing calls require native FFI or command-mode WASM"}',
      EserAjanParsingTokenizeStreamPush: (_requestJSON: string) =>
        '{"error":"Parsing calls require native FFI or command-mode WASM"}',
      EserAjanParsingTokenizeStreamClose: (_requestJSON: string) =>
        '{"error":"Parsing calls require native FFI or command-mode WASM"}',
      // Shell exec requires string args which reactor mode doesn't yet support.
      EserAjanShellExec: (_requestJSON: string) =>
        '{"error":"Shell exec calls require native FFI or command-mode WASM"}',
      // Shell TUI requires stdin/terminal which reactor mode doesn't support.
      EserAjanShellTuiKeypressCreate: (_requestJSON: string) =>
        '{"error":"Shell TUI calls require native FFI or command-mode WASM"}',
      EserAjanShellTuiKeypressRead: (_handle: string) =>
        '{"error":"Shell TUI calls require native FFI or command-mode WASM"}',
      EserAjanShellTuiKeypressClose: (_handle: string) =>
        '{"error":"Shell TUI calls require native FFI or command-mode WASM"}',
      EserAjanShellTuiSetStdinRaw: (_requestJSON: string) =>
        '{"error":"Shell TUI calls require native FFI or command-mode WASM"}',
      EserAjanShellTuiGetSize: (_requestJSON: string) =>
        '{"error":"Shell TUI calls require native FFI or command-mode WASM"}',
      // Shell exec spawn requires stdin/stdout I/O which reactor mode doesn't support.
      EserAjanShellExecSpawn: (_requestJSON: string) =>
        '{"error":"Shell exec spawn requires native FFI or command-mode WASM"}',
      EserAjanShellExecRead: (_handle: string) =>
        '{"error":"Shell exec spawn requires native FFI or command-mode WASM"}',
      EserAjanShellExecWrite: (_requestJSON: string) =>
        '{"error":"Shell exec spawn requires native FFI or command-mode WASM"}',
      EserAjanShellExecClose: (_handle: string) =>
        '{"error":"Shell exec spawn requires native FFI or command-mode WASM"}',
    },
    close: () => {
      // The WASM instance will be garbage collected.
      // No explicit cleanup needed.
    },
  };
};
