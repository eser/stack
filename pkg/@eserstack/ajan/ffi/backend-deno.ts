// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Deno FFI backend using `Deno.dlopen()`.
 *
 * @module
 */

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
  EserAjanAiGenerateText: {
    parameters: ["pointer", "pointer"],
    result: "pointer",
  },
  EserAjanAiStreamText: {
    parameters: ["pointer", "pointer"],
    result: "pointer",
  },
  EserAjanAiStreamRead: {
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
  },
  EserAjanAiBatchGet: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanAiBatchList: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanAiBatchDownload: {
    parameters: ["pointer"],
    result: "pointer",
  },
  EserAjanAiBatchCancel: {
    parameters: ["pointer"],
    result: "pointer",
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
 * Reads a C string from a pointer. Returns the JS string and the raw pointer
 * so the caller can free it.
 */
const readCString = (
  ptr: Deno.PointerValue,
): { value: string; ptr: Deno.PointerValue } => {
  if (ptr === null) {
    return { value: "", ptr };
  }
  const value = new Deno.UnsafePointerView(ptr).getCString();
  return { value, ptr };
};

/**
 * Creates a high-level symbol wrapper that automatically handles
 * string↔pointer conversions and frees returned C strings.
 */
const createSymbolWrappers = (
  // deno-lint-ignore no-explicit-any
  rawSymbols: any,
): types.FFILibrary["symbols"] => {
  const freePtr = (ptr: Deno.PointerValue): void => {
    if (ptr !== null) {
      rawSymbols.EserAjanFree(ptr);
    }
  };

  return {
    EserAjanVersion: (): string => {
      const { value, ptr } = readCString(rawSymbols.EserAjanVersion());
      freePtr(ptr);
      return value;
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
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanDIResolve: (name: string): string => {
      const cName = toCString(name);
      const rawPtr = rawSymbols.EserAjanDIResolve(
        Deno.UnsafePointer.of(cName),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanAiCreateModel: (configJSON: string): string => {
      const cStr = toCString(configJSON);
      const rawPtr = rawSymbols.EserAjanAiCreateModel(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanAiGenerateText: (
      modelHandle: string,
      optionsJSON: string,
    ): string => {
      const cHandle = toCString(modelHandle);
      const cOpts = toCString(optionsJSON);
      const rawPtr = rawSymbols.EserAjanAiGenerateText(
        Deno.UnsafePointer.of(cHandle),
        Deno.UnsafePointer.of(cOpts),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanAiStreamText: (
      modelHandle: string,
      optionsJSON: string,
    ): string => {
      const cHandle = toCString(modelHandle);
      const cOpts = toCString(optionsJSON);
      const rawPtr = rawSymbols.EserAjanAiStreamText(
        Deno.UnsafePointer.of(cHandle),
        Deno.UnsafePointer.of(cOpts),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanAiStreamRead: (streamHandle: string): string => {
      const cStr = toCString(streamHandle);
      const rawPtr = rawSymbols.EserAjanAiStreamRead(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanAiCloseModel: (modelHandle: string): string => {
      const cStr = toCString(modelHandle);
      const rawPtr = rawSymbols.EserAjanAiCloseModel(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanAiFreeStream: (streamHandle: string): string => {
      const cStr = toCString(streamHandle);
      const rawPtr = rawSymbols.EserAjanAiFreeStream(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanAiBatchCreate: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanAiBatchCreate(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanAiBatchGet: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanAiBatchGet(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanAiBatchList: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanAiBatchList(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanAiBatchDownload: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanAiBatchDownload(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanAiBatchCancel: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanAiBatchCancel(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanFormatEncode: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanFormatEncode(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanFormatDecode: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanFormatDecode(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanFormatList: (): string => {
      const rawPtr = rawSymbols.EserAjanFormatList();
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanFormatEncodeDocument: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanFormatEncodeDocument(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanLogCreate: (configJSON: string): string => {
      const cStr = toCString(configJSON);
      const rawPtr = rawSymbols.EserAjanLogCreate(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanLogWrite: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanLogWrite(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanLogClose: (handle: string): string => {
      const cStr = toCString(handle);
      const rawPtr = rawSymbols.EserAjanLogClose(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanLogShouldLog: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanLogShouldLog(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanLogConfigure: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanLogConfigure(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanHttpCreate: (configJSON: string): string => {
      const cStr = toCString(configJSON);
      const rawPtr = rawSymbols.EserAjanHttpCreate(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanHttpRequest: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanHttpRequest(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanHttpClose: (handle: string): string => {
      const cStr = toCString(handle);
      const rawPtr = rawSymbols.EserAjanHttpClose(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanHttpRequestStream: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanHttpRequestStream(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanHttpStreamRead: (handle: string): string => {
      const cStr = toCString(handle);
      const rawPtr = rawSymbols.EserAjanHttpStreamRead(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanHttpStreamClose: (handle: string): string => {
      const cStr = toCString(handle);
      const rawPtr = rawSymbols.EserAjanHttpStreamClose(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanNoskillsInit: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanNoskillsInit(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanNoskillsSpecNew: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanNoskillsSpecNew(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanNoskillsNext: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanNoskillsNext(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanWorkflowRun: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanWorkflowRun(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanCryptoHash: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanCryptoHash(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanCacheCreate: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanCacheCreate(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanCacheGetDir: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanCacheGetDir(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanCacheGetVersionedPath: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanCacheGetVersionedPath(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanCacheList: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanCacheList(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanCacheRemove: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanCacheRemove(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanCacheClear: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanCacheClear(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanCacheClose: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanCacheClose(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanCsGenerate: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanCsGenerate(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanCsSync: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanCsSync(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanKitListRecipes: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanKitListRecipes(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanKitApplyRecipe: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanKitApplyRecipe(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanKitCloneRecipe: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanKitCloneRecipe(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanKitNewProject: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanKitNewProject(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanKitUpdateRecipe: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanKitUpdateRecipe(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanPostsCreateService: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanPostsCreateService(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanPostsCompose: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanPostsCompose(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanPostsGetTimeline: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanPostsGetTimeline(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanPostsSearch: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanPostsSearch(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanPostsClose: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanPostsClose(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanCodebaseGitCurrentBranch: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanCodebaseGitCurrentBranch(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanCodebaseGitLatestTag: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanCodebaseGitLatestTag(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanCodebaseGitLog: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanCodebaseGitLog(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanCodebaseValidateCommitMsg: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanCodebaseValidateCommitMsg(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanCodebaseGenerateChangelog: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanCodebaseGenerateChangelog(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanCodebaseBumpVersion: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanCodebaseBumpVersion(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanCodebaseWalkFiles: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanCodebaseWalkFiles(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanCodebaseValidateFiles: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanCodebaseValidateFiles(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanCodebaseCheckCircularDeps: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanCodebaseCheckCircularDeps(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanCodebaseCheckExportNames: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanCodebaseCheckExportNames(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanCodebaseCheckModExports: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanCodebaseCheckModExports(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanCodebaseCheckPackageConfigs: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanCodebaseCheckPackageConfigs(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanCodebaseCheckDocs: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanCodebaseCheckDocs(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanCodebaseWalkFilesStreamCreate: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanCodebaseWalkFilesStreamCreate(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanCodebaseWalkFilesStreamRead: (handle: string): string => {
      const cStr = toCString(handle);
      const rawPtr = rawSymbols.EserAjanCodebaseWalkFilesStreamRead(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanCodebaseWalkFilesStreamClose: (handle: string): string => {
      const cStr = toCString(handle);
      const rawPtr = rawSymbols.EserAjanCodebaseWalkFilesStreamClose(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanCodebaseValidateFilesStreamCreate: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanCodebaseValidateFilesStreamCreate(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanCodebaseValidateFilesStreamRead: (handle: string): string => {
      const cStr = toCString(handle);
      const rawPtr = rawSymbols.EserAjanCodebaseValidateFilesStreamRead(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanCodebaseValidateFilesStreamClose: (handle: string): string => {
      const cStr = toCString(handle);
      const rawPtr = rawSymbols.EserAjanCodebaseValidateFilesStreamClose(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanCollectorSpecifierToIdentifier: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanCollectorSpecifierToIdentifier(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanCollectorWalkFiles: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanCollectorWalkFiles(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanCollectorGenerateManifest: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanCollectorGenerateManifest(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanParsingTokenize: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanParsingTokenize(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanParsingSimpleTokens: (): string => {
      const rawPtr = rawSymbols.EserAjanParsingSimpleTokens();
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanParsingTokenizeStreamCreate: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanParsingTokenizeStreamCreate(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanParsingTokenizeStreamPush: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanParsingTokenizeStreamPush(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanParsingTokenizeStreamClose: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanParsingTokenizeStreamClose(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanShellExec: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanShellExec(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanShellTuiKeypressCreate: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanShellTuiKeypressCreate(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanShellTuiKeypressRead: (handle: string): string => {
      const cStr = toCString(handle);
      const rawPtr = rawSymbols.EserAjanShellTuiKeypressRead(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanShellTuiKeypressClose: (handle: string): string => {
      const cStr = toCString(handle);
      const rawPtr = rawSymbols.EserAjanShellTuiKeypressClose(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanShellTuiSetStdinRaw: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanShellTuiSetStdinRaw(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanShellTuiGetSize: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanShellTuiGetSize(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanShellExecSpawn: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanShellExecSpawn(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanShellExecRead: (handle: string): string => {
      const cStr = toCString(handle);
      const rawPtr = rawSymbols.EserAjanShellExecRead(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanShellExecWrite: (requestJSON: string): string => {
      const cStr = toCString(requestJSON);
      const rawPtr = rawSymbols.EserAjanShellExecWrite(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
    },
    EserAjanShellExecClose: (handle: string): string => {
      const cStr = toCString(handle);
      const rawPtr = rawSymbols.EserAjanShellExecClose(
        Deno.UnsafePointer.of(cStr),
      );
      const { value, ptr } = readCString(rawPtr);
      freePtr(ptr);
      return value;
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

    return Promise.resolve({
      symbols: createSymbolWrappers(lib.symbols),
      close: (): void => {
        lib.close();
      },
    });
  },
};
