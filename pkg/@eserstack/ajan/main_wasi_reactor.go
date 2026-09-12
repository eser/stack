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

// argRange reads the [offset, offset+length) window of resultBuf that the host
// claims holds an argument.
//
// The offsets and lengths are supplied by the host and are entirely untrusted:
// a negative value, a length past the end of the buffer, or any call made before
// the first setResult (when resultBuf is still nil) would slice out of range.
// In WASM that is not a recoverable error at the call site -- it traps the whole
// module -- so the window is validated up front and bad input is routed to the
// module's error path instead. The bounds arithmetic widens to int64 so that
// offset+length cannot itself overflow into a value that looks in range.
func argRange(offset, length int32) (string, bool) {
	if offset < 0 || length < 0 {
		return "", false
	}

	end := int64(offset) + int64(length)
	if end > int64(len(resultBuf)) {
		return "", false
	}

	return string(resultBuf[offset:end]), true
}

// argRangeError reports an out-of-range argument window through the same
// result-buffer channel a successful call would use.
func argRangeError() int32 {
	return setResult(errorResponse("invalid argument range for shared result buffer"))
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
	return setResult(guardString(bridgeVersion))
}

//go:wasmexport eser_ajan_init
func eserGoInit() int32 {
	return int32(guardInt(bridgeInit))
}

//go:wasmexport eser_ajan_shutdown
func eserGoShutdown() {
	guardVoid(bridgeShutdown)
}

//go:wasmexport eser_ajan_config_load
func eserGoConfigLoad() int32 {
	// In reactor mode without string args, the host must set up
	// input via stdin or a shared memory protocol. For now this
	// calls the bridge with an empty path.
	return setResult(guardString(func() string { return bridgeConfigLoad("") }))
}

//go:wasmexport eser_ajan_di_resolve
func eserGoDIResolve() int32 {
	// Same as config_load — host provides input via protocol.
	return setResult(guardString(func() string { return bridgeDIResolve("") }))
}

//go:wasmexport eser_ajan_ai_create_model
func eserGoAiCreateModel(configJSONLen int32) int32 {
	configJSON, ok := argRange(0, configJSONLen)
	if !ok {
		return argRangeError()
	}

	return setResult(guardString(func() string { return bridgeAiCreateModel(configJSON) }))
}

//go:wasmexport eser_ajan_ai_generate_text
func eserGoAiGenerateText(modelHandleLen, optionsJSONOffset, optionsJSONLen int32) int32 {
	modelHandle, ok := argRange(0, modelHandleLen)
	if !ok {
		return argRangeError()
	}

	optionsJSON, ok := argRange(optionsJSONOffset, optionsJSONLen)
	if !ok {
		return argRangeError()
	}

	return setResult(guardString(func() string { return bridgeAiGenerateText(modelHandle, optionsJSON) }))
}

//go:wasmexport eser_ajan_ai_stream_text
func eserGoAiStreamText(modelHandleLen, optionsJSONOffset, optionsJSONLen int32) int32 {
	modelHandle, ok := argRange(0, modelHandleLen)
	if !ok {
		return argRangeError()
	}

	optionsJSON, ok := argRange(optionsJSONOffset, optionsJSONLen)
	if !ok {
		return argRangeError()
	}

	return setResult(guardString(func() string { return bridgeAiStreamText(modelHandle, optionsJSON) }))
}

//go:wasmexport eser_ajan_ai_stream_read
func eserGoAiStreamRead(streamHandleLen int32) int32 {
	streamHandle, ok := argRange(0, streamHandleLen)
	if !ok {
		return argRangeError()
	}

	return setResult(guardString(func() string { return bridgeAiStreamRead(streamHandle) }))
}

//go:wasmexport eser_ajan_ai_close_model
func eserGoAiCloseModel(modelHandleLen int32) int32 {
	modelHandle, ok := argRange(0, modelHandleLen)
	if !ok {
		return argRangeError()
	}

	return setResult(guardString(func() string { return bridgeAiCloseModel(modelHandle) }))
}

//go:wasmexport eser_ajan_ai_free_stream
func eserGoAiFreeStream(streamHandleLen int32) int32 {
	streamHandle, ok := argRange(0, streamHandleLen)
	if !ok {
		return argRangeError()
	}

	return setResult(guardString(func() string { return bridgeAiFreeStream(streamHandle) }))
}

// main is required by wasip1 but does nothing in reactor mode.
// The WASM host calls exported functions directly.
func main() {}
