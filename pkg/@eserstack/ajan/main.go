//go:build !wasip1

package main

/*
#include <stdlib.h>
*/
import "C"

import (
	"unsafe"
)

// Every exported symbol in this file is an ABI contract with the FFI hosts
// (Deno/Node/Bun): the names, their order and their signatures must not change.
//
// Each body funnels through a guard from panic_guard.go. A panic escaping an
// exported function unwinds through cgo and aborts the host process, so the
// guard is what stands between a bug in a downstream fx package and a dead
// Deno/Node/Bun runtime. The C.GoString calls live inside the guarded closure
// on purpose, so argument marshalling is covered too.

//export EserAjanVersion
func EserAjanVersion() *C.char {
	return C.CString(guardString(bridgeVersion))
}

//export EserAjanInit
func EserAjanInit() C.int {
	return C.int(guardInt(bridgeInit))
}

//export EserAjanShutdown
func EserAjanShutdown() {
	guardVoid(bridgeShutdown)
}

//export EserAjanFree
func EserAjanFree(ptr *C.char) {
	guardVoid(func() {
		if ptr != nil {
			C.free(unsafe.Pointer(ptr))
		}
	})
}

//export EserAjanDIResolve
func EserAjanDIResolve(name *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeDIResolve(C.GoString(name))
	}))
}

// ---------------------------------------------------------------------------
// AI exports
// ---------------------------------------------------------------------------

//export EserAjanAiCreateModel
func EserAjanAiCreateModel(configJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeAiCreateModel(C.GoString(configJSON))
	}))
}

//export EserAjanAiGenerateText
func EserAjanAiGenerateText(modelHandle, optionsJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeAiGenerateText(C.GoString(modelHandle), C.GoString(optionsJSON))
	}))
}

//export EserAjanAiStreamText
func EserAjanAiStreamText(modelHandle, optionsJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeAiStreamText(C.GoString(modelHandle), C.GoString(optionsJSON))
	}))
}

//export EserAjanAiStreamRead
func EserAjanAiStreamRead(streamHandle *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeAiStreamRead(C.GoString(streamHandle))
	}))
}

//export EserAjanAiCancelRequest
func EserAjanAiCancelRequest(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeAiCancelRequest(C.GoString(requestJSON))
	}))
}

//export EserAjanAiCloseModel
func EserAjanAiCloseModel(modelHandle *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeAiCloseModel(C.GoString(modelHandle))
	}))
}

//export EserAjanAiFreeStream
func EserAjanAiFreeStream(streamHandle *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeAiFreeStream(C.GoString(streamHandle))
	}))
}

// ---------------------------------------------------------------------------
// AI batch exports
// ---------------------------------------------------------------------------

//export EserAjanAiBatchCreate
func EserAjanAiBatchCreate(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeAiBatchCreate(C.GoString(requestJSON))
	}))
}

//export EserAjanAiBatchGet
func EserAjanAiBatchGet(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeAiBatchGet(C.GoString(requestJSON))
	}))
}

//export EserAjanAiBatchList
func EserAjanAiBatchList(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeAiBatchList(C.GoString(requestJSON))
	}))
}

//export EserAjanAiBatchDownload
func EserAjanAiBatchDownload(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeAiBatchDownload(C.GoString(requestJSON))
	}))
}

//export EserAjanAiBatchCancel
func EserAjanAiBatchCancel(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeAiBatchCancel(C.GoString(requestJSON))
	}))
}

// ---------------------------------------------------------------------------
// Format exports
// ---------------------------------------------------------------------------

//export EserAjanFormatEncode
func EserAjanFormatEncode(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeFormatEncode(C.GoString(requestJSON))
	}))
}

//export EserAjanFormatDecode
func EserAjanFormatDecode(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeFormatDecode(C.GoString(requestJSON))
	}))
}

//export EserAjanFormatList
func EserAjanFormatList() *C.char {
	return C.CString(guardString(bridgeFormatList))
}

//export EserAjanFormatEncodeDocument
func EserAjanFormatEncodeDocument(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeFormatEncodeDocument(C.GoString(requestJSON))
	}))
}

// ---------------------------------------------------------------------------
// Log exports
// ---------------------------------------------------------------------------

//export EserAjanLogCreate
func EserAjanLogCreate(configJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeLogCreate(C.GoString(configJSON))
	}))
}

//export EserAjanLogWrite
func EserAjanLogWrite(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeLogWrite(C.GoString(requestJSON))
	}))
}

//export EserAjanLogClose
func EserAjanLogClose(handle *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeLogClose(C.GoString(handle))
	}))
}

//export EserAjanLogShouldLog
func EserAjanLogShouldLog(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeLogShouldLog(C.GoString(requestJSON))
	}))
}

//export EserAjanLogConfigure
func EserAjanLogConfigure(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeLogConfigure(C.GoString(requestJSON))
	}))
}

// ---------------------------------------------------------------------------
// Config exports
// ---------------------------------------------------------------------------

//export EserAjanConfigLoad
func EserAjanConfigLoad(optionsJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeConfigLoad(C.GoString(optionsJSON))
	}))
}

// ---------------------------------------------------------------------------
// HTTP exports
// ---------------------------------------------------------------------------

//export EserAjanHttpCreate
func EserAjanHttpCreate(configJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeHttpCreate(C.GoString(configJSON))
	}))
}

//export EserAjanHttpRequest
func EserAjanHttpRequest(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeHttpRequest(C.GoString(requestJSON))
	}))
}

//export EserAjanHttpClose
func EserAjanHttpClose(handle *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeHttpClose(C.GoString(handle))
	}))
}

//export EserAjanHttpRequestStream
func EserAjanHttpRequestStream(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeHttpRequestStream(C.GoString(requestJSON))
	}))
}

//export EserAjanHttpStreamRead
func EserAjanHttpStreamRead(handle *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeHttpStreamRead(C.GoString(handle))
	}))
}

//export EserAjanHttpStreamClose
func EserAjanHttpStreamClose(handle *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeHttpStreamClose(C.GoString(handle))
	}))
}

// ---------------------------------------------------------------------------
// Noskills exports
// ---------------------------------------------------------------------------

//export EserAjanNoskillsInit
func EserAjanNoskillsInit(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeNoskillsInit(C.GoString(requestJSON))
	}))
}

//export EserAjanNoskillsSpecNew
func EserAjanNoskillsSpecNew(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeNoskillsSpecNew(C.GoString(requestJSON))
	}))
}

//export EserAjanNoskillsNext
func EserAjanNoskillsNext(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeNoskillsNext(C.GoString(requestJSON))
	}))
}

// ---------------------------------------------------------------------------
// Workflow exports
// ---------------------------------------------------------------------------

//export EserAjanWorkflowRun
func EserAjanWorkflowRun(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeWorkflowRun(C.GoString(requestJSON))
	}))
}

// ---------------------------------------------------------------------------
// Crypto exports
// ---------------------------------------------------------------------------

//export EserAjanCryptoHash
func EserAjanCryptoHash(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeCryptoHash(C.GoString(requestJSON))
	}))
}

// ---------------------------------------------------------------------------
// Cache exports
// ---------------------------------------------------------------------------

//export EserAjanCacheCreate
func EserAjanCacheCreate(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeCacheCreate(C.GoString(requestJSON))
	}))
}

//export EserAjanCacheGetDir
func EserAjanCacheGetDir(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeCacheGetDir(C.GoString(requestJSON))
	}))
}

//export EserAjanCacheGetVersionedPath
func EserAjanCacheGetVersionedPath(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeCacheGetVersionedPath(C.GoString(requestJSON))
	}))
}

//export EserAjanCacheList
func EserAjanCacheList(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeCacheList(C.GoString(requestJSON))
	}))
}

//export EserAjanCacheRemove
func EserAjanCacheRemove(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeCacheRemove(C.GoString(requestJSON))
	}))
}

//export EserAjanCacheClear
func EserAjanCacheClear(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeCacheClear(C.GoString(requestJSON))
	}))
}

//export EserAjanCacheClose
func EserAjanCacheClose(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeCacheClose(C.GoString(requestJSON))
	}))
}

// ---------------------------------------------------------------------------
// CS (Kubernetes ConfigMap/Secret) exports
// ---------------------------------------------------------------------------

//export EserAjanCsGenerate
func EserAjanCsGenerate(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeCsGenerate(C.GoString(requestJSON))
	}))
}

//export EserAjanCsSync
func EserAjanCsSync(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeCsSync(C.GoString(requestJSON))
	}))
}

// ---------------------------------------------------------------------------
// Kit (recipe/scaffolding) exports
// ---------------------------------------------------------------------------

//export EserAjanKitListRecipes
func EserAjanKitListRecipes(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeKitListRecipes(C.GoString(requestJSON))
	}))
}

//export EserAjanKitApplyRecipe
func EserAjanKitApplyRecipe(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeKitApplyRecipe(C.GoString(requestJSON))
	}))
}

//export EserAjanKitCloneRecipe
func EserAjanKitCloneRecipe(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeKitCloneRecipe(C.GoString(requestJSON))
	}))
}

//export EserAjanKitNewProject
func EserAjanKitNewProject(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeKitNewProject(C.GoString(requestJSON))
	}))
}

//export EserAjanKitUpdateRecipe
func EserAjanKitUpdateRecipe(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeKitUpdateRecipe(C.GoString(requestJSON))
	}))
}

// ---------------------------------------------------------------------------
// Posts (social media) exports
// ---------------------------------------------------------------------------

//export EserAjanPostsCreateService
func EserAjanPostsCreateService(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgePostsCreateService(C.GoString(requestJSON))
	}))
}

//export EserAjanPostsCompose
func EserAjanPostsCompose(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgePostsCompose(C.GoString(requestJSON))
	}))
}

//export EserAjanPostsGetTimeline
func EserAjanPostsGetTimeline(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgePostsGetTimeline(C.GoString(requestJSON))
	}))
}

//export EserAjanPostsSearch
func EserAjanPostsSearch(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgePostsSearch(C.GoString(requestJSON))
	}))
}

//export EserAjanPostsClose
func EserAjanPostsClose(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgePostsClose(C.GoString(requestJSON))
	}))
}

// ---------------------------------------------------------------------------
// Codebase exports
// ---------------------------------------------------------------------------

//export EserAjanCodebaseGitCurrentBranch
func EserAjanCodebaseGitCurrentBranch(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeCodebaseGitCurrentBranch(C.GoString(requestJSON))
	}))
}

//export EserAjanCodebaseGitLatestTag
func EserAjanCodebaseGitLatestTag(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeCodebaseGitLatestTag(C.GoString(requestJSON))
	}))
}

//export EserAjanCodebaseGitLog
func EserAjanCodebaseGitLog(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeCodebaseGitLog(C.GoString(requestJSON))
	}))
}

//export EserAjanCodebaseValidateCommitMsg
func EserAjanCodebaseValidateCommitMsg(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeCodebaseValidateCommitMsg(C.GoString(requestJSON))
	}))
}

//export EserAjanCodebaseGenerateChangelog
func EserAjanCodebaseGenerateChangelog(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeCodebaseGenerateChangelog(C.GoString(requestJSON))
	}))
}

//export EserAjanCodebaseBumpVersion
func EserAjanCodebaseBumpVersion(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeCodebaseBumpVersion(C.GoString(requestJSON))
	}))
}

//export EserAjanCodebaseWalkFiles
func EserAjanCodebaseWalkFiles(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeCodebaseWalkFiles(C.GoString(requestJSON))
	}))
}

//export EserAjanCodebaseValidateFiles
func EserAjanCodebaseValidateFiles(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeCodebaseValidateFiles(C.GoString(requestJSON))
	}))
}

//export EserAjanCodebaseCheckCircularDeps
func EserAjanCodebaseCheckCircularDeps(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeCodebaseCheckCircularDeps(C.GoString(requestJSON))
	}))
}

//export EserAjanCodebaseCheckExportNames
func EserAjanCodebaseCheckExportNames(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeCodebaseCheckExportNames(C.GoString(requestJSON))
	}))
}

//export EserAjanCodebaseCheckModExports
func EserAjanCodebaseCheckModExports(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeCodebaseCheckModExports(C.GoString(requestJSON))
	}))
}

//export EserAjanCodebaseCheckPackageConfigs
func EserAjanCodebaseCheckPackageConfigs(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeCodebaseCheckPackageConfigs(C.GoString(requestJSON))
	}))
}

//export EserAjanCodebaseCheckDocs
func EserAjanCodebaseCheckDocs(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeCodebaseCheckDocs(C.GoString(requestJSON))
	}))
}

// ---------------------------------------------------------------------------
// Codebase streaming exports
// ---------------------------------------------------------------------------

//export EserAjanCodebaseWalkFilesStreamCreate
func EserAjanCodebaseWalkFilesStreamCreate(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeCodebaseWalkFilesStreamCreate(C.GoString(requestJSON))
	}))
}

//export EserAjanCodebaseWalkFilesStreamRead
func EserAjanCodebaseWalkFilesStreamRead(handle *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeCodebaseWalkFilesStreamRead(C.GoString(handle))
	}))
}

//export EserAjanCodebaseWalkFilesStreamClose
func EserAjanCodebaseWalkFilesStreamClose(handle *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeCodebaseWalkFilesStreamClose(C.GoString(handle))
	}))
}

//export EserAjanCodebaseValidateFilesStreamCreate
func EserAjanCodebaseValidateFilesStreamCreate(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeCodebaseValidateFilesStreamCreate(C.GoString(requestJSON))
	}))
}

//export EserAjanCodebaseValidateFilesStreamRead
func EserAjanCodebaseValidateFilesStreamRead(handle *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeCodebaseValidateFilesStreamRead(C.GoString(handle))
	}))
}

//export EserAjanCodebaseValidateFilesStreamClose
func EserAjanCodebaseValidateFilesStreamClose(handle *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeCodebaseValidateFilesStreamClose(C.GoString(handle))
	}))
}

// ---------------------------------------------------------------------------
// Collector exports
// ---------------------------------------------------------------------------

//export EserAjanCollectorSpecifierToIdentifier
func EserAjanCollectorSpecifierToIdentifier(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeCollectorSpecifierToIdentifier(C.GoString(requestJSON))
	}))
}

//export EserAjanCollectorWalkFiles
func EserAjanCollectorWalkFiles(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeCollectorWalkFiles(C.GoString(requestJSON))
	}))
}

//export EserAjanCollectorGenerateManifest
func EserAjanCollectorGenerateManifest(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeCollectorGenerateManifest(C.GoString(requestJSON))
	}))
}

// ---------------------------------------------------------------------------
// Parsing exports
// ---------------------------------------------------------------------------

//export EserAjanParsingTokenize
func EserAjanParsingTokenize(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeParsingTokenize(C.GoString(requestJSON))
	}))
}

//export EserAjanParsingSimpleTokens
func EserAjanParsingSimpleTokens() *C.char {
	return C.CString(guardString(bridgeParsingSimpleTokens))
}

//export EserAjanParsingTokenizeStreamCreate
func EserAjanParsingTokenizeStreamCreate(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeParsingTokenizerCreate(C.GoString(requestJSON))
	}))
}

//export EserAjanParsingTokenizeStreamPush
func EserAjanParsingTokenizeStreamPush(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeParsingTokenizerPush(C.GoString(requestJSON))
	}))
}

//export EserAjanParsingTokenizeStreamClose
func EserAjanParsingTokenizeStreamClose(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeParsingTokenizerClose(C.GoString(requestJSON))
	}))
}

// ---------------------------------------------------------------------------
// Shell exec exports
// ---------------------------------------------------------------------------

//export EserAjanShellExec
func EserAjanShellExec(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeShellExec(C.GoString(requestJSON))
	}))
}

// ---------------------------------------------------------------------------
// Shell exec spawn exports (bidirectional, §20 streaming)
// ---------------------------------------------------------------------------

//export EserAjanShellExecSpawn
func EserAjanShellExecSpawn(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeShellExecSpawn(C.GoString(requestJSON))
	}))
}

//export EserAjanShellExecRead
func EserAjanShellExecRead(handle *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeShellExecRead(C.GoString(handle))
	}))
}

//export EserAjanShellExecWrite
func EserAjanShellExecWrite(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeShellExecWrite(C.GoString(requestJSON))
	}))
}

//export EserAjanShellExecClose
func EserAjanShellExecClose(handle *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeShellExecClose(C.GoString(handle))
	}))
}

// ---------------------------------------------------------------------------
// Shell PTY exports (real pseudo-terminal, bidirectional, §20 streaming)
// ---------------------------------------------------------------------------

//export EserAjanShellPtySpawn
func EserAjanShellPtySpawn(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeShellPtySpawn(C.GoString(requestJSON))
	}))
}

//export EserAjanShellPtyRead
func EserAjanShellPtyRead(handle *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeShellPtyRead(C.GoString(handle))
	}))
}

//export EserAjanShellPtyWrite
func EserAjanShellPtyWrite(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeShellPtyWrite(C.GoString(requestJSON))
	}))
}

//export EserAjanShellPtyResize
func EserAjanShellPtyResize(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeShellPtyResize(C.GoString(requestJSON))
	}))
}

//export EserAjanShellPtyKill
func EserAjanShellPtyKill(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeShellPtyKill(C.GoString(requestJSON))
	}))
}

//export EserAjanShellPtyClose
func EserAjanShellPtyClose(handle *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeShellPtyClose(C.GoString(handle))
	}))
}

// ---------------------------------------------------------------------------
// Shell TUI exports
// ---------------------------------------------------------------------------

//export EserAjanShellTuiKeypressCreate
func EserAjanShellTuiKeypressCreate(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeShellTuiKeypressCreate(C.GoString(requestJSON))
	}))
}

//export EserAjanShellTuiKeypressRead
func EserAjanShellTuiKeypressRead(handle *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeShellTuiKeypressRead(C.GoString(handle))
	}))
}

//export EserAjanShellTuiKeypressClose
func EserAjanShellTuiKeypressClose(handle *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeShellTuiKeypressClose(C.GoString(handle))
	}))
}

//export EserAjanShellTuiSetStdinRaw
func EserAjanShellTuiSetStdinRaw(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeShellTuiSetStdinRaw(C.GoString(requestJSON))
	}))
}

//export EserAjanShellTuiGetSize
func EserAjanShellTuiGetSize(requestJSON *C.char) *C.char {
	return C.CString(guardString(func() string {
		return bridgeShellTuiGetSize(C.GoString(requestJSON))
	}))
}

func main() {}
