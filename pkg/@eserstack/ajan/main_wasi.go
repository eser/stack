//go:build wasip1 && !eserajan_reactor

package main

import (
	"encoding/json"
	"io"
	"os"
)

// request is the JSON request envelope read from stdin.
type request struct {
	Fn   string          `json:"fn"`
	Args json.RawMessage `json:"args,omitempty"`
}

// response is the JSON response envelope written to stdout.
type response struct {
	OK     bool   `json:"ok"`
	Result string `json:"result,omitempty"`
	Error  string `json:"error,omitempty"`
}

func main() {
	data, err := io.ReadAll(os.Stdin)
	if err != nil {
		writeError("failed to read stdin: " + err.Error())
		return
	}

	var req request
	if err := json.Unmarshal(data, &req); err != nil {
		writeError("invalid JSON: " + err.Error())
		return
	}

	switch req.Fn {
	case "version":
		writeOK(bridgeVersion())

	case "init":
		code := bridgeInit()
		if code != 0 {
			writeError("init failed")
			return
		}
		writeOK("initialized")

	case "shutdown":
		bridgeShutdown()
		writeOK("shutdown")

	case "configLoad":
		optionsJSON, err := extractStringArg(req.Args, "optionsJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeConfigLoad(optionsJSON))

	case "diResolve":
		name, err := extractStringArg(req.Args, "name")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeDIResolve(name))

	case "aiCreateModel":
		configJSON, err := extractStringArg(req.Args, "configJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeAiCreateModel(configJSON))

	case "aiGenerateText":
		modelHandle, err := extractStringArg(req.Args, "modelHandle")
		if err != nil {
			writeError(err.Error())
			return
		}
		optionsJSON, err := extractStringArg(req.Args, "optionsJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeAiGenerateText(modelHandle, optionsJSON))

	case "aiStreamText":
		modelHandle, err := extractStringArg(req.Args, "modelHandle")
		if err != nil {
			writeError(err.Error())
			return
		}
		optionsJSON, err := extractStringArg(req.Args, "optionsJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeAiStreamText(modelHandle, optionsJSON))

	case "aiStreamRead":
		streamHandle, err := extractStringArg(req.Args, "streamHandle")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeAiStreamRead(streamHandle))

	case "aiCloseModel":
		modelHandle, err := extractStringArg(req.Args, "modelHandle")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeAiCloseModel(modelHandle))

	case "aiFreeStream":
		streamHandle, err := extractStringArg(req.Args, "streamHandle")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeAiFreeStream(streamHandle))

	case "aiBatchCreate":
		requestJSON, err := extractStringArg(req.Args, "requestJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeAiBatchCreate(requestJSON))

	case "aiBatchGet":
		requestJSON, err := extractStringArg(req.Args, "requestJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeAiBatchGet(requestJSON))

	case "aiBatchList":
		requestJSON, err := extractStringArg(req.Args, "requestJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeAiBatchList(requestJSON))

	case "aiBatchDownload":
		requestJSON, err := extractStringArg(req.Args, "requestJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeAiBatchDownload(requestJSON))

	case "aiBatchCancel":
		requestJSON, err := extractStringArg(req.Args, "requestJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeAiBatchCancel(requestJSON))

	case "formatEncode":
		requestJSON, err := extractStringArg(req.Args, "requestJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeFormatEncode(requestJSON))

	case "formatDecode":
		requestJSON, err := extractStringArg(req.Args, "requestJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeFormatDecode(requestJSON))

	case "formatList":
		writeOK(bridgeFormatList())

	case "formatEncodeDocument":
		requestJSON, err := extractStringArg(req.Args, "requestJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeFormatEncodeDocument(requestJSON))

	case "logCreate":
		configJSON, err := extractStringArg(req.Args, "configJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeLogCreate(configJSON))

	case "logWrite":
		requestJSON, err := extractStringArg(req.Args, "requestJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeLogWrite(requestJSON))

	case "logClose":
		handle, err := extractStringArg(req.Args, "handle")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeLogClose(handle))

	case "logShouldLog":
		requestJSON, err := extractStringArg(req.Args, "requestJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeLogShouldLog(requestJSON))

	case "logConfigure":
		requestJSON, err := extractStringArg(req.Args, "requestJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeLogConfigure(requestJSON))

	case "httpCreate":
		configJSON, err := extractStringArg(req.Args, "configJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeHttpCreate(configJSON))

	case "httpRequest":
		requestJSON, err := extractStringArg(req.Args, "requestJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeHttpRequest(requestJSON))

	case "httpClose":
		handle, err := extractStringArg(req.Args, "handle")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeHttpClose(handle))

	case "httpRequestStream":
		requestJSON, err := extractStringArg(req.Args, "requestJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeHttpRequestStream(requestJSON))

	case "httpStreamRead":
		handle, err := extractStringArg(req.Args, "handle")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeHttpStreamRead(handle))

	case "httpStreamClose":
		handle, err := extractStringArg(req.Args, "handle")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeHttpStreamClose(handle))

	case "noskillsInit":
		requestJSON, err := extractStringArg(req.Args, "requestJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeNoskillsInit(requestJSON))

	case "noskillsSpecNew":
		requestJSON, err := extractStringArg(req.Args, "requestJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeNoskillsSpecNew(requestJSON))

	case "noskillsNext":
		requestJSON, err := extractStringArg(req.Args, "requestJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeNoskillsNext(requestJSON))

	case "workflowRun":
		requestJSON, err := extractStringArg(req.Args, "requestJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeWorkflowRun(requestJSON))

	case "cryptoHash":
		requestJSON, err := extractStringArg(req.Args, "requestJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeCryptoHash(requestJSON))

	case "cacheCreate":
		requestJSON, err := extractStringArg(req.Args, "requestJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeCacheCreate(requestJSON))

	case "cacheGetDir":
		requestJSON, err := extractStringArg(req.Args, "requestJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeCacheGetDir(requestJSON))

	case "cacheGetVersionedPath":
		requestJSON, err := extractStringArg(req.Args, "requestJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeCacheGetVersionedPath(requestJSON))

	case "cacheList":
		requestJSON, err := extractStringArg(req.Args, "requestJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeCacheList(requestJSON))

	case "cacheRemove":
		requestJSON, err := extractStringArg(req.Args, "requestJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeCacheRemove(requestJSON))

	case "cacheClear":
		requestJSON, err := extractStringArg(req.Args, "requestJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeCacheClear(requestJSON))

	case "cacheClose":
		requestJSON, err := extractStringArg(req.Args, "requestJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeCacheClose(requestJSON))

	case "csGenerate":
		requestJSON, err := extractStringArg(req.Args, "requestJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeCsGenerate(requestJSON))

	case "csSync":
		requestJSON, err := extractStringArg(req.Args, "requestJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeCsSync(requestJSON))

	case "kitListRecipes":
		requestJSON, err := extractStringArg(req.Args, "requestJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeKitListRecipes(requestJSON))

	case "kitApplyRecipe":
		requestJSON, err := extractStringArg(req.Args, "requestJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeKitApplyRecipe(requestJSON))

	case "kitCloneRecipe":
		requestJSON, err := extractStringArg(req.Args, "requestJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeKitCloneRecipe(requestJSON))

	case "kitNewProject":
		requestJSON, err := extractStringArg(req.Args, "requestJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeKitNewProject(requestJSON))

	case "kitUpdateRecipe":
		requestJSON, err := extractStringArg(req.Args, "requestJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeKitUpdateRecipe(requestJSON))

	case "postsCreateService":
		requestJSON, err := extractStringArg(req.Args, "requestJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgePostsCreateService(requestJSON))

	case "postsCompose":
		requestJSON, err := extractStringArg(req.Args, "requestJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgePostsCompose(requestJSON))

	case "postsGetTimeline":
		requestJSON, err := extractStringArg(req.Args, "requestJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgePostsGetTimeline(requestJSON))

	case "postsSearch":
		requestJSON, err := extractStringArg(req.Args, "requestJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgePostsSearch(requestJSON))

	case "postsClose":
		requestJSON, err := extractStringArg(req.Args, "requestJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgePostsClose(requestJSON))

	case "codebaseGitCurrentBranch":
		requestJSON, err := extractStringArg(req.Args, "requestJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeCodebaseGitCurrentBranch(requestJSON))

	case "codebaseGitLatestTag":
		requestJSON, err := extractStringArg(req.Args, "requestJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeCodebaseGitLatestTag(requestJSON))

	case "codebaseGitLog":
		requestJSON, err := extractStringArg(req.Args, "requestJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeCodebaseGitLog(requestJSON))

	case "codebaseValidateCommitMsg":
		requestJSON, err := extractStringArg(req.Args, "requestJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeCodebaseValidateCommitMsg(requestJSON))

	case "codebaseGenerateChangelog":
		requestJSON, err := extractStringArg(req.Args, "requestJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeCodebaseGenerateChangelog(requestJSON))

	case "codebaseBumpVersion":
		requestJSON, err := extractStringArg(req.Args, "requestJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeCodebaseBumpVersion(requestJSON))

	case "codebaseWalkFiles":
		requestJSON, err := extractStringArg(req.Args, "requestJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeCodebaseWalkFiles(requestJSON))

	case "codebaseValidateFiles":
		requestJSON, err := extractStringArg(req.Args, "requestJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeCodebaseValidateFiles(requestJSON))

	case "codebaseCheckCircularDeps":
		requestJSON, err := extractStringArg(req.Args, "requestJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeCodebaseCheckCircularDeps(requestJSON))

	case "codebaseCheckExportNames":
		requestJSON, err := extractStringArg(req.Args, "requestJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeCodebaseCheckExportNames(requestJSON))

	case "codebaseCheckModExports":
		requestJSON, err := extractStringArg(req.Args, "requestJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeCodebaseCheckModExports(requestJSON))

	case "codebaseCheckPackageConfigs":
		requestJSON, err := extractStringArg(req.Args, "requestJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeCodebaseCheckPackageConfigs(requestJSON))

	case "codebaseCheckDocs":
		requestJSON, err := extractStringArg(req.Args, "requestJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeCodebaseCheckDocs(requestJSON))

	case "codebaseWalkFilesStreamCreate":
		requestJSON, err := extractStringArg(req.Args, "requestJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeCodebaseWalkFilesStreamCreate(requestJSON))

	case "codebaseWalkFilesStreamRead":
		handle, err := extractStringArg(req.Args, "handle")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeCodebaseWalkFilesStreamRead(handle))

	case "codebaseWalkFilesStreamClose":
		handle, err := extractStringArg(req.Args, "handle")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeCodebaseWalkFilesStreamClose(handle))

	case "codebaseValidateFilesStreamCreate":
		requestJSON, err := extractStringArg(req.Args, "requestJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeCodebaseValidateFilesStreamCreate(requestJSON))

	case "codebaseValidateFilesStreamRead":
		handle, err := extractStringArg(req.Args, "handle")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeCodebaseValidateFilesStreamRead(handle))

	case "codebaseValidateFilesStreamClose":
		handle, err := extractStringArg(req.Args, "handle")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeCodebaseValidateFilesStreamClose(handle))

	case "collectorSpecifierToIdentifier":
		requestJSON, err := extractStringArg(req.Args, "requestJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeCollectorSpecifierToIdentifier(requestJSON))

	case "collectorWalkFiles":
		requestJSON, err := extractStringArg(req.Args, "requestJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeCollectorWalkFiles(requestJSON))

	case "collectorGenerateManifest":
		requestJSON, err := extractStringArg(req.Args, "requestJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeCollectorGenerateManifest(requestJSON))

	case "parsingTokenize":
		requestJSON, err := extractStringArg(req.Args, "requestJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeParsingTokenize(requestJSON))

	case "parsingSimpleTokens":
		writeOK(bridgeParsingSimpleTokens())

	case "parsingTokenizeStreamCreate":
		requestJSON, err := extractStringArg(req.Args, "requestJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeParsingTokenizerCreate(requestJSON))

	case "parsingTokenizeStreamPush":
		requestJSON, err := extractStringArg(req.Args, "requestJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeParsingTokenizerPush(requestJSON))

	case "parsingTokenizeStreamClose":
		requestJSON, err := extractStringArg(req.Args, "requestJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeParsingTokenizerClose(requestJSON))

	case "shellExec":
		requestJSON, err := extractStringArg(req.Args, "requestJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeShellExec(requestJSON))

	case "shellTuiKeypressCreate":
		requestJSON, err := extractStringArg(req.Args, "requestJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeShellTuiKeypressCreate(requestJSON))

	case "shellTuiKeypressRead":
		handle, err := extractStringArg(req.Args, "handle")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeShellTuiKeypressRead(handle))

	case "shellTuiKeypressClose":
		handle, err := extractStringArg(req.Args, "handle")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeShellTuiKeypressClose(handle))

	case "shellTuiSetStdinRaw":
		requestJSON, err := extractStringArg(req.Args, "requestJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeShellTuiSetStdinRaw(requestJSON))

	case "shellTuiGetSize":
		requestJSON, err := extractStringArg(req.Args, "requestJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeShellTuiGetSize(requestJSON))

	case "shellExecSpawn":
		requestJSON, err := extractStringArg(req.Args, "requestJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeShellExecSpawn(requestJSON))

	case "shellExecRead":
		handle, err := extractStringArg(req.Args, "handle")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeShellExecRead(handle))

	case "shellExecWrite":
		requestJSON, err := extractStringArg(req.Args, "requestJSON")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeShellExecWrite(requestJSON))

	case "shellExecClose":
		handle, err := extractStringArg(req.Args, "handle")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeShellExecClose(handle))

	default:
		writeError("unknown function: " + req.Fn)
	}
}

// extractStringArg extracts a named string field from a JSON args object.
func extractStringArg(raw json.RawMessage, key string) (string, error) {
	if raw == nil {
		return "", &json.UnmarshalTypeError{Value: "null", Type: nil}
	}

	var m map[string]string
	if err := json.Unmarshal(raw, &m); err != nil {
		return "", err
	}

	v, ok := m[key]
	if !ok {
		return "", &missingArgError{key: key}
	}

	return v, nil
}

type missingArgError struct {
	key string
}

func (e *missingArgError) Error() string {
	return "missing required arg: " + e.key
}

func writeOK(result string) {
	resp := response{OK: true, Result: result}
	data, _ := json.Marshal(resp)
	os.Stdout.Write(data)
	os.Stdout.Write([]byte("\n"))
}

func writeError(msg string) {
	resp := response{OK: false, Error: msg}
	data, _ := json.Marshal(resp)
	os.Stdout.Write(data)
	os.Stdout.Write([]byte("\n"))
}
