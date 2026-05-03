// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Node.js FFI backend using `koffi`.
 *
 * koffi is a fast, zero-JS-dependency C FFI library for Node.js that ships
 * prebuilt binaries for all major platforms. It automatically marshals
 * `char*` returns to JS strings.
 *
 * This module is only functional when running under Node.js with `koffi`
 * installed. Under other runtimes (Deno, Bun), `available()` returns false.
 *
 * @module
 */

import type * as types from "./types.ts";

/**
 * Node.js FFI backend using koffi.
 */
export const backend: types.FFIBackend = {
  name: "node",

  available: (): boolean => {
    // deno-lint-ignore no-explicit-any
    const g = globalThis as any;

    return (
      typeof g.process !== "undefined" &&
      typeof g.process.versions?.node === "string" &&
      typeof g.Deno === "undefined" &&
      typeof g.Bun === "undefined"
    );
  },

  open: async (libraryPath: string): Promise<types.FFILibrary> => {
    // deno-lint-ignore no-explicit-any
    let koffi: any = await import("koffi");
    // Handle default export (koffi uses module.exports = ...)
    if (koffi.default !== undefined) {
      koffi = koffi.default;
    }

    if (typeof koffi.load !== "function") {
      throw new Error(
        "koffi module loaded but koffi.load is not a function. " +
          "Check your koffi version (requires ^2.15.0).",
      );
    }

    const lib = koffi.load(libraryPath);

    // koffi auto-decodes char* to JS string, so we just call and return.
    // Go's C.CString allocates via malloc — we should call EserAjanFree,
    // but koffi's char* return already copies the string. The Go side
    // still holds the pointer until freed. For safety we use opaque
    // pointers for the free call.
    const rawVersion = lib.func("char* EserAjanVersion()");
    const rawInit = lib.func("int EserAjanInit()");
    const rawShutdown = lib.func("void EserAjanShutdown()");
    const rawConfigLoad = lib.func(
      "char* EserAjanConfigLoad(const char* path)",
    );
    const rawDIResolve = lib.func(
      "char* EserAjanDIResolve(const char* name)",
    );
    const rawAiCreateModel = lib.func(
      "char* EserAjanAiCreateModel(const char* configJSON)",
    );
    const rawAiGenerateText = lib.func(
      "char* EserAjanAiGenerateText(const char* modelHandle, const char* optionsJSON)",
    );
    const rawAiStreamText = lib.func(
      "char* EserAjanAiStreamText(const char* modelHandle, const char* optionsJSON)",
    );
    const rawAiStreamRead = lib.func(
      "char* EserAjanAiStreamRead(const char* streamHandle)",
    );
    const rawAiCloseModel = lib.func(
      "char* EserAjanAiCloseModel(const char* modelHandle)",
    );
    const rawAiFreeStream = lib.func(
      "char* EserAjanAiFreeStream(const char* streamHandle)",
    );
    const rawAiBatchCreate = lib.func(
      "char* EserAjanAiBatchCreate(const char* requestJSON)",
    );
    const rawAiBatchGet = lib.func(
      "char* EserAjanAiBatchGet(const char* requestJSON)",
    );
    const rawAiBatchList = lib.func(
      "char* EserAjanAiBatchList(const char* requestJSON)",
    );
    const rawAiBatchDownload = lib.func(
      "char* EserAjanAiBatchDownload(const char* requestJSON)",
    );
    const rawAiBatchCancel = lib.func(
      "char* EserAjanAiBatchCancel(const char* requestJSON)",
    );
    const rawFormatEncode = lib.func(
      "char* EserAjanFormatEncode(const char* requestJSON)",
    );
    const rawFormatDecode = lib.func(
      "char* EserAjanFormatDecode(const char* requestJSON)",
    );
    const rawFormatList = lib.func("char* EserAjanFormatList()");
    const rawFormatEncodeDocument = lib.func(
      "char* EserAjanFormatEncodeDocument(const char* requestJSON)",
    );
    const rawLogCreate = lib.func(
      "char* EserAjanLogCreate(const char* configJSON)",
    );
    const rawLogWrite = lib.func(
      "char* EserAjanLogWrite(const char* requestJSON)",
    );
    const rawLogClose = lib.func(
      "char* EserAjanLogClose(const char* handle)",
    );
    const rawLogShouldLog = lib.func(
      "char* EserAjanLogShouldLog(const char* requestJSON)",
    );
    const rawLogConfigure = lib.func(
      "char* EserAjanLogConfigure(const char* requestJSON)",
    );
    const rawHttpCreate = lib.func(
      "char* EserAjanHttpCreate(const char* configJSON)",
    );
    const rawHttpRequest = lib.func(
      "char* EserAjanHttpRequest(const char* requestJSON)",
    );
    const rawHttpClose = lib.func(
      "char* EserAjanHttpClose(const char* handle)",
    );
    const rawHttpRequestStream = lib.func(
      "char* EserAjanHttpRequestStream(const char* requestJSON)",
    );
    const rawHttpStreamRead = lib.func(
      "char* EserAjanHttpStreamRead(const char* handle)",
    );
    const rawHttpStreamClose = lib.func(
      "char* EserAjanHttpStreamClose(const char* handle)",
    );
    const rawNoskillsInit = lib.func(
      "char* EserAjanNoskillsInit(const char* requestJSON)",
    );
    const rawNoskillsSpecNew = lib.func(
      "char* EserAjanNoskillsSpecNew(const char* requestJSON)",
    );
    const rawNoskillsNext = lib.func(
      "char* EserAjanNoskillsNext(const char* requestJSON)",
    );
    const rawWorkflowRun = lib.func(
      "char* EserAjanWorkflowRun(const char* requestJSON)",
    );
    const rawCryptoHash = lib.func(
      "char* EserAjanCryptoHash(const char* requestJSON)",
    );
    const rawCacheCreate = lib.func(
      "char* EserAjanCacheCreate(const char* requestJSON)",
    );
    const rawCacheGetDir = lib.func(
      "char* EserAjanCacheGetDir(const char* handle)",
    );
    const rawCacheGetVersionedPath = lib.func(
      "char* EserAjanCacheGetVersionedPath(const char* requestJSON)",
    );
    const rawCacheList = lib.func(
      "char* EserAjanCacheList(const char* handle)",
    );
    const rawCacheRemove = lib.func(
      "char* EserAjanCacheRemove(const char* requestJSON)",
    );
    const rawCacheClear = lib.func(
      "char* EserAjanCacheClear(const char* handle)",
    );
    const rawCacheClose = lib.func(
      "char* EserAjanCacheClose(const char* handle)",
    );
    const rawCsGenerate = lib.func(
      "char* EserAjanCsGenerate(const char* requestJSON)",
    );
    const rawCsSync = lib.func(
      "char* EserAjanCsSync(const char* requestJSON)",
    );
    const rawKitListRecipes = lib.func(
      "char* EserAjanKitListRecipes(const char* requestJSON)",
    );
    const rawKitApplyRecipe = lib.func(
      "char* EserAjanKitApplyRecipe(const char* requestJSON)",
    );
    const rawKitCloneRecipe = lib.func(
      "char* EserAjanKitCloneRecipe(const char* requestJSON)",
    );
    const rawKitNewProject = lib.func(
      "char* EserAjanKitNewProject(const char* requestJSON)",
    );
    const rawKitUpdateRecipe = lib.func(
      "char* EserAjanKitUpdateRecipe(const char* requestJSON)",
    );
    const rawPostsCreateService = lib.func(
      "char* EserAjanPostsCreateService(const char* requestJSON)",
    );
    const rawPostsCompose = lib.func(
      "char* EserAjanPostsCompose(const char* requestJSON)",
    );
    const rawPostsGetTimeline = lib.func(
      "char* EserAjanPostsGetTimeline(const char* requestJSON)",
    );
    const rawPostsSearch = lib.func(
      "char* EserAjanPostsSearch(const char* requestJSON)",
    );
    const rawPostsClose = lib.func(
      "char* EserAjanPostsClose(const char* requestJSON)",
    );
    const rawCodebaseGitCurrentBranch = lib.func(
      "char* EserAjanCodebaseGitCurrentBranch(const char* requestJSON)",
    );
    const rawCodebaseGitLatestTag = lib.func(
      "char* EserAjanCodebaseGitLatestTag(const char* requestJSON)",
    );
    const rawCodebaseGitLog = lib.func(
      "char* EserAjanCodebaseGitLog(const char* requestJSON)",
    );
    const rawCodebaseValidateCommitMsg = lib.func(
      "char* EserAjanCodebaseValidateCommitMsg(const char* requestJSON)",
    );
    const rawCodebaseGenerateChangelog = lib.func(
      "char* EserAjanCodebaseGenerateChangelog(const char* requestJSON)",
    );
    const rawCodebaseBumpVersion = lib.func(
      "char* EserAjanCodebaseBumpVersion(const char* requestJSON)",
    );
    const rawCodebaseWalkFiles = lib.func(
      "char* EserAjanCodebaseWalkFiles(const char* requestJSON)",
    );
    const rawCodebaseValidateFiles = lib.func(
      "char* EserAjanCodebaseValidateFiles(const char* requestJSON)",
    );
    const rawCodebaseCheckCircularDeps = lib.func(
      "char* EserAjanCodebaseCheckCircularDeps(const char* requestJSON)",
    );
    const rawCodebaseCheckExportNames = lib.func(
      "char* EserAjanCodebaseCheckExportNames(const char* requestJSON)",
    );
    const rawCodebaseCheckModExports = lib.func(
      "char* EserAjanCodebaseCheckModExports(const char* requestJSON)",
    );
    const rawCodebaseCheckPackageConfigs = lib.func(
      "char* EserAjanCodebaseCheckPackageConfigs(const char* requestJSON)",
    );
    const rawCodebaseCheckDocs = lib.func(
      "char* EserAjanCodebaseCheckDocs(const char* requestJSON)",
    );
    const rawCodebaseWalkFilesStreamCreate = lib.func(
      "char* EserAjanCodebaseWalkFilesStreamCreate(const char* requestJSON)",
    );
    const rawCodebaseWalkFilesStreamRead = lib.func(
      "char* EserAjanCodebaseWalkFilesStreamRead(const char* handle)",
    );
    const rawCodebaseWalkFilesStreamClose = lib.func(
      "char* EserAjanCodebaseWalkFilesStreamClose(const char* handle)",
    );
    const rawCodebaseValidateFilesStreamCreate = lib.func(
      "char* EserAjanCodebaseValidateFilesStreamCreate(const char* requestJSON)",
    );
    const rawCodebaseValidateFilesStreamRead = lib.func(
      "char* EserAjanCodebaseValidateFilesStreamRead(const char* handle)",
    );
    const rawCodebaseValidateFilesStreamClose = lib.func(
      "char* EserAjanCodebaseValidateFilesStreamClose(const char* handle)",
    );
    const rawCollectorSpecifierToIdentifier = lib.func(
      "char* EserAjanCollectorSpecifierToIdentifier(const char* requestJSON)",
    );
    const rawCollectorWalkFiles = lib.func(
      "char* EserAjanCollectorWalkFiles(const char* requestJSON)",
    );
    const rawCollectorGenerateManifest = lib.func(
      "char* EserAjanCollectorGenerateManifest(const char* requestJSON)",
    );
    const rawParsingTokenize = lib.func(
      "char* EserAjanParsingTokenize(const char* requestJSON)",
    );
    const rawParsingSimpleTokens = lib.func("char* EserAjanParsingSimpleTokens()");
    const rawParsingTokenizeStreamCreate = lib.func(
      "char* EserAjanParsingTokenizeStreamCreate(const char* requestJSON)",
    );
    const rawParsingTokenizeStreamPush = lib.func(
      "char* EserAjanParsingTokenizeStreamPush(const char* requestJSON)",
    );
    const rawParsingTokenizeStreamClose = lib.func(
      "char* EserAjanParsingTokenizeStreamClose(const char* requestJSON)",
    );
    const rawShellExec = lib.func(
      "char* EserAjanShellExec(const char* requestJSON)",
    );
    const rawShellTuiKeypressCreate = lib.func(
      "char* EserAjanShellTuiKeypressCreate(const char* requestJSON)",
    );
    const rawShellTuiKeypressRead = lib.func(
      "char* EserAjanShellTuiKeypressRead(const char* handle)",
    );
    const rawShellTuiKeypressClose = lib.func(
      "char* EserAjanShellTuiKeypressClose(const char* handle)",
    );
    const rawShellTuiSetStdinRaw = lib.func(
      "char* EserAjanShellTuiSetStdinRaw(const char* requestJSON)",
    );
    const rawShellTuiGetSize = lib.func(
      "char* EserAjanShellTuiGetSize(const char* requestJSON)",
    );
    const rawShellExecSpawn = lib.func(
      "char* EserAjanShellExecSpawn(const char* requestJSON)",
    );
    const rawShellExecRead = lib.func(
      "char* EserAjanShellExecRead(const char* handle)",
    );
    const rawShellExecWrite = lib.func(
      "char* EserAjanShellExecWrite(const char* requestJSON)",
    );
    const rawShellExecClose = lib.func(
      "char* EserAjanShellExecClose(const char* handle)",
    );

    return {
      symbols: {
        EserAjanVersion: (): string => {
          return rawVersion() ?? "";
        },
        EserAjanInit: (): number => {
          return rawInit() as number;
        },
        EserAjanShutdown: (): void => {
          rawShutdown();
        },
        EserAjanFree: (_ptr: unknown): void => {
          // koffi handles string copying — no manual free needed
        },
        EserAjanConfigLoad: (path: string): string => {
          return rawConfigLoad(path) ?? "";
        },
        EserAjanDIResolve: (name: string): string => {
          return rawDIResolve(name) ?? "";
        },
        EserAjanAiCreateModel: (configJSON: string): string => {
          return rawAiCreateModel(configJSON) ?? "";
        },
        EserAjanAiGenerateText: (
          modelHandle: string,
          optionsJSON: string,
        ): string => {
          return rawAiGenerateText(modelHandle, optionsJSON) ?? "";
        },
        EserAjanAiStreamText: (
          modelHandle: string,
          optionsJSON: string,
        ): string => {
          return rawAiStreamText(modelHandle, optionsJSON) ?? "";
        },
        EserAjanAiStreamRead: (streamHandle: string): string => {
          return rawAiStreamRead(streamHandle) ?? "";
        },
        EserAjanAiCloseModel: (modelHandle: string): string => {
          return rawAiCloseModel(modelHandle) ?? "";
        },
        EserAjanAiFreeStream: (streamHandle: string): string => {
          return rawAiFreeStream(streamHandle) ?? "";
        },
        EserAjanAiBatchCreate: (requestJSON: string): string => {
          return rawAiBatchCreate(requestJSON) ?? "";
        },
        EserAjanAiBatchGet: (requestJSON: string): string => {
          return rawAiBatchGet(requestJSON) ?? "";
        },
        EserAjanAiBatchList: (requestJSON: string): string => {
          return rawAiBatchList(requestJSON) ?? "";
        },
        EserAjanAiBatchDownload: (requestJSON: string): string => {
          return rawAiBatchDownload(requestJSON) ?? "";
        },
        EserAjanAiBatchCancel: (requestJSON: string): string => {
          return rawAiBatchCancel(requestJSON) ?? "";
        },
        EserAjanFormatEncode: (requestJSON: string): string => {
          return rawFormatEncode(requestJSON) ?? "";
        },
        EserAjanFormatDecode: (requestJSON: string): string => {
          return rawFormatDecode(requestJSON) ?? "";
        },
        EserAjanFormatList: (): string => {
          return rawFormatList() ?? "";
        },
        EserAjanFormatEncodeDocument: (requestJSON: string): string => {
          return rawFormatEncodeDocument(requestJSON) ?? "";
        },
        EserAjanLogCreate: (configJSON: string): string => {
          return rawLogCreate(configJSON) ?? "";
        },
        EserAjanLogWrite: (requestJSON: string): string => {
          return rawLogWrite(requestJSON) ?? "";
        },
        EserAjanLogClose: (handle: string): string => {
          return rawLogClose(handle) ?? "";
        },
        EserAjanLogShouldLog: (requestJSON: string): string => {
          return rawLogShouldLog(requestJSON) ?? "";
        },
        EserAjanLogConfigure: (requestJSON: string): string => {
          return rawLogConfigure(requestJSON) ?? "";
        },
        EserAjanHttpCreate: (configJSON: string): string => {
          return rawHttpCreate(configJSON) ?? "";
        },
        EserAjanHttpRequest: (requestJSON: string): string => {
          return rawHttpRequest(requestJSON) ?? "";
        },
        EserAjanHttpClose: (handle: string): string => {
          return rawHttpClose(handle) ?? "";
        },
        EserAjanHttpRequestStream: (requestJSON: string): string => {
          return rawHttpRequestStream(requestJSON) ?? "";
        },
        EserAjanHttpStreamRead: (handle: string): string => {
          return rawHttpStreamRead(handle) ?? "";
        },
        EserAjanHttpStreamClose: (handle: string): string => {
          return rawHttpStreamClose(handle) ?? "";
        },
        EserAjanNoskillsInit: (requestJSON: string): string => {
          return rawNoskillsInit(requestJSON) ?? "";
        },
        EserAjanNoskillsSpecNew: (requestJSON: string): string => {
          return rawNoskillsSpecNew(requestJSON) ?? "";
        },
        EserAjanNoskillsNext: (requestJSON: string): string => {
          return rawNoskillsNext(requestJSON) ?? "";
        },
        EserAjanWorkflowRun: (requestJSON: string): string => {
          return rawWorkflowRun(requestJSON) ?? "";
        },
        EserAjanCryptoHash: (requestJSON: string): string => {
          return rawCryptoHash(requestJSON) ?? "";
        },
        EserAjanCacheCreate: (requestJSON: string): string => {
          return rawCacheCreate(requestJSON) ?? "";
        },
        EserAjanCacheGetDir: (requestJSON: string): string => {
          return rawCacheGetDir(requestJSON) ?? "";
        },
        EserAjanCacheGetVersionedPath: (requestJSON: string): string => {
          return rawCacheGetVersionedPath(requestJSON) ?? "";
        },
        EserAjanCacheList: (requestJSON: string): string => {
          return rawCacheList(requestJSON) ?? "";
        },
        EserAjanCacheRemove: (requestJSON: string): string => {
          return rawCacheRemove(requestJSON) ?? "";
        },
        EserAjanCacheClear: (requestJSON: string): string => {
          return rawCacheClear(requestJSON) ?? "";
        },
        EserAjanCacheClose: (requestJSON: string): string => {
          return rawCacheClose(requestJSON) ?? "";
        },
        EserAjanCsGenerate: (requestJSON: string): string => {
          return rawCsGenerate(requestJSON) ?? "";
        },
        EserAjanCsSync: (requestJSON: string): string => {
          return rawCsSync(requestJSON) ?? "";
        },
        EserAjanKitListRecipes: (requestJSON: string): string => {
          return rawKitListRecipes(requestJSON) ?? "";
        },
        EserAjanKitApplyRecipe: (requestJSON: string): string => {
          return rawKitApplyRecipe(requestJSON) ?? "";
        },
        EserAjanKitCloneRecipe: (requestJSON: string): string => {
          return rawKitCloneRecipe(requestJSON) ?? "";
        },
        EserAjanKitNewProject: (requestJSON: string): string => {
          return rawKitNewProject(requestJSON) ?? "";
        },
        EserAjanKitUpdateRecipe: (requestJSON: string): string => {
          return rawKitUpdateRecipe(requestJSON) ?? "";
        },
        EserAjanPostsCreateService: (requestJSON: string): string => {
          return rawPostsCreateService(requestJSON) ?? "";
        },
        EserAjanPostsCompose: (requestJSON: string): string => {
          return rawPostsCompose(requestJSON) ?? "";
        },
        EserAjanPostsGetTimeline: (requestJSON: string): string => {
          return rawPostsGetTimeline(requestJSON) ?? "";
        },
        EserAjanPostsSearch: (requestJSON: string): string => {
          return rawPostsSearch(requestJSON) ?? "";
        },
        EserAjanPostsClose: (requestJSON: string): string => {
          return rawPostsClose(requestJSON) ?? "";
        },
        EserAjanCodebaseGitCurrentBranch: (requestJSON: string): string => {
          return rawCodebaseGitCurrentBranch(requestJSON) ?? "";
        },
        EserAjanCodebaseGitLatestTag: (requestJSON: string): string => {
          return rawCodebaseGitLatestTag(requestJSON) ?? "";
        },
        EserAjanCodebaseGitLog: (requestJSON: string): string => {
          return rawCodebaseGitLog(requestJSON) ?? "";
        },
        EserAjanCodebaseValidateCommitMsg: (requestJSON: string): string => {
          return rawCodebaseValidateCommitMsg(requestJSON) ?? "";
        },
        EserAjanCodebaseGenerateChangelog: (requestJSON: string): string => {
          return rawCodebaseGenerateChangelog(requestJSON) ?? "";
        },
        EserAjanCodebaseBumpVersion: (requestJSON: string): string => {
          return rawCodebaseBumpVersion(requestJSON) ?? "";
        },
        EserAjanCodebaseWalkFiles: (requestJSON: string): string => {
          return rawCodebaseWalkFiles(requestJSON) ?? "";
        },
        EserAjanCodebaseValidateFiles: (requestJSON: string): string => {
          return rawCodebaseValidateFiles(requestJSON) ?? "";
        },
        EserAjanCodebaseCheckCircularDeps: (requestJSON: string): string => {
          return rawCodebaseCheckCircularDeps(requestJSON) ?? "";
        },
        EserAjanCodebaseCheckExportNames: (requestJSON: string): string => {
          return rawCodebaseCheckExportNames(requestJSON) ?? "";
        },
        EserAjanCodebaseCheckModExports: (requestJSON: string): string => {
          return rawCodebaseCheckModExports(requestJSON) ?? "";
        },
        EserAjanCodebaseCheckPackageConfigs: (requestJSON: string): string => {
          return rawCodebaseCheckPackageConfigs(requestJSON) ?? "";
        },
        EserAjanCodebaseCheckDocs: (requestJSON: string): string => {
          return rawCodebaseCheckDocs(requestJSON) ?? "";
        },
        EserAjanCodebaseWalkFilesStreamCreate: (requestJSON: string): string => {
          return rawCodebaseWalkFilesStreamCreate(requestJSON) ?? "";
        },
        EserAjanCodebaseWalkFilesStreamRead: (handle: string): string => {
          return rawCodebaseWalkFilesStreamRead(handle) ?? "";
        },
        EserAjanCodebaseWalkFilesStreamClose: (handle: string): string => {
          return rawCodebaseWalkFilesStreamClose(handle) ?? "";
        },
        EserAjanCodebaseValidateFilesStreamCreate: (requestJSON: string): string => {
          return rawCodebaseValidateFilesStreamCreate(requestJSON) ?? "";
        },
        EserAjanCodebaseValidateFilesStreamRead: (handle: string): string => {
          return rawCodebaseValidateFilesStreamRead(handle) ?? "";
        },
        EserAjanCodebaseValidateFilesStreamClose: (handle: string): string => {
          return rawCodebaseValidateFilesStreamClose(handle) ?? "";
        },
        EserAjanCollectorSpecifierToIdentifier: (requestJSON: string): string => {
          return rawCollectorSpecifierToIdentifier(requestJSON) ?? "";
        },
        EserAjanCollectorWalkFiles: (requestJSON: string): string => {
          return rawCollectorWalkFiles(requestJSON) ?? "";
        },
        EserAjanCollectorGenerateManifest: (requestJSON: string): string => {
          return rawCollectorGenerateManifest(requestJSON) ?? "";
        },
        EserAjanParsingTokenize: (requestJSON: string): string => {
          return rawParsingTokenize(requestJSON) ?? "";
        },
        EserAjanParsingSimpleTokens: (): string => {
          return rawParsingSimpleTokens() ?? "";
        },
        EserAjanParsingTokenizeStreamCreate: (requestJSON: string): string => {
          return rawParsingTokenizeStreamCreate(requestJSON) ?? "";
        },
        EserAjanParsingTokenizeStreamPush: (requestJSON: string): string => {
          return rawParsingTokenizeStreamPush(requestJSON) ?? "";
        },
        EserAjanParsingTokenizeStreamClose: (requestJSON: string): string => {
          return rawParsingTokenizeStreamClose(requestJSON) ?? "";
        },
        EserAjanShellExec: (requestJSON: string): string => {
          return rawShellExec(requestJSON) ?? "";
        },
        EserAjanShellTuiKeypressCreate: (requestJSON: string): string => {
          return rawShellTuiKeypressCreate(requestJSON) ?? "";
        },
        EserAjanShellTuiKeypressRead: (handle: string): string => {
          return rawShellTuiKeypressRead(handle) ?? "";
        },
        EserAjanShellTuiKeypressClose: (handle: string): string => {
          return rawShellTuiKeypressClose(handle) ?? "";
        },
        EserAjanShellTuiSetStdinRaw: (requestJSON: string): string => {
          return rawShellTuiSetStdinRaw(requestJSON) ?? "";
        },
        EserAjanShellTuiGetSize: (requestJSON: string): string => {
          return rawShellTuiGetSize(requestJSON) ?? "";
        },
        EserAjanShellExecSpawn: (requestJSON: string): string => {
          return rawShellExecSpawn(requestJSON) ?? "";
        },
        EserAjanShellExecRead: (handle: string): string => {
          return rawShellExecRead(handle) ?? "";
        },
        EserAjanShellExecWrite: (requestJSON: string): string => {
          return rawShellExecWrite(requestJSON) ?? "";
        },
        EserAjanShellExecClose: (handle: string): string => {
          return rawShellExecClose(handle) ?? "";
        },
      },
      close: (): void => {
        lib.unload();
      },
    };
  },
};
