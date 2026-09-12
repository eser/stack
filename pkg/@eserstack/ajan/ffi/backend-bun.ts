// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Bun FFI backend using `bun:ffi`.
 *
 * This module is only functional when running under Bun 1.3+.
 * Under other runtimes, `available()` returns false and `open()` will throw.
 *
 * @module
 */

import * as closeGuard from "./close-guard.ts";
import type * as types from "./types.ts";

/**
 * Bun FFI backend. Uses `dlopen` from `bun:ffi` to load C-shared libraries.
 *
 * Bun's `dlopen` takes a path and a symbol map where each symbol describes
 * its `args` (parameter types) and `returns` (return type). Pointer results
 * are read via `CString` from `bun:ffi`.
 */
export const backend: types.FFIBackend = {
  name: "bun",

  available: (): boolean => {
    // deno-lint-ignore no-explicit-any
    return typeof (globalThis as any).Bun !== "undefined";
  },

  open: async (libraryPath: string): Promise<types.FFILibrary> => {
    const bunFFI = await import("bun:ffi");
    const { dlopen, CString } = bunFFI;

    const lib = dlopen(libraryPath, {
      EserAjanVersion: {
        args: [],
        returns: "ptr",
      },
      EserAjanInit: {
        args: [],
        returns: "i32",
      },
      EserAjanShutdown: {
        args: [],
        returns: "void",
      },
      EserAjanFree: {
        args: ["ptr"],
        returns: "void",
      },
      EserAjanConfigLoad: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanDIResolve: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanAiCreateModel: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanAiGenerateText: {
        args: ["ptr", "ptr"],
        returns: "ptr",
      },
      EserAjanAiStreamText: {
        args: ["ptr", "ptr"],
        returns: "ptr",
      },
      EserAjanAiStreamRead: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanAiCancelRequest: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanAiCloseModel: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanAiFreeStream: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanAiBatchCreate: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanAiBatchGet: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanAiBatchList: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanAiBatchDownload: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanAiBatchCancel: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanFormatEncode: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanFormatDecode: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanFormatList: {
        args: [],
        returns: "ptr",
      },
      EserAjanFormatEncodeDocument: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanLogCreate: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanLogWrite: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanLogClose: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanLogShouldLog: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanLogConfigure: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanHttpCreate: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanHttpRequest: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanHttpClose: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanHttpRequestStream: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanHttpStreamRead: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanHttpStreamClose: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanNoskillsInit: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanNoskillsSpecNew: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanNoskillsNext: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanWorkflowRun: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanCryptoHash: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanCacheCreate: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanCacheGetDir: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanCacheGetVersionedPath: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanCacheList: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanCacheRemove: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanCacheClear: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanCacheClose: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanCsGenerate: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanCsSync: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanKitListRecipes: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanKitApplyRecipe: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanKitCloneRecipe: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanKitNewProject: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanKitUpdateRecipe: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanPostsCreateService: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanPostsCompose: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanPostsGetTimeline: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanPostsSearch: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanPostsClose: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanCodebaseGitCurrentBranch: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanCodebaseGitLatestTag: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanCodebaseGitLog: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanCodebaseValidateCommitMsg: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanCodebaseGenerateChangelog: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanCodebaseBumpVersion: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanCodebaseWalkFiles: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanCodebaseValidateFiles: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanCodebaseCheckCircularDeps: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanCodebaseCheckExportNames: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanCodebaseCheckModExports: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanCodebaseCheckPackageConfigs: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanCodebaseCheckDocs: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanCodebaseWalkFilesStreamCreate: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanCodebaseWalkFilesStreamRead: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanCodebaseWalkFilesStreamClose: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanCodebaseValidateFilesStreamCreate: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanCodebaseValidateFilesStreamRead: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanCodebaseValidateFilesStreamClose: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanCollectorSpecifierToIdentifier: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanCollectorWalkFiles: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanCollectorGenerateManifest: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanParsingTokenize: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanParsingSimpleTokens: {
        args: [],
        returns: "ptr",
      },
      EserAjanParsingTokenizeStreamCreate: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanParsingTokenizeStreamPush: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanParsingTokenizeStreamClose: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanShellExec: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanShellTuiKeypressCreate: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanShellTuiKeypressRead: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanShellTuiKeypressClose: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanShellTuiSetStdinRaw: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanShellTuiGetSize: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanShellExecSpawn: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanShellExecRead: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanShellExecWrite: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanShellExecClose: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanShellPtySpawn: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanShellPtyRead: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanShellPtyWrite: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanShellPtyResize: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanShellPtyKill: {
        args: ["ptr"],
        returns: "ptr",
      },
      EserAjanShellPtyClose: {
        args: ["ptr"],
        returns: "ptr",
      },
    });

    const { symbols } = lib;

    /**
     * Encodes a JS string to a null-terminated buffer for a `ptr` parameter.
     *
     * The buffer is handed to the call as a TypedArray rather than through
     * `ptr()`. `ptr()` returns a bare integer address that keeps nothing alive,
     * so on a two-argument call encoding the second buffer could trigger a GC
     * that collects the first while Go is still about to read it. bun:ffi
     * accepts a TypedArray for a `ptr` parameter and keeps it alive across the
     * call, which removes the hazard instead of racing it.
     */
    const toCString = (str: string): Uint8Array => {
      const encoder = new TextEncoder();
      return encoder.encode(str + "\0");
    };

    /**
     * Reads a C string from a pointer and releases the Go allocation behind it.
     *
     * The free sits in a `finally` because it must run even when `CString`
     * throws: the pointer is malloc'd memory the caller owns, and an exception
     * on the decode path would otherwise strand it. `CString` copies the bytes
     * at construction, so the order of decode and free is not load-bearing.
     */
    const readAndFree = (rawPtr: unknown): string => {
      if (rawPtr === null || rawPtr === 0) {
        return "";
      }

      try {
        return new CString(rawPtr).toString();
      } finally {
        symbols.EserAjanFree(rawPtr);
      }
    };

    return closeGuard.withCloseGuard(
      "bun",
      {
        EserAjanVersion: (): string => {
          return readAndFree(symbols.EserAjanVersion());
        },
        EserAjanInit: (): number => {
          return symbols.EserAjanInit() as number;
        },
        EserAjanShutdown: (): void => {
          symbols.EserAjanShutdown();
        },
        EserAjanFree: (ptr: unknown): void => {
          symbols.EserAjanFree(ptr);
        },
        EserAjanConfigLoad: (path: string): string => {
          return readAndFree(symbols.EserAjanConfigLoad(toCString(path)));
        },
        EserAjanDIResolve: (name: string): string => {
          return readAndFree(symbols.EserAjanDIResolve(toCString(name)));
        },
        EserAjanAiCreateModel: (configJSON: string): string => {
          return readAndFree(
            symbols.EserAjanAiCreateModel(toCString(configJSON)),
          );
        },
        // LIMITATION: bun:ffi has no per-call async mode, so this -- like the
        // stream and batch calls below -- is a BLOCKING FFI call. A generation
        // runs for seconds to minutes and parks the entire event loop for its
        // duration: timers, sockets and every other request stall, and the
        // abort listener that would call EserAjanAiCancelRequest cannot run, so
        // the call is uncancellable once entered even though types.ts documents
        // it as cancellable. Only Deno (nonblocking:true) runs these off-thread.
        // Making them genuinely asynchronous under Bun is tracked separately.
        EserAjanAiGenerateText: (
          modelHandle: string,
          optionsJSON: string,
        ): string => {
          return readAndFree(
            symbols.EserAjanAiGenerateText(
              toCString(modelHandle),
              toCString(optionsJSON),
            ),
          );
        },
        // LIMITATION: blocking and uncancellable mid-call, see
        // EserAjanAiGenerateText above.
        EserAjanAiStreamText: (
          modelHandle: string,
          optionsJSON: string,
        ): string => {
          return readAndFree(
            symbols.EserAjanAiStreamText(
              toCString(modelHandle),
              toCString(optionsJSON),
            ),
          );
        },
        // LIMITATION: blocking, see EserAjanAiGenerateText above -- each read
        // parks the event loop until the provider emits the next event. The
        // loop only gets to run between reads.
        EserAjanAiStreamRead: (streamHandle: string): string => {
          return readAndFree(
            symbols.EserAjanAiStreamRead(toCString(streamHandle)),
          );
        },
        EserAjanAiCancelRequest: (requestJSON: string): string => {
          return readAndFree(
            symbols.EserAjanAiCancelRequest(toCString(requestJSON)),
          );
        },
        EserAjanAiCloseModel: (modelHandle: string): string => {
          return readAndFree(
            symbols.EserAjanAiCloseModel(toCString(modelHandle)),
          );
        },
        EserAjanAiFreeStream: (streamHandle: string): string => {
          return readAndFree(
            symbols.EserAjanAiFreeStream(toCString(streamHandle)),
          );
        },
        // LIMITATION: the five batch calls below are network round-trips made
        // as blocking FFI calls, see EserAjanAiGenerateText above.
        EserAjanAiBatchCreate: (requestJSON: string): string => {
          return readAndFree(
            symbols.EserAjanAiBatchCreate(toCString(requestJSON)),
          );
        },
        EserAjanAiBatchGet: (requestJSON: string): string => {
          return readAndFree(
            symbols.EserAjanAiBatchGet(toCString(requestJSON)),
          );
        },
        EserAjanAiBatchList: (requestJSON: string): string => {
          return readAndFree(
            symbols.EserAjanAiBatchList(toCString(requestJSON)),
          );
        },
        EserAjanAiBatchDownload: (requestJSON: string): string => {
          return readAndFree(
            symbols.EserAjanAiBatchDownload(toCString(requestJSON)),
          );
        },
        EserAjanAiBatchCancel: (requestJSON: string): string => {
          return readAndFree(
            symbols.EserAjanAiBatchCancel(toCString(requestJSON)),
          );
        },
        EserAjanFormatEncode: (requestJSON: string): string => {
          return readAndFree(
            symbols.EserAjanFormatEncode(toCString(requestJSON)),
          );
        },
        EserAjanFormatDecode: (requestJSON: string): string => {
          return readAndFree(
            symbols.EserAjanFormatDecode(toCString(requestJSON)),
          );
        },
        EserAjanFormatList: (): string => {
          return readAndFree(symbols.EserAjanFormatList());
        },
        EserAjanFormatEncodeDocument: (requestJSON: string): string => {
          return readAndFree(
            symbols.EserAjanFormatEncodeDocument(toCString(requestJSON)),
          );
        },
        EserAjanLogCreate: (configJSON: string): string => {
          return readAndFree(symbols.EserAjanLogCreate(toCString(configJSON)));
        },
        EserAjanLogWrite: (requestJSON: string): string => {
          return readAndFree(
            symbols.EserAjanLogWrite(toCString(requestJSON)),
          );
        },
        EserAjanLogClose: (handle: string): string => {
          return readAndFree(symbols.EserAjanLogClose(toCString(handle)));
        },
        EserAjanLogShouldLog: (requestJSON: string): string => {
          return readAndFree(
            symbols.EserAjanLogShouldLog(toCString(requestJSON)),
          );
        },
        EserAjanLogConfigure: (requestJSON: string): string => {
          return readAndFree(
            symbols.EserAjanLogConfigure(toCString(requestJSON)),
          );
        },
        EserAjanHttpCreate: (configJSON: string): string => {
          return readAndFree(
            symbols.EserAjanHttpCreate(toCString(configJSON)),
          );
        },
        EserAjanHttpRequest: (requestJSON: string): string => {
          return readAndFree(
            symbols.EserAjanHttpRequest(toCString(requestJSON)),
          );
        },
        EserAjanHttpClose: (handle: string): string => {
          return readAndFree(symbols.EserAjanHttpClose(toCString(handle)));
        },
        EserAjanHttpRequestStream: (requestJSON: string): string => {
          return readAndFree(
            symbols.EserAjanHttpRequestStream(toCString(requestJSON)),
          );
        },
        EserAjanHttpStreamRead: (handle: string): string => {
          return readAndFree(symbols.EserAjanHttpStreamRead(toCString(handle)));
        },
        EserAjanHttpStreamClose: (handle: string): string => {
          return readAndFree(
            symbols.EserAjanHttpStreamClose(toCString(handle)),
          );
        },
        EserAjanNoskillsInit: (requestJSON: string): string => {
          return readAndFree(
            symbols.EserAjanNoskillsInit(toCString(requestJSON)),
          );
        },
        EserAjanNoskillsSpecNew: (requestJSON: string): string => {
          return readAndFree(
            symbols.EserAjanNoskillsSpecNew(toCString(requestJSON)),
          );
        },
        EserAjanNoskillsNext: (requestJSON: string): string => {
          return readAndFree(
            symbols.EserAjanNoskillsNext(toCString(requestJSON)),
          );
        },
        EserAjanWorkflowRun: (requestJSON: string): string => {
          return readAndFree(
            symbols.EserAjanWorkflowRun(toCString(requestJSON)),
          );
        },
        EserAjanCryptoHash: (requestJSON: string): string => {
          return readAndFree(
            symbols.EserAjanCryptoHash(toCString(requestJSON)),
          );
        },
        EserAjanCacheCreate: (requestJSON: string): string => {
          return readAndFree(
            symbols.EserAjanCacheCreate(toCString(requestJSON)),
          );
        },
        EserAjanCacheGetDir: (requestJSON: string): string => {
          return readAndFree(
            symbols.EserAjanCacheGetDir(toCString(requestJSON)),
          );
        },
        EserAjanCacheGetVersionedPath: (requestJSON: string): string => {
          return readAndFree(
            symbols.EserAjanCacheGetVersionedPath(toCString(requestJSON)),
          );
        },
        EserAjanCacheList: (requestJSON: string): string => {
          return readAndFree(symbols.EserAjanCacheList(toCString(requestJSON)));
        },
        EserAjanCacheRemove: (requestJSON: string): string => {
          return readAndFree(
            symbols.EserAjanCacheRemove(toCString(requestJSON)),
          );
        },
        EserAjanCacheClear: (requestJSON: string): string => {
          return readAndFree(
            symbols.EserAjanCacheClear(toCString(requestJSON)),
          );
        },
        EserAjanCacheClose: (requestJSON: string): string => {
          return readAndFree(
            symbols.EserAjanCacheClose(toCString(requestJSON)),
          );
        },
        EserAjanCsGenerate: (requestJSON: string): string => {
          return readAndFree(
            symbols.EserAjanCsGenerate(toCString(requestJSON)),
          );
        },
        EserAjanCsSync: (requestJSON: string): string => {
          return readAndFree(
            symbols.EserAjanCsSync(toCString(requestJSON)),
          );
        },
        EserAjanKitListRecipes: (requestJSON: string): string => {
          return readAndFree(
            symbols.EserAjanKitListRecipes(toCString(requestJSON)),
          );
        },
        EserAjanKitApplyRecipe: (requestJSON: string): string => {
          return readAndFree(
            symbols.EserAjanKitApplyRecipe(toCString(requestJSON)),
          );
        },
        EserAjanKitCloneRecipe: (requestJSON: string): string => {
          return readAndFree(
            symbols.EserAjanKitCloneRecipe(toCString(requestJSON)),
          );
        },
        EserAjanKitNewProject: (requestJSON: string): string => {
          return readAndFree(
            symbols.EserAjanKitNewProject(toCString(requestJSON)),
          );
        },
        EserAjanKitUpdateRecipe: (requestJSON: string): string => {
          return readAndFree(
            symbols.EserAjanKitUpdateRecipe(toCString(requestJSON)),
          );
        },
        EserAjanPostsCreateService: (requestJSON: string): string => {
          return readAndFree(
            symbols.EserAjanPostsCreateService(toCString(requestJSON)),
          );
        },
        EserAjanPostsCompose: (requestJSON: string): string => {
          return readAndFree(
            symbols.EserAjanPostsCompose(toCString(requestJSON)),
          );
        },
        EserAjanPostsGetTimeline: (requestJSON: string): string => {
          return readAndFree(
            symbols.EserAjanPostsGetTimeline(toCString(requestJSON)),
          );
        },
        EserAjanPostsSearch: (requestJSON: string): string => {
          return readAndFree(
            symbols.EserAjanPostsSearch(toCString(requestJSON)),
          );
        },
        EserAjanPostsClose: (requestJSON: string): string => {
          return readAndFree(
            symbols.EserAjanPostsClose(toCString(requestJSON)),
          );
        },
        EserAjanCodebaseGitCurrentBranch: (requestJSON: string): string => {
          return readAndFree(
            symbols.EserAjanCodebaseGitCurrentBranch(toCString(requestJSON)),
          );
        },
        EserAjanCodebaseGitLatestTag: (requestJSON: string): string => {
          return readAndFree(
            symbols.EserAjanCodebaseGitLatestTag(toCString(requestJSON)),
          );
        },
        EserAjanCodebaseGitLog: (requestJSON: string): string => {
          return readAndFree(
            symbols.EserAjanCodebaseGitLog(toCString(requestJSON)),
          );
        },
        EserAjanCodebaseValidateCommitMsg: (requestJSON: string): string => {
          return readAndFree(
            symbols.EserAjanCodebaseValidateCommitMsg(toCString(requestJSON)),
          );
        },
        EserAjanCodebaseGenerateChangelog: (requestJSON: string): string => {
          return readAndFree(
            symbols.EserAjanCodebaseGenerateChangelog(toCString(requestJSON)),
          );
        },
        EserAjanCodebaseBumpVersion: (requestJSON: string): string => {
          return readAndFree(
            symbols.EserAjanCodebaseBumpVersion(toCString(requestJSON)),
          );
        },
        EserAjanCodebaseWalkFiles: (requestJSON: string): string => {
          return readAndFree(
            symbols.EserAjanCodebaseWalkFiles(toCString(requestJSON)),
          );
        },
        EserAjanCodebaseValidateFiles: (requestJSON: string): string => {
          return readAndFree(
            symbols.EserAjanCodebaseValidateFiles(toCString(requestJSON)),
          );
        },
        EserAjanCodebaseCheckCircularDeps: (requestJSON: string): string => {
          return readAndFree(
            symbols.EserAjanCodebaseCheckCircularDeps(toCString(requestJSON)),
          );
        },
        EserAjanCodebaseCheckExportNames: (requestJSON: string): string => {
          return readAndFree(
            symbols.EserAjanCodebaseCheckExportNames(toCString(requestJSON)),
          );
        },
        EserAjanCodebaseCheckModExports: (requestJSON: string): string => {
          return readAndFree(
            symbols.EserAjanCodebaseCheckModExports(toCString(requestJSON)),
          );
        },
        EserAjanCodebaseCheckPackageConfigs: (requestJSON: string): string => {
          return readAndFree(
            symbols.EserAjanCodebaseCheckPackageConfigs(toCString(requestJSON)),
          );
        },
        EserAjanCodebaseCheckDocs: (requestJSON: string): string => {
          return readAndFree(
            symbols.EserAjanCodebaseCheckDocs(toCString(requestJSON)),
          );
        },
        EserAjanCodebaseWalkFilesStreamCreate: (
          requestJSON: string,
        ): string => {
          return readAndFree(
            symbols.EserAjanCodebaseWalkFilesStreamCreate(
              toCString(requestJSON),
            ),
          );
        },
        EserAjanCodebaseWalkFilesStreamRead: (handle: string): string => {
          return readAndFree(
            symbols.EserAjanCodebaseWalkFilesStreamRead(toCString(handle)),
          );
        },
        EserAjanCodebaseWalkFilesStreamClose: (handle: string): string => {
          return readAndFree(
            symbols.EserAjanCodebaseWalkFilesStreamClose(toCString(handle)),
          );
        },
        EserAjanCodebaseValidateFilesStreamCreate: (
          requestJSON: string,
        ): string => {
          return readAndFree(
            symbols.EserAjanCodebaseValidateFilesStreamCreate(
              toCString(requestJSON),
            ),
          );
        },
        EserAjanCodebaseValidateFilesStreamRead: (handle: string): string => {
          return readAndFree(
            symbols.EserAjanCodebaseValidateFilesStreamRead(toCString(handle)),
          );
        },
        EserAjanCodebaseValidateFilesStreamClose: (handle: string): string => {
          return readAndFree(
            symbols.EserAjanCodebaseValidateFilesStreamClose(toCString(handle)),
          );
        },
        EserAjanCollectorSpecifierToIdentifier: (
          requestJSON: string,
        ): string => {
          return readAndFree(
            symbols.EserAjanCollectorSpecifierToIdentifier(
              toCString(requestJSON),
            ),
          );
        },
        EserAjanCollectorWalkFiles: (requestJSON: string): string => {
          return readAndFree(
            symbols.EserAjanCollectorWalkFiles(toCString(requestJSON)),
          );
        },
        EserAjanCollectorGenerateManifest: (requestJSON: string): string => {
          return readAndFree(
            symbols.EserAjanCollectorGenerateManifest(toCString(requestJSON)),
          );
        },
        EserAjanParsingTokenize: (requestJSON: string): string => {
          return readAndFree(
            symbols.EserAjanParsingTokenize(toCString(requestJSON)),
          );
        },
        EserAjanParsingSimpleTokens: (): string => {
          return readAndFree(symbols.EserAjanParsingSimpleTokens());
        },
        EserAjanParsingTokenizeStreamCreate: (requestJSON: string): string => {
          return readAndFree(
            symbols.EserAjanParsingTokenizeStreamCreate(toCString(requestJSON)),
          );
        },
        EserAjanParsingTokenizeStreamPush: (requestJSON: string): string => {
          return readAndFree(
            symbols.EserAjanParsingTokenizeStreamPush(toCString(requestJSON)),
          );
        },
        EserAjanParsingTokenizeStreamClose: (requestJSON: string): string => {
          return readAndFree(
            symbols.EserAjanParsingTokenizeStreamClose(toCString(requestJSON)),
          );
        },
        EserAjanShellExec: (requestJSON: string): string => {
          return readAndFree(
            symbols.EserAjanShellExec(toCString(requestJSON)),
          );
        },
        EserAjanShellTuiKeypressCreate: (requestJSON: string): string => {
          return readAndFree(
            symbols.EserAjanShellTuiKeypressCreate(toCString(requestJSON)),
          );
        },
        EserAjanShellTuiKeypressRead: (handle: string): string => {
          return readAndFree(
            symbols.EserAjanShellTuiKeypressRead(toCString(handle)),
          );
        },
        EserAjanShellTuiKeypressClose: (handle: string): string => {
          return readAndFree(
            symbols.EserAjanShellTuiKeypressClose(toCString(handle)),
          );
        },
        EserAjanShellTuiSetStdinRaw: (requestJSON: string): string => {
          return readAndFree(
            symbols.EserAjanShellTuiSetStdinRaw(toCString(requestJSON)),
          );
        },
        EserAjanShellTuiGetSize: (requestJSON: string): string => {
          return readAndFree(
            symbols.EserAjanShellTuiGetSize(toCString(requestJSON)),
          );
        },
        EserAjanShellExecSpawn: (requestJSON: string): string => {
          return readAndFree(
            symbols.EserAjanShellExecSpawn(toCString(requestJSON)),
          );
        },
        EserAjanShellExecRead: (handle: string): string => {
          return readAndFree(
            symbols.EserAjanShellExecRead(toCString(handle)),
          );
        },
        EserAjanShellExecWrite: (requestJSON: string): string => {
          return readAndFree(
            symbols.EserAjanShellExecWrite(toCString(requestJSON)),
          );
        },
        EserAjanShellExecClose: (handle: string): string => {
          return readAndFree(
            symbols.EserAjanShellExecClose(toCString(handle)),
          );
        },
        EserAjanShellPtySpawn: (requestJSON: string): string => {
          return readAndFree(
            symbols.EserAjanShellPtySpawn(toCString(requestJSON)),
          );
        },
        // LIMITATION: bun:ffi has no per-call async, so this PTY read is a
        // BLOCKING FFI call wrapped in a resolved Promise to satisfy the
        // interface. While an idle PTY waits for output the Bun event loop is
        // parked, so write()/kill()/render can't run and multiple panes can't
        // interleave. Only Deno (nonblocking:true) is fully supported for the
        // interactive multiplexer; running it under Bun degrades responsiveness.
        EserAjanShellPtyRead: (handle: string): Promise<string> => {
          return Promise.resolve(
            readAndFree(symbols.EserAjanShellPtyRead(toCString(handle))),
          );
        },
        EserAjanShellPtyWrite: (requestJSON: string): string => {
          return readAndFree(
            symbols.EserAjanShellPtyWrite(toCString(requestJSON)),
          );
        },
        EserAjanShellPtyResize: (requestJSON: string): string => {
          return readAndFree(
            symbols.EserAjanShellPtyResize(toCString(requestJSON)),
          );
        },
        EserAjanShellPtyKill: (requestJSON: string): string => {
          return readAndFree(
            symbols.EserAjanShellPtyKill(toCString(requestJSON)),
          );
        },
        EserAjanShellPtyClose: (handle: string): string => {
          return readAndFree(
            symbols.EserAjanShellPtyClose(toCString(handle)),
          );
        },
      },
      () => {
        lib.close();
      },
    );
  },
};
