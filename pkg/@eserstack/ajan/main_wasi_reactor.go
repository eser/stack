//go:build wasip1 && eserajan_reactor

package main

// Reactor mode: exports functions directly as WASM exports using
// //go:wasmexport (Go 1.24+). This file is only included when both
// "wasip1" and "eserajan_reactor" build tags are set.
//
// Build with:
//   GOOS=wasip1 GOARCH=wasm go build -tags eserajan_reactor -o eser-ajan-reactor.wasm .
//
// String results are stored in a shared buffer. The host reads the buffer
// after calling the function. Flow:
//   1. Call eser_ajan_version() → returns byte length
//   2. Call eser_ajan_result_ptr() → returns pointer to buffer
//   3. Read `length` bytes from that pointer

import "unsafe"

// resultBuf holds the last string result for the host to read.
var resultBuf []byte

// setResult stores a string result and returns its byte length.
func setResult(s string) int32 {
	resultBuf = []byte(s)
	return int32(len(resultBuf))
}

//go:wasmexport eser_ajan_result_ptr
func eserGoResultPtr() unsafe.Pointer {
	if len(resultBuf) == 0 {
		return unsafe.Pointer(nil)
	}
	return unsafe.Pointer(&resultBuf[0])
}

//go:wasmexport eser_ajan_version
func eserGoVersion() int32 {
	return setResult(bridgeVersion())
}

//go:wasmexport eser_ajan_init
func eserGoInit() int32 {
	return int32(bridgeInit())
}

//go:wasmexport eser_ajan_shutdown
func eserGoShutdown() {
	bridgeShutdown()
}

//go:wasmexport eser_ajan_config_load
func eserGoConfigLoad() int32 {
	// In reactor mode without string args, the host must set up
	// input via stdin or a shared memory protocol. For now this
	// calls the bridge with an empty path.
	return setResult(bridgeConfigLoad(""))
}

//go:wasmexport eser_ajan_di_resolve
func eserGoDIResolve() int32 {
	// Same as config_load — host provides input via protocol.
	return setResult(bridgeDIResolve(""))
}

//go:wasmexport eser_ajan_ai_create_model
func eserGoAiCreateModel(configJSONLen int32) int32 {
	configJSON := string(resultBuf[:configJSONLen])
	return setResult(bridgeAiCreateModel(configJSON))
}

//go:wasmexport eser_ajan_ai_generate_text
func eserGoAiGenerateText(modelHandleLen, optionsJSONOffset, optionsJSONLen int32) int32 {
	modelHandle := string(resultBuf[:modelHandleLen])
	optionsJSON := string(resultBuf[optionsJSONOffset : optionsJSONOffset+optionsJSONLen])
	return setResult(bridgeAiGenerateText(modelHandle, optionsJSON))
}

//go:wasmexport eser_ajan_ai_stream_text
func eserGoAiStreamText(modelHandleLen, optionsJSONOffset, optionsJSONLen int32) int32 {
	modelHandle := string(resultBuf[:modelHandleLen])
	optionsJSON := string(resultBuf[optionsJSONOffset : optionsJSONOffset+optionsJSONLen])
	return setResult(bridgeAiStreamText(modelHandle, optionsJSON))
}

//go:wasmexport eser_ajan_ai_stream_read
func eserGoAiStreamRead(streamHandleLen int32) int32 {
	streamHandle := string(resultBuf[:streamHandleLen])
	return setResult(bridgeAiStreamRead(streamHandle))
}

//go:wasmexport eser_ajan_ai_close_model
func eserGoAiCloseModel(modelHandleLen int32) int32 {
	modelHandle := string(resultBuf[:modelHandleLen])
	return setResult(bridgeAiCloseModel(modelHandle))
}

//go:wasmexport eser_ajan_ai_free_stream
func eserGoAiFreeStream(streamHandleLen int32) int32 {
	streamHandle := string(resultBuf[:streamHandleLen])
	return setResult(bridgeAiFreeStream(streamHandle))
}

// main is required by wasip1 but does nothing in reactor mode.
// The WASM host calls exported functions directly.
func main() {}
