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
    // Opaque specifier, so `deno compile` cannot resolve it statically.
    //
    // This backend only ever runs under Node -- isAvailable() above requires
    // process.versions.node and the absence of Deno and Bun. But a literal
    // `import("koffi")` is resolvable at compile time, so deno compile embedded
    // koffi AND all 16 of its per-platform native packages (darwin, linux,
    // freebsd, openbsd, ia32, riscv64, loong64 ...) into every Deno binary,
    // which uses Deno.dlopen and can never call this code.
    //
    // Same trick as noskills/commands/web.ts. Under Node the import resolves
    // normally at runtime.
    const specifier = "koffi";
    // deno-lint-ignore no-explicit-any
    let koffi: any = await import(specifier);
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

    // Every string the bridge returns was allocated by Go with C.CString, i.e.
    // malloc. Declaring the return as `char*` lets koffi copy it into a JS
    // string, but the original allocation then becomes unreachable and leaks --
    // across 96 symbols that is every call this process ever makes. So the
    // returns are declared as opaque `void*`, decoded explicitly, and freed.
    //
    // The decode form matters: koffi.decode(ptr, "str" | "string" | "char*")
    // all treat ptr as pointing *to* a char* and dereference it, which
    // segfaults. koffi.decode(ptr, "char", -1) reads the NUL-terminated bytes
    // at ptr itself, which is what the bridge actually returns.
    const rawFree = lib.func("void EserAjanFree(void* ptr)");

    const takeString = (ptr: unknown): string => {
      if (ptr === null || ptr === undefined) {
        return "";
      }

      const decoded = koffi.decode(ptr, "char", -1) as string | null;
      rawFree(ptr);

      return decoded ?? "";
    };

    const rawVersion = lib.func("void* EserAjanVersion()");
    const rawInit = lib.func("int EserAjanInit()");
    const rawShutdown = lib.func("void EserAjanShutdown()");
    const rawConfigLoad = lib.func(
      "void* EserAjanConfigLoad(const char* path)",
    );
    const rawDIResolve = lib.func(
      "void* EserAjanDIResolve(const char* name)",
    );
    const rawAiCreateModel = lib.func(
      "void* EserAjanAiCreateModel(const char* configJSON)",
    );
    const rawAiGenerateText = lib.func(
      "void* EserAjanAiGenerateText(const char* modelHandle, const char* optionsJSON)",
    );
    const rawAiStreamText = lib.func(
      "void* EserAjanAiStreamText(const char* modelHandle, const char* optionsJSON)",
    );
    const rawAiStreamRead = lib.func(
      "void* EserAjanAiStreamRead(const char* streamHandle)",
    );
    const rawAiCancelRequest = lib.func(
      "void* EserAjanAiCancelRequest(const char* requestJSON)",
    );
    const rawAiCloseModel = lib.func(
      "void* EserAjanAiCloseModel(const char* modelHandle)",
    );
    const rawAiFreeStream = lib.func(
      "void* EserAjanAiFreeStream(const char* streamHandle)",
    );
    const rawAiBatchCreate = lib.func(
      "void* EserAjanAiBatchCreate(const char* requestJSON)",
    );
    const rawAiBatchGet = lib.func(
      "void* EserAjanAiBatchGet(const char* requestJSON)",
    );
    const rawAiBatchList = lib.func(
      "void* EserAjanAiBatchList(const char* requestJSON)",
    );
    const rawAiBatchDownload = lib.func(
      "void* EserAjanAiBatchDownload(const char* requestJSON)",
    );
    const rawAiBatchCancel = lib.func(
      "void* EserAjanAiBatchCancel(const char* requestJSON)",
    );
    const rawFormatEncode = lib.func(
      "void* EserAjanFormatEncode(const char* requestJSON)",
    );
    const rawFormatDecode = lib.func(
      "void* EserAjanFormatDecode(const char* requestJSON)",
    );
    const rawFormatList = lib.func("void* EserAjanFormatList()");
    const rawFormatEncodeDocument = lib.func(
      "void* EserAjanFormatEncodeDocument(const char* requestJSON)",
    );
    const rawLogCreate = lib.func(
      "void* EserAjanLogCreate(const char* configJSON)",
    );
    const rawLogWrite = lib.func(
      "void* EserAjanLogWrite(const char* requestJSON)",
    );
    const rawLogClose = lib.func(
      "void* EserAjanLogClose(const char* handle)",
    );
    const rawLogShouldLog = lib.func(
      "void* EserAjanLogShouldLog(const char* requestJSON)",
    );
    const rawLogConfigure = lib.func(
      "void* EserAjanLogConfigure(const char* requestJSON)",
    );
    const rawHttpCreate = lib.func(
      "void* EserAjanHttpCreate(const char* configJSON)",
    );
    const rawHttpRequest = lib.func(
      "void* EserAjanHttpRequest(const char* requestJSON)",
    );
    const rawHttpClose = lib.func(
      "void* EserAjanHttpClose(const char* handle)",
    );
    const rawHttpRequestStream = lib.func(
      "void* EserAjanHttpRequestStream(const char* requestJSON)",
    );
    const rawHttpStreamRead = lib.func(
      "void* EserAjanHttpStreamRead(const char* handle)",
    );
    const rawHttpStreamClose = lib.func(
      "void* EserAjanHttpStreamClose(const char* handle)",
    );
    const rawNoskillsInit = lib.func(
      "void* EserAjanNoskillsInit(const char* requestJSON)",
    );
    const rawNoskillsSpecNew = lib.func(
      "void* EserAjanNoskillsSpecNew(const char* requestJSON)",
    );
    const rawNoskillsNext = lib.func(
      "void* EserAjanNoskillsNext(const char* requestJSON)",
    );
    const rawWorkflowRun = lib.func(
      "void* EserAjanWorkflowRun(const char* requestJSON)",
    );
    const rawCryptoHash = lib.func(
      "void* EserAjanCryptoHash(const char* requestJSON)",
    );
    const rawCacheCreate = lib.func(
      "void* EserAjanCacheCreate(const char* requestJSON)",
    );
    const rawCacheGetDir = lib.func(
      "void* EserAjanCacheGetDir(const char* handle)",
    );
    const rawCacheGetVersionedPath = lib.func(
      "void* EserAjanCacheGetVersionedPath(const char* requestJSON)",
    );
    const rawCacheList = lib.func(
      "void* EserAjanCacheList(const char* handle)",
    );
    const rawCacheRemove = lib.func(
      "void* EserAjanCacheRemove(const char* requestJSON)",
    );
    const rawCacheClear = lib.func(
      "void* EserAjanCacheClear(const char* handle)",
    );
    const rawCacheClose = lib.func(
      "void* EserAjanCacheClose(const char* handle)",
    );
    const rawCsGenerate = lib.func(
      "void* EserAjanCsGenerate(const char* requestJSON)",
    );
    const rawCsSync = lib.func(
      "void* EserAjanCsSync(const char* requestJSON)",
    );
    const rawKitListRecipes = lib.func(
      "void* EserAjanKitListRecipes(const char* requestJSON)",
    );
    const rawKitApplyRecipe = lib.func(
      "void* EserAjanKitApplyRecipe(const char* requestJSON)",
    );
    const rawKitCloneRecipe = lib.func(
      "void* EserAjanKitCloneRecipe(const char* requestJSON)",
    );
    const rawKitNewProject = lib.func(
      "void* EserAjanKitNewProject(const char* requestJSON)",
    );
    const rawKitUpdateRecipe = lib.func(
      "void* EserAjanKitUpdateRecipe(const char* requestJSON)",
    );
    const rawPostsCreateService = lib.func(
      "void* EserAjanPostsCreateService(const char* requestJSON)",
    );
    const rawPostsCompose = lib.func(
      "void* EserAjanPostsCompose(const char* requestJSON)",
    );
    const rawPostsGetTimeline = lib.func(
      "void* EserAjanPostsGetTimeline(const char* requestJSON)",
    );
    const rawPostsSearch = lib.func(
      "void* EserAjanPostsSearch(const char* requestJSON)",
    );
    const rawPostsClose = lib.func(
      "void* EserAjanPostsClose(const char* requestJSON)",
    );
    const rawCodebaseGitCurrentBranch = lib.func(
      "void* EserAjanCodebaseGitCurrentBranch(const char* requestJSON)",
    );
    const rawCodebaseGitLatestTag = lib.func(
      "void* EserAjanCodebaseGitLatestTag(const char* requestJSON)",
    );
    const rawCodebaseGitLog = lib.func(
      "void* EserAjanCodebaseGitLog(const char* requestJSON)",
    );
    const rawCodebaseValidateCommitMsg = lib.func(
      "void* EserAjanCodebaseValidateCommitMsg(const char* requestJSON)",
    );
    const rawCodebaseGenerateChangelog = lib.func(
      "void* EserAjanCodebaseGenerateChangelog(const char* requestJSON)",
    );
    const rawCodebaseBumpVersion = lib.func(
      "void* EserAjanCodebaseBumpVersion(const char* requestJSON)",
    );
    const rawCodebaseWalkFiles = lib.func(
      "void* EserAjanCodebaseWalkFiles(const char* requestJSON)",
    );
    const rawCodebaseValidateFiles = lib.func(
      "void* EserAjanCodebaseValidateFiles(const char* requestJSON)",
    );
    const rawCodebaseCheckCircularDeps = lib.func(
      "void* EserAjanCodebaseCheckCircularDeps(const char* requestJSON)",
    );
    const rawCodebaseCheckExportNames = lib.func(
      "void* EserAjanCodebaseCheckExportNames(const char* requestJSON)",
    );
    const rawCodebaseCheckModExports = lib.func(
      "void* EserAjanCodebaseCheckModExports(const char* requestJSON)",
    );
    const rawCodebaseCheckPackageConfigs = lib.func(
      "void* EserAjanCodebaseCheckPackageConfigs(const char* requestJSON)",
    );
    const rawCodebaseCheckDocs = lib.func(
      "void* EserAjanCodebaseCheckDocs(const char* requestJSON)",
    );
    const rawCodebaseWalkFilesStreamCreate = lib.func(
      "void* EserAjanCodebaseWalkFilesStreamCreate(const char* requestJSON)",
    );
    const rawCodebaseWalkFilesStreamRead = lib.func(
      "void* EserAjanCodebaseWalkFilesStreamRead(const char* handle)",
    );
    const rawCodebaseWalkFilesStreamClose = lib.func(
      "void* EserAjanCodebaseWalkFilesStreamClose(const char* handle)",
    );
    const rawCodebaseValidateFilesStreamCreate = lib.func(
      "void* EserAjanCodebaseValidateFilesStreamCreate(const char* requestJSON)",
    );
    const rawCodebaseValidateFilesStreamRead = lib.func(
      "void* EserAjanCodebaseValidateFilesStreamRead(const char* handle)",
    );
    const rawCodebaseValidateFilesStreamClose = lib.func(
      "void* EserAjanCodebaseValidateFilesStreamClose(const char* handle)",
    );
    const rawCollectorSpecifierToIdentifier = lib.func(
      "void* EserAjanCollectorSpecifierToIdentifier(const char* requestJSON)",
    );
    const rawCollectorWalkFiles = lib.func(
      "void* EserAjanCollectorWalkFiles(const char* requestJSON)",
    );
    const rawCollectorGenerateManifest = lib.func(
      "void* EserAjanCollectorGenerateManifest(const char* requestJSON)",
    );
    const rawParsingTokenize = lib.func(
      "void* EserAjanParsingTokenize(const char* requestJSON)",
    );
    const rawParsingSimpleTokens = lib.func(
      "void* EserAjanParsingSimpleTokens()",
    );
    const rawParsingTokenizeStreamCreate = lib.func(
      "void* EserAjanParsingTokenizeStreamCreate(const char* requestJSON)",
    );
    const rawParsingTokenizeStreamPush = lib.func(
      "void* EserAjanParsingTokenizeStreamPush(const char* requestJSON)",
    );
    const rawParsingTokenizeStreamClose = lib.func(
      "void* EserAjanParsingTokenizeStreamClose(const char* requestJSON)",
    );
    const rawShellExec = lib.func(
      "void* EserAjanShellExec(const char* requestJSON)",
    );
    const rawShellTuiKeypressCreate = lib.func(
      "void* EserAjanShellTuiKeypressCreate(const char* requestJSON)",
    );
    const rawShellTuiKeypressRead = lib.func(
      "void* EserAjanShellTuiKeypressRead(const char* handle)",
    );
    const rawShellTuiKeypressClose = lib.func(
      "void* EserAjanShellTuiKeypressClose(const char* handle)",
    );
    const rawShellTuiSetStdinRaw = lib.func(
      "void* EserAjanShellTuiSetStdinRaw(const char* requestJSON)",
    );
    const rawShellTuiGetSize = lib.func(
      "void* EserAjanShellTuiGetSize(const char* requestJSON)",
    );
    const rawShellExecSpawn = lib.func(
      "void* EserAjanShellExecSpawn(const char* requestJSON)",
    );
    const rawShellExecRead = lib.func(
      "void* EserAjanShellExecRead(const char* handle)",
    );
    const rawShellExecWrite = lib.func(
      "void* EserAjanShellExecWrite(const char* requestJSON)",
    );
    const rawShellExecClose = lib.func(
      "void* EserAjanShellExecClose(const char* handle)",
    );
    const rawShellPtySpawn = lib.func(
      "void* EserAjanShellPtySpawn(const char* requestJSON)",
    );
    const rawShellPtyRead = lib.func(
      "void* EserAjanShellPtyRead(const char* handle)",
    );
    const rawShellPtyWrite = lib.func(
      "void* EserAjanShellPtyWrite(const char* requestJSON)",
    );
    const rawShellPtyResize = lib.func(
      "void* EserAjanShellPtyResize(const char* requestJSON)",
    );
    const rawShellPtyKill = lib.func(
      "void* EserAjanShellPtyKill(const char* requestJSON)",
    );
    const rawShellPtyClose = lib.func(
      "void* EserAjanShellPtyClose(const char* handle)",
    );

    return {
      symbols: {
        EserAjanVersion: (): string => {
          return takeString(rawVersion());
        },
        EserAjanInit: (): number => {
          return rawInit() as number;
        },
        EserAjanShutdown: (): void => {
          rawShutdown();
        },
        EserAjanFree: (ptr: unknown): void => {
          if (ptr !== null && ptr !== undefined) {
            rawFree(ptr);
          }
        },
        EserAjanConfigLoad: (path: string): string => {
          return takeString(rawConfigLoad(path));
        },
        EserAjanDIResolve: (name: string): string => {
          return takeString(rawDIResolve(name));
        },
        EserAjanAiCreateModel: (configJSON: string): string => {
          return takeString(rawAiCreateModel(configJSON));
        },
        EserAjanAiGenerateText: (
          modelHandle: string,
          optionsJSON: string,
        ): string => {
          return takeString(rawAiGenerateText(modelHandle, optionsJSON));
        },
        EserAjanAiStreamText: (
          modelHandle: string,
          optionsJSON: string,
        ): string => {
          return takeString(rawAiStreamText(modelHandle, optionsJSON));
        },
        EserAjanAiStreamRead: (streamHandle: string): string => {
          return takeString(rawAiStreamRead(streamHandle));
        },
        // Synchronous here: koffi has no off-thread mode in this binding, so
        // the type's Promise option is honoured by Deno alone. Cancellation
        // still works for streams, where the loop yields between reads.
        EserAjanAiCancelRequest: (requestJSON: string): string => {
          return takeString(rawAiCancelRequest(requestJSON));
        },
        EserAjanAiCloseModel: (modelHandle: string): string => {
          return takeString(rawAiCloseModel(modelHandle));
        },
        EserAjanAiFreeStream: (streamHandle: string): string => {
          return takeString(rawAiFreeStream(streamHandle));
        },
        EserAjanAiBatchCreate: (requestJSON: string): string => {
          return takeString(rawAiBatchCreate(requestJSON));
        },
        EserAjanAiBatchGet: (requestJSON: string): string => {
          return takeString(rawAiBatchGet(requestJSON));
        },
        EserAjanAiBatchList: (requestJSON: string): string => {
          return takeString(rawAiBatchList(requestJSON));
        },
        EserAjanAiBatchDownload: (requestJSON: string): string => {
          return takeString(rawAiBatchDownload(requestJSON));
        },
        EserAjanAiBatchCancel: (requestJSON: string): string => {
          return takeString(rawAiBatchCancel(requestJSON));
        },
        EserAjanFormatEncode: (requestJSON: string): string => {
          return takeString(rawFormatEncode(requestJSON));
        },
        EserAjanFormatDecode: (requestJSON: string): string => {
          return takeString(rawFormatDecode(requestJSON));
        },
        EserAjanFormatList: (): string => {
          return takeString(rawFormatList());
        },
        EserAjanFormatEncodeDocument: (requestJSON: string): string => {
          return takeString(rawFormatEncodeDocument(requestJSON));
        },
        EserAjanLogCreate: (configJSON: string): string => {
          return takeString(rawLogCreate(configJSON));
        },
        EserAjanLogWrite: (requestJSON: string): string => {
          return takeString(rawLogWrite(requestJSON));
        },
        EserAjanLogClose: (handle: string): string => {
          return takeString(rawLogClose(handle));
        },
        EserAjanLogShouldLog: (requestJSON: string): string => {
          return takeString(rawLogShouldLog(requestJSON));
        },
        EserAjanLogConfigure: (requestJSON: string): string => {
          return takeString(rawLogConfigure(requestJSON));
        },
        EserAjanHttpCreate: (configJSON: string): string => {
          return takeString(rawHttpCreate(configJSON));
        },
        EserAjanHttpRequest: (requestJSON: string): string => {
          return takeString(rawHttpRequest(requestJSON));
        },
        EserAjanHttpClose: (handle: string): string => {
          return takeString(rawHttpClose(handle));
        },
        EserAjanHttpRequestStream: (requestJSON: string): string => {
          return takeString(rawHttpRequestStream(requestJSON));
        },
        EserAjanHttpStreamRead: (handle: string): string => {
          return takeString(rawHttpStreamRead(handle));
        },
        EserAjanHttpStreamClose: (handle: string): string => {
          return takeString(rawHttpStreamClose(handle));
        },
        EserAjanNoskillsInit: (requestJSON: string): string => {
          return takeString(rawNoskillsInit(requestJSON));
        },
        EserAjanNoskillsSpecNew: (requestJSON: string): string => {
          return takeString(rawNoskillsSpecNew(requestJSON));
        },
        EserAjanNoskillsNext: (requestJSON: string): string => {
          return takeString(rawNoskillsNext(requestJSON));
        },
        EserAjanWorkflowRun: (requestJSON: string): string => {
          return takeString(rawWorkflowRun(requestJSON));
        },
        EserAjanCryptoHash: (requestJSON: string): string => {
          return takeString(rawCryptoHash(requestJSON));
        },
        EserAjanCacheCreate: (requestJSON: string): string => {
          return takeString(rawCacheCreate(requestJSON));
        },
        EserAjanCacheGetDir: (requestJSON: string): string => {
          return takeString(rawCacheGetDir(requestJSON));
        },
        EserAjanCacheGetVersionedPath: (requestJSON: string): string => {
          return takeString(rawCacheGetVersionedPath(requestJSON));
        },
        EserAjanCacheList: (requestJSON: string): string => {
          return takeString(rawCacheList(requestJSON));
        },
        EserAjanCacheRemove: (requestJSON: string): string => {
          return takeString(rawCacheRemove(requestJSON));
        },
        EserAjanCacheClear: (requestJSON: string): string => {
          return takeString(rawCacheClear(requestJSON));
        },
        EserAjanCacheClose: (requestJSON: string): string => {
          return takeString(rawCacheClose(requestJSON));
        },
        EserAjanCsGenerate: (requestJSON: string): string => {
          return takeString(rawCsGenerate(requestJSON));
        },
        EserAjanCsSync: (requestJSON: string): string => {
          return takeString(rawCsSync(requestJSON));
        },
        EserAjanKitListRecipes: (requestJSON: string): string => {
          return takeString(rawKitListRecipes(requestJSON));
        },
        EserAjanKitApplyRecipe: (requestJSON: string): string => {
          return takeString(rawKitApplyRecipe(requestJSON));
        },
        EserAjanKitCloneRecipe: (requestJSON: string): string => {
          return takeString(rawKitCloneRecipe(requestJSON));
        },
        EserAjanKitNewProject: (requestJSON: string): string => {
          return takeString(rawKitNewProject(requestJSON));
        },
        EserAjanKitUpdateRecipe: (requestJSON: string): string => {
          return takeString(rawKitUpdateRecipe(requestJSON));
        },
        EserAjanPostsCreateService: (requestJSON: string): string => {
          return takeString(rawPostsCreateService(requestJSON));
        },
        EserAjanPostsCompose: (requestJSON: string): string => {
          return takeString(rawPostsCompose(requestJSON));
        },
        EserAjanPostsGetTimeline: (requestJSON: string): string => {
          return takeString(rawPostsGetTimeline(requestJSON));
        },
        EserAjanPostsSearch: (requestJSON: string): string => {
          return takeString(rawPostsSearch(requestJSON));
        },
        EserAjanPostsClose: (requestJSON: string): string => {
          return takeString(rawPostsClose(requestJSON));
        },
        EserAjanCodebaseGitCurrentBranch: (requestJSON: string): string => {
          return takeString(rawCodebaseGitCurrentBranch(requestJSON));
        },
        EserAjanCodebaseGitLatestTag: (requestJSON: string): string => {
          return takeString(rawCodebaseGitLatestTag(requestJSON));
        },
        EserAjanCodebaseGitLog: (requestJSON: string): string => {
          return takeString(rawCodebaseGitLog(requestJSON));
        },
        EserAjanCodebaseValidateCommitMsg: (requestJSON: string): string => {
          return takeString(rawCodebaseValidateCommitMsg(requestJSON));
        },
        EserAjanCodebaseGenerateChangelog: (requestJSON: string): string => {
          return takeString(rawCodebaseGenerateChangelog(requestJSON));
        },
        EserAjanCodebaseBumpVersion: (requestJSON: string): string => {
          return takeString(rawCodebaseBumpVersion(requestJSON));
        },
        EserAjanCodebaseWalkFiles: (requestJSON: string): string => {
          return takeString(rawCodebaseWalkFiles(requestJSON));
        },
        EserAjanCodebaseValidateFiles: (requestJSON: string): string => {
          return takeString(rawCodebaseValidateFiles(requestJSON));
        },
        EserAjanCodebaseCheckCircularDeps: (requestJSON: string): string => {
          return takeString(rawCodebaseCheckCircularDeps(requestJSON));
        },
        EserAjanCodebaseCheckExportNames: (requestJSON: string): string => {
          return takeString(rawCodebaseCheckExportNames(requestJSON));
        },
        EserAjanCodebaseCheckModExports: (requestJSON: string): string => {
          return takeString(rawCodebaseCheckModExports(requestJSON));
        },
        EserAjanCodebaseCheckPackageConfigs: (requestJSON: string): string => {
          return takeString(rawCodebaseCheckPackageConfigs(requestJSON));
        },
        EserAjanCodebaseCheckDocs: (requestJSON: string): string => {
          return takeString(rawCodebaseCheckDocs(requestJSON));
        },
        EserAjanCodebaseWalkFilesStreamCreate: (
          requestJSON: string,
        ): string => {
          return takeString(rawCodebaseWalkFilesStreamCreate(requestJSON));
        },
        EserAjanCodebaseWalkFilesStreamRead: (handle: string): string => {
          return takeString(rawCodebaseWalkFilesStreamRead(handle));
        },
        EserAjanCodebaseWalkFilesStreamClose: (handle: string): string => {
          return takeString(rawCodebaseWalkFilesStreamClose(handle));
        },
        EserAjanCodebaseValidateFilesStreamCreate: (
          requestJSON: string,
        ): string => {
          return takeString(rawCodebaseValidateFilesStreamCreate(requestJSON));
        },
        EserAjanCodebaseValidateFilesStreamRead: (handle: string): string => {
          return takeString(rawCodebaseValidateFilesStreamRead(handle));
        },
        EserAjanCodebaseValidateFilesStreamClose: (handle: string): string => {
          return takeString(rawCodebaseValidateFilesStreamClose(handle));
        },
        EserAjanCollectorSpecifierToIdentifier: (
          requestJSON: string,
        ): string => {
          return takeString(rawCollectorSpecifierToIdentifier(requestJSON));
        },
        EserAjanCollectorWalkFiles: (requestJSON: string): string => {
          return takeString(rawCollectorWalkFiles(requestJSON));
        },
        EserAjanCollectorGenerateManifest: (requestJSON: string): string => {
          return takeString(rawCollectorGenerateManifest(requestJSON));
        },
        EserAjanParsingTokenize: (requestJSON: string): string => {
          return takeString(rawParsingTokenize(requestJSON));
        },
        EserAjanParsingSimpleTokens: (): string => {
          return takeString(rawParsingSimpleTokens());
        },
        EserAjanParsingTokenizeStreamCreate: (requestJSON: string): string => {
          return takeString(rawParsingTokenizeStreamCreate(requestJSON));
        },
        EserAjanParsingTokenizeStreamPush: (requestJSON: string): string => {
          return takeString(rawParsingTokenizeStreamPush(requestJSON));
        },
        EserAjanParsingTokenizeStreamClose: (requestJSON: string): string => {
          return takeString(rawParsingTokenizeStreamClose(requestJSON));
        },
        EserAjanShellExec: (requestJSON: string): string => {
          return takeString(rawShellExec(requestJSON));
        },
        EserAjanShellTuiKeypressCreate: (requestJSON: string): string => {
          return takeString(rawShellTuiKeypressCreate(requestJSON));
        },
        EserAjanShellTuiKeypressRead: (handle: string): string => {
          return takeString(rawShellTuiKeypressRead(handle));
        },
        EserAjanShellTuiKeypressClose: (handle: string): string => {
          return takeString(rawShellTuiKeypressClose(handle));
        },
        EserAjanShellTuiSetStdinRaw: (requestJSON: string): string => {
          return takeString(rawShellTuiSetStdinRaw(requestJSON));
        },
        EserAjanShellTuiGetSize: (requestJSON: string): string => {
          return takeString(rawShellTuiGetSize(requestJSON));
        },
        EserAjanShellExecSpawn: (requestJSON: string): string => {
          return takeString(rawShellExecSpawn(requestJSON));
        },
        EserAjanShellExecRead: (handle: string): string => {
          return takeString(rawShellExecRead(handle));
        },
        EserAjanShellExecWrite: (requestJSON: string): string => {
          return takeString(rawShellExecWrite(requestJSON));
        },
        EserAjanShellExecClose: (handle: string): string => {
          return takeString(rawShellExecClose(handle));
        },
        EserAjanShellPtySpawn: (requestJSON: string): string => {
          return takeString(rawShellPtySpawn(requestJSON));
        },
        // LIMITATION: this is a BLOCKING koffi call wrapped in a resolved
        // Promise to satisfy the interface. While an idle PTY waits for output
        // the Node event loop is parked, so write()/kill()/render can't run and
        // multiple panes can't interleave. A true fix needs koffi's async call
        // API; only Deno (nonblocking:true) is fully supported for the
        // interactive multiplexer today. Running it under Node degrades
        // responsiveness.
        EserAjanShellPtyRead: (handle: string): Promise<string> => {
          return Promise.resolve(takeString(rawShellPtyRead(handle)));
        },
        EserAjanShellPtyWrite: (requestJSON: string): string => {
          return takeString(rawShellPtyWrite(requestJSON));
        },
        EserAjanShellPtyResize: (requestJSON: string): string => {
          return takeString(rawShellPtyResize(requestJSON));
        },
        EserAjanShellPtyKill: (requestJSON: string): string => {
          return takeString(rawShellPtyKill(requestJSON));
        },
        EserAjanShellPtyClose: (handle: string): string => {
          return takeString(rawShellPtyClose(handle));
        },
      },
      close: (): void => {
        lib.unload();
      },
    };
  },
};
