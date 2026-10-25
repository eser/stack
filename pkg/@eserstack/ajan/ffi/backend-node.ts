// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Node.js FFI backend using `node:ffi` (decision-37).
 *
 * node:ffi ships with Node and is on by default since 26.9 (no flag; under
 * `--permission` it needs `--allow-ffi`). The library is opened with one
 * `dlopen` call that declares every export; each returned C string is read
 * with `ffi.toString` and released with `EserAjanFree`, as the M0-T2 spike
 * (TASK-175) measured, and `close` unloads the library. When node:ffi cannot
 * load, `open` throws and the loader falls back to the WASM build.
 *
 * node:ffi is imported dynamically: a static import would fail this module,
 * and with it the loader in `mod.ts`, under `--no-experimental-ffi`, before the
 * WASM fallback could run.
 *
 * @module
 */

import type * as nodeFfi from "node:ffi";
import * as closeGuard from "./close-guard.ts";
import type * as types from "./types.ts";

/** A node:ffi function definition. */
type FfiDefinition = { arguments: string[]; return: string };

const FFI_TYPES: Readonly<Record<string, string>> = {
  "void*": "pointer",
  "const char*": "string",
  int: "int32",
  void: "void",
};

/**
 * Parses a C prototype such as `void* EserAjanCacheList(const char* handle)`
 * into its name and node:ffi definition.
 */
export const parseSignature = (
  signature: string,
): { name: string; definition: FfiDefinition } => {
  const match = /^\s*(.+?)\s*\b(\w+)\s*\((.*)\)\s*$/.exec(signature);
  if (match === null) {
    throw new Error(`unparsable FFI signature: ${signature}`);
  }

  const toType = (cType: string): string => {
    const ffiType =
      FFI_TYPES[cType.replace(/\s+/g, " ").replace(/ \*/g, "*").trim()];
    if (ffiType === undefined) {
      throw new Error(
        `unsupported C type "${cType}" in FFI signature: ${signature}`,
      );
    }

    return ffiType;
  };

  const params = match[3]!.trim();

  return {
    name: match[2]!,
    definition: {
      return: toType(match[1]!),
      arguments:
        params === ""
          ? []
          : params.split(",").map((param) =>
              // Drop the parameter name: "const char* path" -> "const char*".
              toType(param.trim().replace(/\s*\b\w+$/, "")),
            ),
    },
  };
};

/**
 * Opens the eser-ajan library at `libraryPath` through node:ffi.
 *
 * @throws {Error} If node:ffi cannot be imported (Node before 26.9, or
 *   `--no-experimental-ffi`) or `dlopen` fails (a missing or foreign file, or
 *   `--permission` without `--allow-ffi`).
 */
export const open = async (libraryPath: string): Promise<types.FFILibrary> => {
  let ffi: typeof nodeFfi;
  try {
    ffi = await import("node:ffi");
  } catch (error) {
    throw new Error(
      `node:ffi is not available (it needs Node 26.9 or later, and is off under --no-experimental-ffi): ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error },
    );
  }

  // Every export is declared first and bound by one dlopen below; a raw
  // function looks its binding up when it is called.
  const definitions: Record<string, FfiDefinition> = {};
  // oxlint-disable-next-line typescript/no-explicit-any
  let functions: Record<string, (...args: any[]) => any> = {};

  const declare = (signature: string) => {
    const { name, definition } = parseSignature(signature);
    definitions[name] = definition;

    // oxlint-disable-next-line typescript/no-explicit-any
    return (...args: any[]): any => functions[name]!(...args);
  };

  const lib = { func: declare };

  // Every string the bridge returns was allocated by Go with C.CString, i.e.
  // malloc, so the returns are declared as pointers, read, and freed.
  const rawFree = lib.func("void EserAjanFree(void* ptr)");

  // The free sits in a `finally` because it must run even when the read
  // throws: the pointer is malloc'd memory the caller owns.
  const takeString = (ptr: unknown): string => {
    if (ptr === null || ptr === undefined || ptr === 0n) {
      return "";
    }

    try {
      return ffi.toString(ptr as bigint) ?? "";
    } finally {
      rawFree(ptr);
    }
  };

  const rawVersion = lib.func("void* EserAjanVersion()");
  const rawInit = lib.func("int EserAjanInit()");
  const rawShutdown = lib.func("void EserAjanShutdown()");
  const rawConfigLoad = lib.func("void* EserAjanConfigLoad(const char* path)");
  const rawDIResolve = lib.func("void* EserAjanDIResolve(const char* name)");
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
  const rawLogClose = lib.func("void* EserAjanLogClose(const char* handle)");
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
  const rawHttpClose = lib.func("void* EserAjanHttpClose(const char* handle)");
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
  const rawCacheList = lib.func("void* EserAjanCacheList(const char* handle)");
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
  const rawCsSync = lib.func("void* EserAjanCsSync(const char* requestJSON)");
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

  // The definitions are built from the prototype strings at run time, so
  // their literal types are unknown to the compiler.
  const opened = ffi.dlopen(
    libraryPath,
    definitions as nodeFfi.FunctionDefinitions,
  );
  functions = opened.functions;

  return closeGuard.withCloseGuard(
    "node",
    {
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
      // LIMITATION: node:ffi calls are synchronous, so this -- like the
      // stream and batch calls below -- is a BLOCKING FFI call. A generation
      // runs for seconds to minutes and parks the entire event loop for its
      // duration: timers, sockets and every other request stall, and the
      // abort listener that would call EserAjanAiCancelRequest cannot run, so
      // the call is uncancellable once entered even though types.ts documents
      // it as cancellable. The worker threads of decision-37 (M2-T8) move
      // these calls off the main thread.
      EserAjanAiGenerateText: (
        modelHandle: string,
        optionsJSON: string,
      ): string => {
        return takeString(rawAiGenerateText(modelHandle, optionsJSON));
      },
      // LIMITATION: blocking and uncancellable mid-call, see
      // EserAjanAiGenerateText above.
      EserAjanAiStreamText: (
        modelHandle: string,
        optionsJSON: string,
      ): string => {
        return takeString(rawAiStreamText(modelHandle, optionsJSON));
      },
      // LIMITATION: blocking, see EserAjanAiGenerateText above -- each read
      // parks the event loop until the provider emits the next event. The
      // loop only gets to run between reads.
      EserAjanAiStreamRead: (streamHandle: string): string => {
        return takeString(rawAiStreamRead(streamHandle));
      },
      // Synchronous, like everything else here, but harmlessly so: it only
      // flips a flag under a mutex. It can still cancel a stream, because the
      // event loop gets to run between reads -- never a generation already
      // inside the call, per the limitation above.
      EserAjanAiCancelRequest: (requestJSON: string): string => {
        return takeString(rawAiCancelRequest(requestJSON));
      },
      EserAjanAiCloseModel: (modelHandle: string): string => {
        return takeString(rawAiCloseModel(modelHandle));
      },
      EserAjanAiFreeStream: (streamHandle: string): string => {
        return takeString(rawAiFreeStream(streamHandle));
      },
      // LIMITATION: the five batch calls below are network round-trips made
      // as blocking FFI calls, see EserAjanAiGenerateText above.
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
      EserAjanCodebaseWalkFilesStreamCreate: (requestJSON: string): string => {
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
      EserAjanCollectorSpecifierToIdentifier: (requestJSON: string): string => {
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
      // LIMITATION: node:ffi calls are synchronous, so this blocking read is
      // wrapped in a resolved Promise to satisfy the interface. While an idle
      // PTY waits for output the Node event loop is parked; the worker-thread
      // pattern of decision-37 (M2-T8) moves it off the main thread.
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
    () => {
      opened.lib.close();
    },
  );
};
