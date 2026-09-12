// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Deno FFI backend using `Deno.dlopen()`.
 *
 * @module
 */

import * as closeGuard from "./close-guard.ts";
import type * as types from "./types.ts";

/**
 * Symbol definitions for `Deno.dlopen`.
 *
 * Each key matches a C export from main.go. The Go side uses `*C.char` for
 * strings and `C.int` for integers, which map to Deno's `"pointer"` and
 * `"i32"` respectively.
 */
const SYMBOL_DEFINITIONS = {
  EserAjanVersion: {
    parameters: [],
    result: "pointer",
  },
  EserAjanInit: {
    parameters: [],
    result: "i32",
  },
  EserAjanShutdown: {
    parameters: [],
    result: "void",
  },
  EserAjanFree: {
    parameters: ["pointer"],
    result: "void",
  },
  EserAjanConfigLoad: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanDIResolve: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanAiCreateModel: {
    parameters: ["pointer"],
    result: "pointer",
  },
  // Nonblocking: a model round-trip takes seconds to minutes, and running it
  // on the isolate froze every timer, socket and other request for its whole
  // duration. It is also what makes cancellation work -- an AbortSignal cannot
  // fire while the isolate is blocked inside the call it would cancel.
  EserAjanAiGenerateText: {
    parameters: ["pointer", "pointer"],
    result: "pointer",
    nonblocking: true,
  },
  EserAjanAiStreamText: {
    parameters: ["pointer", "pointer"],
    result: "pointer",
    nonblocking: true,
  },
  EserAjanAiStreamRead: {
    parameters: ["pointer"],
    result: "pointer",
    nonblocking: true,
  },
  // Deliberately blocking: it only flips a flag under a mutex, and it must be
  // callable from an abort listener without waiting on the threadpool the call
  // it is cancelling is occupying.
  EserAjanAiCancelRequest: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanAiCloseModel: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanAiFreeStream: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanAiBatchCreate: {
    parameters: ["pointer"],
    result: "pointer",
    nonblocking: true,
  },
  EserAjanAiBatchGet: {
    parameters: ["pointer"],
    result: "pointer",
    nonblocking: true,
  },
  EserAjanAiBatchList: {
    parameters: ["pointer"],
    result: "pointer",
    nonblocking: true,
  },
  EserAjanAiBatchDownload: {
    parameters: ["pointer"],
    result: "pointer",
    nonblocking: true,
  },
  EserAjanAiBatchCancel: {
    parameters: ["pointer"],
    result: "pointer",
    nonblocking: true,
  },
  EserAjanFormatEncode: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanFormatDecode: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanFormatList: {
    parameters: [],
    result: "pointer",
  },
  EserAjanFormatEncodeDocument: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanLogCreate: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanLogWrite: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanLogClose: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanLogShouldLog: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanLogConfigure: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanHttpCreate: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanHttpRequest: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanHttpClose: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanHttpRequestStream: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanHttpStreamRead: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanHttpStreamClose: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanNoskillsInit: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanNoskillsSpecNew: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanNoskillsNext: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanWorkflowRun: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanCryptoHash: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanCacheCreate: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanCacheGetDir: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanCacheGetVersionedPath: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanCacheList: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanCacheRemove: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanCacheClear: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanCacheClose: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanCsGenerate: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanCsSync: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanKitListRecipes: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanKitApplyRecipe: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanKitCloneRecipe: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanKitNewProject: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanKitUpdateRecipe: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanPostsCreateService: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanPostsCompose: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanPostsGetTimeline: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanPostsSearch: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanPostsClose: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanCodebaseGitCurrentBranch: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanCodebaseGitLatestTag: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanCodebaseGitLog: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanCodebaseValidateCommitMsg: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanCodebaseGenerateChangelog: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanCodebaseBumpVersion: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanCodebaseWalkFiles: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanCodebaseValidateFiles: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanCodebaseCheckCircularDeps: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanCodebaseCheckExportNames: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanCodebaseCheckModExports: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanCodebaseCheckPackageConfigs: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanCodebaseCheckDocs: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanCodebaseWalkFilesStreamCreate: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanCodebaseWalkFilesStreamRead: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanCodebaseWalkFilesStreamClose: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanCodebaseValidateFilesStreamCreate: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanCodebaseValidateFilesStreamRead: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanCodebaseValidateFilesStreamClose: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanCollectorSpecifierToIdentifier: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanCollectorWalkFiles: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanCollectorGenerateManifest: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanParsingTokenize: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanParsingSimpleTokens: {
    parameters: [],
    result: "pointer",
  },
  EserAjanParsingTokenizeStreamCreate: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanParsingTokenizeStreamPush: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanParsingTokenizeStreamClose: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanShellExec: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanShellTuiKeypressCreate: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanShellTuiKeypressRead: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanShellTuiKeypressClose: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanShellTuiSetStdinRaw: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanShellTuiGetSize: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanShellExecSpawn: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanShellExecRead: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanShellExecWrite: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanShellExecClose: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanShellPtySpawn: {
    parameters: ["pointer"],
    result: "pointer",
  },
  // Nonblocking: a PTY read may wait indefinitely for output; running it on the
  // FFI threadpool keeps the isolate (and every other pane's pump) responsive.
  EserAjanShellPtyRead: {
    parameters: ["pointer"],
    result: "pointer",
    nonblocking: true,
  },
  EserAjanShellPtyWrite: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanShellPtyResize: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanShellPtyKill: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanShellPtyClose: {
    parameters: ["pointer"],
    result: "pointer",
  },
} as const;

/**
 * Encodes a JS string into a null-terminated C string buffer backed by an
 * `ArrayBuffer` (required by `Deno.UnsafePointer.of`).
 */
const toCString = (str: string): Uint8Array<ArrayBuffer> => {
  const encoder = new TextEncoder();
  const encoded = encoder.encode(str);
  const ab = new ArrayBuffer(encoded.length + 1);
  const buf = new Uint8Array(ab);
  buf.set(encoded);
  // Last byte is already 0 (null terminator)
  return buf;
};

/**
 * Creates a high-level symbol wrapper that automatically handles
 * string↔pointer conversions and frees returned C strings.
 */
const createSymbolWrappers = (
  // deno-lint-ignore no-explicit-any
  rawSymbols: any,
): types.FFILibrary["symbols"] => {
  /**
   * Reads the C string at `ptr` and releases the Go allocation behind it.
   *
   * The free sits in a `finally` because it must run even when decoding throws:
   * every pointer the bridge returns is a `C.CString`, i.e. malloc'd memory the
   * caller owns, and an exception on the decode path would otherwise strand it.
   */
  const readAndFree = (ptr: Deno.PointerValue): string => {
    if (ptr === null) {
      return "";
    }

    try {
      return new Deno.UnsafePointerView(ptr).getCString();
    } finally {
      rawSymbols.EserAjanFree(ptr);
    }
  };

  return {
    EserAjanVersion: (): string => {
      return readAndFree(rawSymbols.EserAjanVersion());
    },
    EserAjanInit: (): number => {
      return rawSymbols.EserAjanInit() as number;
    },
    EserAjanShutdown: (): void => {
      rawSymbols.EserAjanShutdown();
    },
    EserAjanFree: (ptr: unknown): void => {
      rawSymbols.EserAjanFree(ptr as Deno.PointerValue);
    },
    EserAjanConfigLoad: (path: string): string => {
      const cPath = toCString(path);
      const rawPtr = rawSymbols.EserAjanConfigLoad(
        Deno.UnsafePointer.of(cPath),
      );
      return readAndFree(rawPtr);
    },
    EserAjanDIResolve: (name: string): string => {
      const cName = toCString(name);
      const rawPtr = rawSymbols.EserAjanDIResolve(
        Deno.UnsafePointer.of(cName),
      );
      return readAndFree(rawPtr);
    },
    EserAjanAiCreateModel: (configJSON: string): string => {
      const cStr = toCString(configJSON);
      const rawPtr = rawSymbols.EserAjanAiCreateModel(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanAiGenerateText: async (
      modelHandle: string,
      optionsJSON: string,
    ): Promise<string> => {
      const cHandle = toCString(modelHandle);
      const cOpts = toCString(optionsJSON);
      // nonblocking symbol → returns a Promise<pointer>; both buffers must stay
      // referenced until it resolves or the GC could free memory Go is reading
      // (the closure frame does this).
      const rawPtr = await rawSymbols.EserAjanAiGenerateText(
        Deno.UnsafePointer.of(cHandle),
        Deno.UnsafePointer.of(cOpts),
      );
      return readAndFree(rawPtr);
    },
    EserAjanAiStreamText: async (
      modelHandle: string,
      optionsJSON: string,
    ): Promise<string> => {
      const cHandle = toCString(modelHandle);
      const cOpts = toCString(optionsJSON);
      // nonblocking → keep both buffers referenced until it resolves.
      const rawPtr = await rawSymbols.EserAjanAiStreamText(
        Deno.UnsafePointer.of(cHandle),
        Deno.UnsafePointer.of(cOpts),
      );
      return readAndFree(rawPtr);
    },
    EserAjanAiStreamRead: async (streamHandle: string): Promise<string> => {
      const cStr = toCString(streamHandle);
      // nonblocking → keep cStr referenced until it resolves. A stream read
      // waits on the provider, so blocking here stalled the isolate between
      // every pair of tokens.
      const rawPtr = await rawSymbols.EserAjanAiStreamRead(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanAiCancelRequest: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanAiCancelRequest(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanAiCloseModel: (modelHandle: string): string => {
      const cStr = toCString(modelHandle);
      const rawPtr = rawSymbols.EserAjanAiCloseModel(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanAiFreeStream: (streamHandle: string): string => {
      const cStr = toCString(streamHandle);
      const rawPtr = rawSymbols.EserAjanAiFreeStream(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanAiBatchCreate: async (requestJSON: string): Promise<string> => {
      const cStr = toCString(requestJSON);
      // nonblocking → keep cStr referenced until it resolves.
      const rawPtr = await rawSymbols.EserAjanAiBatchCreate(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanAiBatchGet: async (requestJSON: string): Promise<string> => {
      const cStr = toCString(requestJSON);
      // nonblocking → keep cStr referenced until it resolves.
      const rawPtr = await rawSymbols.EserAjanAiBatchGet(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanAiBatchList: async (requestJSON: string): Promise<string> => {
      const cStr = toCString(requestJSON);
      // nonblocking → keep cStr referenced until it resolves.
      const rawPtr = await rawSymbols.EserAjanAiBatchList(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanAiBatchDownload: async (requestJSON: string): Promise<string> => {
      const cStr = toCString(requestJSON);
      // nonblocking → keep cStr referenced until it resolves.
      const rawPtr = await rawSymbols.EserAjanAiBatchDownload(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanAiBatchCancel: async (requestJSON: string): Promise<string> => {
      const cStr = toCString(requestJSON);
      // nonblocking → keep cStr referenced until it resolves.
      const rawPtr = await rawSymbols.EserAjanAiBatchCancel(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanFormatEncode: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanFormatEncode(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanFormatDecode: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanFormatDecode(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanFormatList: (): string => {
      const rawPtr = rawSymbols.EserAjanFormatList();
      return readAndFree(rawPtr);
    },
    EserAjanFormatEncodeDocument: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanFormatEncodeDocument(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanLogCreate: (configJSON: string): string => {
      const cStr = toCString(configJSON);
      const rawPtr = rawSymbols.EserAjanLogCreate(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanLogWrite: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanLogWrite(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanLogClose: (handle: string): string => {
      const cStr = toCString(handle);
      const rawPtr = rawSymbols.EserAjanLogClose(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanLogShouldLog: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanLogShouldLog(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanLogConfigure: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanLogConfigure(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanHttpCreate: (configJSON: string): string => {
      const cStr = toCString(configJSON);
      const rawPtr = rawSymbols.EserAjanHttpCreate(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanHttpRequest: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanHttpRequest(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanHttpClose: (handle: string): string => {
      const cStr = toCString(handle);
      const rawPtr = rawSymbols.EserAjanHttpClose(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanHttpRequestStream: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanHttpRequestStream(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanHttpStreamRead: (handle: string): string => {
      const cStr = toCString(handle);
      const rawPtr = rawSymbols.EserAjanHttpStreamRead(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanHttpStreamClose: (handle: string): string => {
      const cStr = toCString(handle);
      const rawPtr = rawSymbols.EserAjanHttpStreamClose(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanNoskillsInit: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanNoskillsInit(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanNoskillsSpecNew: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanNoskillsSpecNew(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanNoskillsNext: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanNoskillsNext(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanWorkflowRun: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanWorkflowRun(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanCryptoHash: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanCryptoHash(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanCacheCreate: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanCacheCreate(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanCacheGetDir: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanCacheGetDir(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanCacheGetVersionedPath: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanCacheGetVersionedPath(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanCacheList: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanCacheList(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanCacheRemove: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanCacheRemove(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanCacheClear: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanCacheClear(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanCacheClose: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanCacheClose(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanCsGenerate: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanCsGenerate(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanCsSync: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanCsSync(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanKitListRecipes: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanKitListRecipes(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanKitApplyRecipe: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanKitApplyRecipe(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanKitCloneRecipe: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanKitCloneRecipe(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanKitNewProject: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanKitNewProject(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanKitUpdateRecipe: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanKitUpdateRecipe(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanPostsCreateService: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanPostsCreateService(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanPostsCompose: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanPostsCompose(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanPostsGetTimeline: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanPostsGetTimeline(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanPostsSearch: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanPostsSearch(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanPostsClose: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanPostsClose(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanCodebaseGitCurrentBranch: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanCodebaseGitCurrentBranch(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanCodebaseGitLatestTag: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanCodebaseGitLatestTag(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanCodebaseGitLog: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanCodebaseGitLog(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanCodebaseValidateCommitMsg: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanCodebaseValidateCommitMsg(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanCodebaseGenerateChangelog: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanCodebaseGenerateChangelog(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanCodebaseBumpVersion: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanCodebaseBumpVersion(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanCodebaseWalkFiles: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanCodebaseWalkFiles(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanCodebaseValidateFiles: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanCodebaseValidateFiles(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanCodebaseCheckCircularDeps: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanCodebaseCheckCircularDeps(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanCodebaseCheckExportNames: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanCodebaseCheckExportNames(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanCodebaseCheckModExports: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanCodebaseCheckModExports(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanCodebaseCheckPackageConfigs: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanCodebaseCheckPackageConfigs(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanCodebaseCheckDocs: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanCodebaseCheckDocs(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanCodebaseWalkFilesStreamCreate: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanCodebaseWalkFilesStreamCreate(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanCodebaseWalkFilesStreamRead: (handle: string): string => {
      const cStr = toCString(handle);
      const rawPtr = rawSymbols.EserAjanCodebaseWalkFilesStreamRead(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanCodebaseWalkFilesStreamClose: (handle: string): string => {
      const cStr = toCString(handle);
      const rawPtr = rawSymbols.EserAjanCodebaseWalkFilesStreamClose(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanCodebaseValidateFilesStreamCreate: (
      requestJSON: string,
    ): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanCodebaseValidateFilesStreamCreate(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanCodebaseValidateFilesStreamRead: (handle: string): string => {
      const cStr = toCString(handle);
      const rawPtr = rawSymbols.EserAjanCodebaseValidateFilesStreamRead(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanCodebaseValidateFilesStreamClose: (handle: string): string => {
      const cStr = toCString(handle);
      const rawPtr = rawSymbols.EserAjanCodebaseValidateFilesStreamClose(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanCollectorSpecifierToIdentifier: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanCollectorSpecifierToIdentifier(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanCollectorWalkFiles: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanCollectorWalkFiles(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanCollectorGenerateManifest: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanCollectorGenerateManifest(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanParsingTokenize: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanParsingTokenize(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanParsingSimpleTokens: (): string => {
      const rawPtr = rawSymbols.EserAjanParsingSimpleTokens();
      return readAndFree(rawPtr);
    },
    EserAjanParsingTokenizeStreamCreate: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanParsingTokenizeStreamCreate(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanParsingTokenizeStreamPush: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanParsingTokenizeStreamPush(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanParsingTokenizeStreamClose: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanParsingTokenizeStreamClose(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanShellExec: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanShellExec(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanShellTuiKeypressCreate: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanShellTuiKeypressCreate(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanShellTuiKeypressRead: (handle: string): string => {
      const cStr = toCString(handle);
      const rawPtr = rawSymbols.EserAjanShellTuiKeypressRead(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanShellTuiKeypressClose: (handle: string): string => {
      const cStr = toCString(handle);
      const rawPtr = rawSymbols.EserAjanShellTuiKeypressClose(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanShellTuiSetStdinRaw: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanShellTuiSetStdinRaw(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanShellTuiGetSize: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanShellTuiGetSize(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanShellExecSpawn: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanShellExecSpawn(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanShellExecRead: (handle: string): string => {
      const cStr = toCString(handle);
      const rawPtr = rawSymbols.EserAjanShellExecRead(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanShellExecWrite: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanShellExecWrite(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanShellExecClose: (handle: string): string => {
      const cStr = toCString(handle);
      const rawPtr = rawSymbols.EserAjanShellExecClose(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanShellPtySpawn: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanShellPtySpawn(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanShellPtyRead: async (handle: string): Promise<string> => {
      const cStr = toCString(handle);
      // nonblocking symbol → returns a Promise<pointer>; keep cStr referenced
      // until it resolves (the closure frame does this).
      const rawPtr = await rawSymbols.EserAjanShellPtyRead(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanShellPtyWrite: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanShellPtyWrite(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanShellPtyResize: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanShellPtyResize(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanShellPtyKill: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanShellPtyKill(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
    EserAjanShellPtyClose: (handle: string): string => {
      const cStr = toCString(handle);
      const rawPtr = rawSymbols.EserAjanShellPtyClose(
        Deno.UnsafePointer.of(cStr),
      );
      return readAndFree(rawPtr);
    },
  };
};

/**
 * Deno FFI backend. Uses `Deno.dlopen()` to load C-shared libraries.
 */
export const backend: types.FFIBackend = {
  name: "deno",

  available: (): boolean => {
    return typeof Deno !== "undefined" && typeof Deno.dlopen === "function";
  },

  open: (libraryPath: string): Promise<types.FFILibrary> => {
    const lib = Deno.dlopen(libraryPath, SYMBOL_DEFINITIONS);

    return Promise.resolve(
      closeGuard.withCloseGuard(
        "deno",
        createSymbolWrappers(lib.symbols),
        () => {
          lib.close();
        },
      ),
    );
  },
};
