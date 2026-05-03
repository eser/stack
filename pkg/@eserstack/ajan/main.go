//go:build !wasip1

package main

/*
#include <stdlib.h>
*/
import "C"

import (
	"unsafe"
)

//export EserAjanVersion
func EserAjanVersion() *C.char {
	return C.CString(bridgeVersion())
}

//export EserAjanInit
func EserAjanInit() C.int {
	return C.int(bridgeInit())
}

//export EserAjanShutdown
func EserAjanShutdown() {
	bridgeShutdown()
}

//export EserAjanFree
func EserAjanFree(ptr *C.char) {
	if ptr != nil {
		C.free(unsafe.Pointer(ptr))
	}
}

//export EserAjanDIResolve
func EserAjanDIResolve(name *C.char) *C.char {
	return C.CString(bridgeDIResolve(C.GoString(name)))
}

// ---------------------------------------------------------------------------
// AI exports
// ---------------------------------------------------------------------------

//export EserAjanAiCreateModel
func EserAjanAiCreateModel(configJSON *C.char) *C.char {
	return C.CString(bridgeAiCreateModel(C.GoString(configJSON)))
}

//export EserAjanAiGenerateText
func EserAjanAiGenerateText(modelHandle, optionsJSON *C.char) *C.char {
	return C.CString(bridgeAiGenerateText(C.GoString(modelHandle), C.GoString(optionsJSON)))
}

//export EserAjanAiStreamText
func EserAjanAiStreamText(modelHandle, optionsJSON *C.char) *C.char {
	return C.CString(bridgeAiStreamText(C.GoString(modelHandle), C.GoString(optionsJSON)))
}

//export EserAjanAiStreamRead
func EserAjanAiStreamRead(streamHandle *C.char) *C.char {
	return C.CString(bridgeAiStreamRead(C.GoString(streamHandle)))
}

//export EserAjanAiCloseModel
func EserAjanAiCloseModel(modelHandle *C.char) *C.char {
	return C.CString(bridgeAiCloseModel(C.GoString(modelHandle)))
}

//export EserAjanAiFreeStream
func EserAjanAiFreeStream(streamHandle *C.char) *C.char {
	return C.CString(bridgeAiFreeStream(C.GoString(streamHandle)))
}

// ---------------------------------------------------------------------------
// AI batch exports
// ---------------------------------------------------------------------------

//export EserAjanAiBatchCreate
func EserAjanAiBatchCreate(requestJSON *C.char) *C.char {
	return C.CString(bridgeAiBatchCreate(C.GoString(requestJSON)))
}

//export EserAjanAiBatchGet
func EserAjanAiBatchGet(requestJSON *C.char) *C.char {
	return C.CString(bridgeAiBatchGet(C.GoString(requestJSON)))
}

//export EserAjanAiBatchList
func EserAjanAiBatchList(requestJSON *C.char) *C.char {
	return C.CString(bridgeAiBatchList(C.GoString(requestJSON)))
}

//export EserAjanAiBatchDownload
func EserAjanAiBatchDownload(requestJSON *C.char) *C.char {
	return C.CString(bridgeAiBatchDownload(C.GoString(requestJSON)))
}

//export EserAjanAiBatchCancel
func EserAjanAiBatchCancel(requestJSON *C.char) *C.char {
	return C.CString(bridgeAiBatchCancel(C.GoString(requestJSON)))
}

// ---------------------------------------------------------------------------
// Format exports
// ---------------------------------------------------------------------------

//export EserAjanFormatEncode
func EserAjanFormatEncode(requestJSON *C.char) *C.char {
	return C.CString(bridgeFormatEncode(C.GoString(requestJSON)))
}

//export EserAjanFormatDecode
func EserAjanFormatDecode(requestJSON *C.char) *C.char {
	return C.CString(bridgeFormatDecode(C.GoString(requestJSON)))
}

//export EserAjanFormatList
func EserAjanFormatList() *C.char {
	return C.CString(bridgeFormatList())
}

//export EserAjanFormatEncodeDocument
func EserAjanFormatEncodeDocument(requestJSON *C.char) *C.char {
	return C.CString(bridgeFormatEncodeDocument(C.GoString(requestJSON)))
}

// ---------------------------------------------------------------------------
// Log exports
// ---------------------------------------------------------------------------

//export EserAjanLogCreate
func EserAjanLogCreate(configJSON *C.char) *C.char {
	return C.CString(bridgeLogCreate(C.GoString(configJSON)))
}

//export EserAjanLogWrite
func EserAjanLogWrite(requestJSON *C.char) *C.char {
	return C.CString(bridgeLogWrite(C.GoString(requestJSON)))
}

//export EserAjanLogClose
func EserAjanLogClose(handle *C.char) *C.char {
	return C.CString(bridgeLogClose(C.GoString(handle)))
}

//export EserAjanLogShouldLog
func EserAjanLogShouldLog(requestJSON *C.char) *C.char {
	return C.CString(bridgeLogShouldLog(C.GoString(requestJSON)))
}

//export EserAjanLogConfigure
func EserAjanLogConfigure(requestJSON *C.char) *C.char {
	return C.CString(bridgeLogConfigure(C.GoString(requestJSON)))
}

// ---------------------------------------------------------------------------
// Config exports
// ---------------------------------------------------------------------------

//export EserAjanConfigLoad
func EserAjanConfigLoad(optionsJSON *C.char) *C.char {
	return C.CString(bridgeConfigLoad(C.GoString(optionsJSON)))
}

// ---------------------------------------------------------------------------
// HTTP exports
// ---------------------------------------------------------------------------

//export EserAjanHttpCreate
func EserAjanHttpCreate(configJSON *C.char) *C.char {
	return C.CString(bridgeHttpCreate(C.GoString(configJSON)))
}

//export EserAjanHttpRequest
func EserAjanHttpRequest(requestJSON *C.char) *C.char {
	return C.CString(bridgeHttpRequest(C.GoString(requestJSON)))
}

//export EserAjanHttpClose
func EserAjanHttpClose(handle *C.char) *C.char {
	return C.CString(bridgeHttpClose(C.GoString(handle)))
}

//export EserAjanHttpRequestStream
func EserAjanHttpRequestStream(requestJSON *C.char) *C.char {
	return C.CString(bridgeHttpRequestStream(C.GoString(requestJSON)))
}

//export EserAjanHttpStreamRead
func EserAjanHttpStreamRead(handle *C.char) *C.char {
	return C.CString(bridgeHttpStreamRead(C.GoString(handle)))
}

//export EserAjanHttpStreamClose
func EserAjanHttpStreamClose(handle *C.char) *C.char {
	return C.CString(bridgeHttpStreamClose(C.GoString(handle)))
}

// ---------------------------------------------------------------------------
// Noskills exports
// ---------------------------------------------------------------------------

//export EserAjanNoskillsInit
func EserAjanNoskillsInit(requestJSON *C.char) *C.char {
	return C.CString(bridgeNoskillsInit(C.GoString(requestJSON)))
}

//export EserAjanNoskillsSpecNew
func EserAjanNoskillsSpecNew(requestJSON *C.char) *C.char {
	return C.CString(bridgeNoskillsSpecNew(C.GoString(requestJSON)))
}

//export EserAjanNoskillsNext
func EserAjanNoskillsNext(requestJSON *C.char) *C.char {
	return C.CString(bridgeNoskillsNext(C.GoString(requestJSON)))
}

// ---------------------------------------------------------------------------
// Workflow exports
// ---------------------------------------------------------------------------

//export EserAjanWorkflowRun
func EserAjanWorkflowRun(requestJSON *C.char) *C.char {
	return C.CString(bridgeWorkflowRun(C.GoString(requestJSON)))
}

// ---------------------------------------------------------------------------
// Crypto exports
// ---------------------------------------------------------------------------

//export EserAjanCryptoHash
func EserAjanCryptoHash(requestJSON *C.char) *C.char {
	return C.CString(bridgeCryptoHash(C.GoString(requestJSON)))
}

// ---------------------------------------------------------------------------
// Cache exports
// ---------------------------------------------------------------------------

//export EserAjanCacheCreate
func EserAjanCacheCreate(requestJSON *C.char) *C.char {
	return C.CString(bridgeCacheCreate(C.GoString(requestJSON)))
}

//export EserAjanCacheGetDir
func EserAjanCacheGetDir(requestJSON *C.char) *C.char {
	return C.CString(bridgeCacheGetDir(C.GoString(requestJSON)))
}

//export EserAjanCacheGetVersionedPath
func EserAjanCacheGetVersionedPath(requestJSON *C.char) *C.char {
	return C.CString(bridgeCacheGetVersionedPath(C.GoString(requestJSON)))
}

//export EserAjanCacheList
func EserAjanCacheList(requestJSON *C.char) *C.char {
	return C.CString(bridgeCacheList(C.GoString(requestJSON)))
}

//export EserAjanCacheRemove
func EserAjanCacheRemove(requestJSON *C.char) *C.char {
	return C.CString(bridgeCacheRemove(C.GoString(requestJSON)))
}

//export EserAjanCacheClear
func EserAjanCacheClear(requestJSON *C.char) *C.char {
	return C.CString(bridgeCacheClear(C.GoString(requestJSON)))
}

//export EserAjanCacheClose
func EserAjanCacheClose(requestJSON *C.char) *C.char {
	return C.CString(bridgeCacheClose(C.GoString(requestJSON)))
}

// ---------------------------------------------------------------------------
// CS (Kubernetes ConfigMap/Secret) exports
// ---------------------------------------------------------------------------

//export EserAjanCsGenerate
func EserAjanCsGenerate(requestJSON *C.char) *C.char {
	return C.CString(bridgeCsGenerate(C.GoString(requestJSON)))
}

//export EserAjanCsSync
func EserAjanCsSync(requestJSON *C.char) *C.char {
	return C.CString(bridgeCsSync(C.GoString(requestJSON)))
}

// ---------------------------------------------------------------------------
// Kit (recipe/scaffolding) exports
// ---------------------------------------------------------------------------

//export EserAjanKitListRecipes
func EserAjanKitListRecipes(requestJSON *C.char) *C.char {
	return C.CString(bridgeKitListRecipes(C.GoString(requestJSON)))
}

//export EserAjanKitApplyRecipe
func EserAjanKitApplyRecipe(requestJSON *C.char) *C.char {
	return C.CString(bridgeKitApplyRecipe(C.GoString(requestJSON)))
}

//export EserAjanKitCloneRecipe
func EserAjanKitCloneRecipe(requestJSON *C.char) *C.char {
	return C.CString(bridgeKitCloneRecipe(C.GoString(requestJSON)))
}

//export EserAjanKitNewProject
func EserAjanKitNewProject(requestJSON *C.char) *C.char {
	return C.CString(bridgeKitNewProject(C.GoString(requestJSON)))
}

//export EserAjanKitUpdateRecipe
func EserAjanKitUpdateRecipe(requestJSON *C.char) *C.char {
	return C.CString(bridgeKitUpdateRecipe(C.GoString(requestJSON)))
}

// ---------------------------------------------------------------------------
// Posts (social media) exports
// ---------------------------------------------------------------------------

//export EserAjanPostsCreateService
func EserAjanPostsCreateService(requestJSON *C.char) *C.char {
	return C.CString(bridgePostsCreateService(C.GoString(requestJSON)))
}

//export EserAjanPostsCompose
func EserAjanPostsCompose(requestJSON *C.char) *C.char {
	return C.CString(bridgePostsCompose(C.GoString(requestJSON)))
}

//export EserAjanPostsGetTimeline
func EserAjanPostsGetTimeline(requestJSON *C.char) *C.char {
	return C.CString(bridgePostsGetTimeline(C.GoString(requestJSON)))
}

//export EserAjanPostsSearch
func EserAjanPostsSearch(requestJSON *C.char) *C.char {
	return C.CString(bridgePostsSearch(C.GoString(requestJSON)))
}

//export EserAjanPostsClose
func EserAjanPostsClose(requestJSON *C.char) *C.char {
	return C.CString(bridgePostsClose(C.GoString(requestJSON)))
}

// ---------------------------------------------------------------------------
// Codebase exports
// ---------------------------------------------------------------------------

//export EserAjanCodebaseGitCurrentBranch
func EserAjanCodebaseGitCurrentBranch(requestJSON *C.char) *C.char {
	return C.CString(bridgeCodebaseGitCurrentBranch(C.GoString(requestJSON)))
}

//export EserAjanCodebaseGitLatestTag
func EserAjanCodebaseGitLatestTag(requestJSON *C.char) *C.char {
	return C.CString(bridgeCodebaseGitLatestTag(C.GoString(requestJSON)))
}

//export EserAjanCodebaseGitLog
func EserAjanCodebaseGitLog(requestJSON *C.char) *C.char {
	return C.CString(bridgeCodebaseGitLog(C.GoString(requestJSON)))
}

//export EserAjanCodebaseValidateCommitMsg
func EserAjanCodebaseValidateCommitMsg(requestJSON *C.char) *C.char {
	return C.CString(bridgeCodebaseValidateCommitMsg(C.GoString(requestJSON)))
}

//export EserAjanCodebaseGenerateChangelog
func EserAjanCodebaseGenerateChangelog(requestJSON *C.char) *C.char {
	return C.CString(bridgeCodebaseGenerateChangelog(C.GoString(requestJSON)))
}

//export EserAjanCodebaseBumpVersion
func EserAjanCodebaseBumpVersion(requestJSON *C.char) *C.char {
	return C.CString(bridgeCodebaseBumpVersion(C.GoString(requestJSON)))
}

//export EserAjanCodebaseWalkFiles
func EserAjanCodebaseWalkFiles(requestJSON *C.char) *C.char {
	return C.CString(bridgeCodebaseWalkFiles(C.GoString(requestJSON)))
}

//export EserAjanCodebaseValidateFiles
func EserAjanCodebaseValidateFiles(requestJSON *C.char) *C.char {
	return C.CString(bridgeCodebaseValidateFiles(C.GoString(requestJSON)))
}

//export EserAjanCodebaseCheckCircularDeps
func EserAjanCodebaseCheckCircularDeps(requestJSON *C.char) *C.char {
	return C.CString(bridgeCodebaseCheckCircularDeps(C.GoString(requestJSON)))
}

//export EserAjanCodebaseCheckExportNames
func EserAjanCodebaseCheckExportNames(requestJSON *C.char) *C.char {
	return C.CString(bridgeCodebaseCheckExportNames(C.GoString(requestJSON)))
}

//export EserAjanCodebaseCheckModExports
func EserAjanCodebaseCheckModExports(requestJSON *C.char) *C.char {
	return C.CString(bridgeCodebaseCheckModExports(C.GoString(requestJSON)))
}

//export EserAjanCodebaseCheckPackageConfigs
func EserAjanCodebaseCheckPackageConfigs(requestJSON *C.char) *C.char {
	return C.CString(bridgeCodebaseCheckPackageConfigs(C.GoString(requestJSON)))
}

//export EserAjanCodebaseCheckDocs
func EserAjanCodebaseCheckDocs(requestJSON *C.char) *C.char {
	return C.CString(bridgeCodebaseCheckDocs(C.GoString(requestJSON)))
}

// ---------------------------------------------------------------------------
// Codebase streaming exports
// ---------------------------------------------------------------------------

//export EserAjanCodebaseWalkFilesStreamCreate
func EserAjanCodebaseWalkFilesStreamCreate(requestJSON *C.char) *C.char {
	return C.CString(bridgeCodebaseWalkFilesStreamCreate(C.GoString(requestJSON)))
}

//export EserAjanCodebaseWalkFilesStreamRead
func EserAjanCodebaseWalkFilesStreamRead(handle *C.char) *C.char {
	return C.CString(bridgeCodebaseWalkFilesStreamRead(C.GoString(handle)))
}

//export EserAjanCodebaseWalkFilesStreamClose
func EserAjanCodebaseWalkFilesStreamClose(handle *C.char) *C.char {
	return C.CString(bridgeCodebaseWalkFilesStreamClose(C.GoString(handle)))
}

//export EserAjanCodebaseValidateFilesStreamCreate
func EserAjanCodebaseValidateFilesStreamCreate(requestJSON *C.char) *C.char {
	return C.CString(bridgeCodebaseValidateFilesStreamCreate(C.GoString(requestJSON)))
}

//export EserAjanCodebaseValidateFilesStreamRead
func EserAjanCodebaseValidateFilesStreamRead(handle *C.char) *C.char {
	return C.CString(bridgeCodebaseValidateFilesStreamRead(C.GoString(handle)))
}

//export EserAjanCodebaseValidateFilesStreamClose
func EserAjanCodebaseValidateFilesStreamClose(handle *C.char) *C.char {
	return C.CString(bridgeCodebaseValidateFilesStreamClose(C.GoString(handle)))
}

// ---------------------------------------------------------------------------
// Collector exports
// ---------------------------------------------------------------------------

//export EserAjanCollectorSpecifierToIdentifier
func EserAjanCollectorSpecifierToIdentifier(requestJSON *C.char) *C.char {
	return C.CString(bridgeCollectorSpecifierToIdentifier(C.GoString(requestJSON)))
}

//export EserAjanCollectorWalkFiles
func EserAjanCollectorWalkFiles(requestJSON *C.char) *C.char {
	return C.CString(bridgeCollectorWalkFiles(C.GoString(requestJSON)))
}

//export EserAjanCollectorGenerateManifest
func EserAjanCollectorGenerateManifest(requestJSON *C.char) *C.char {
	return C.CString(bridgeCollectorGenerateManifest(C.GoString(requestJSON)))
}

// ---------------------------------------------------------------------------
// Parsing exports
// ---------------------------------------------------------------------------

//export EserAjanParsingTokenize
func EserAjanParsingTokenize(requestJSON *C.char) *C.char {
	return C.CString(bridgeParsingTokenize(C.GoString(requestJSON)))
}

//export EserAjanParsingSimpleTokens
func EserAjanParsingSimpleTokens() *C.char {
	return C.CString(bridgeParsingSimpleTokens())
}

//export EserAjanParsingTokenizeStreamCreate
func EserAjanParsingTokenizeStreamCreate(requestJSON *C.char) *C.char {
	return C.CString(bridgeParsingTokenizerCreate(C.GoString(requestJSON)))
}

//export EserAjanParsingTokenizeStreamPush
func EserAjanParsingTokenizeStreamPush(requestJSON *C.char) *C.char {
	return C.CString(bridgeParsingTokenizerPush(C.GoString(requestJSON)))
}

//export EserAjanParsingTokenizeStreamClose
func EserAjanParsingTokenizeStreamClose(requestJSON *C.char) *C.char {
	return C.CString(bridgeParsingTokenizerClose(C.GoString(requestJSON)))
}

// ---------------------------------------------------------------------------
// Shell exec exports
// ---------------------------------------------------------------------------

//export EserAjanShellExec
func EserAjanShellExec(requestJSON *C.char) *C.char {
	return C.CString(bridgeShellExec(C.GoString(requestJSON)))
}

// ---------------------------------------------------------------------------
// Shell exec spawn exports (bidirectional, §20 streaming)
// ---------------------------------------------------------------------------

//export EserAjanShellExecSpawn
func EserAjanShellExecSpawn(requestJSON *C.char) *C.char {
	return C.CString(bridgeShellExecSpawn(C.GoString(requestJSON)))
}

//export EserAjanShellExecRead
func EserAjanShellExecRead(handle *C.char) *C.char {
	return C.CString(bridgeShellExecRead(C.GoString(handle)))
}

//export EserAjanShellExecWrite
func EserAjanShellExecWrite(requestJSON *C.char) *C.char {
	return C.CString(bridgeShellExecWrite(C.GoString(requestJSON)))
}

//export EserAjanShellExecClose
func EserAjanShellExecClose(handle *C.char) *C.char {
	return C.CString(bridgeShellExecClose(C.GoString(handle)))
}

// ---------------------------------------------------------------------------
// Shell TUI exports
// ---------------------------------------------------------------------------

//export EserAjanShellTuiKeypressCreate
func EserAjanShellTuiKeypressCreate(requestJSON *C.char) *C.char {
	return C.CString(bridgeShellTuiKeypressCreate(C.GoString(requestJSON)))
}

//export EserAjanShellTuiKeypressRead
func EserAjanShellTuiKeypressRead(handle *C.char) *C.char {
	return C.CString(bridgeShellTuiKeypressRead(C.GoString(handle)))
}

//export EserAjanShellTuiKeypressClose
func EserAjanShellTuiKeypressClose(handle *C.char) *C.char {
	return C.CString(bridgeShellTuiKeypressClose(C.GoString(handle)))
}

//export EserAjanShellTuiSetStdinRaw
func EserAjanShellTuiSetStdinRaw(requestJSON *C.char) *C.char {
	return C.CString(bridgeShellTuiSetStdinRaw(C.GoString(requestJSON)))
}

//export EserAjanShellTuiGetSize
func EserAjanShellTuiGetSize(requestJSON *C.char) *C.char {
	return C.CString(bridgeShellTuiGetSize(C.GoString(requestJSON)))
}

func main() {}
