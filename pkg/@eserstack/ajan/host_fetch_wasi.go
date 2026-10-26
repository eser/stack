// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build wasip1 && eserajan_wasi

package main

// Network on the WASM fallback (TASK-277, decision-45 amended 2026-10-25).
// wasip1 refuses every dial, so the reactor asks its host for HTTP through
// the eser_host imports below. The host runs them on its own fetch and, with
// JSPI, suspends this module while it waits: http_fetch, http_read and sleep
// are wrapped in WebAssembly.Suspending, and a call that can reach them
// enters through eser_ajan_call_async, which the host wraps in
// WebAssembly.promising. Every other call stays synchronous on
// eser_ajan_call.
//
// An import that has data for the module answers its size; the module then
// allocates that many bytes and http_take copies them in, because the host
// cannot write into a buffer the module has not allocated yet. net/http is
// not linked: it would pull crypto/tls into the profile (+7.3 MB measured).

import (
	"encoding/json"
	"unsafe"
)

//go:wasmimport eser_host http_fetch
func hostHTTPFetch(ptr unsafe.Pointer, n int32) int32

//go:wasmimport eser_host http_read
func hostHTTPRead(ptr unsafe.Pointer, n int32) int32

//go:wasmimport eser_host http_release
func hostHTTPRelease(ptr unsafe.Pointer, n int32)

//go:wasmimport eser_host http_take
func hostHTTPTake(ptr unsafe.Pointer)

//go:wasmimport eser_host sleep
func hostSleep(ms int32)

// asyncResultBuf holds the envelope of the last eser_ajan_call_async. It is
// apart from resultBuf because a synchronous call may run between the async
// call returning and its host reading the result.
var asyncResultBuf []byte //nolint:gochecknoglobals

//go:wasmexport eser_ajan_call_async
func eserAjanCallAsync(namePtr unsafe.Pointer, nameLen int32, argsPtr unsafe.Pointer, argsLen int32) int32 {
	name, nameOK := arenaBytes(namePtr, nameLen)
	rawArgs, argsOK := arenaBytes(argsPtr, argsLen)

	var env envelope

	switch args, err := decodeArgs(rawArgs); {
	case !nameOK || !argsOK:
		env = failed(codeBadRequest, "the name or the arguments lie outside the input arena")
	case err != nil:
		env = failed(codeBadRequest, "%s", err.Error())
	default:
		env = runReactorCall(string(name), args)
	}

	asyncResultBuf = []byte(marshalEnvelope(env))

	return int32(len(asyncResultBuf)) //nolint:gosec // an envelope is far below 2 GiB
}

//go:wasmexport eser_ajan_async_result_ptr
func eserAjanAsyncResultPtr() unsafe.Pointer {
	if len(asyncResultBuf) == 0 {
		return nil
	}

	return unsafe.Pointer(&asyncResultBuf[0])
}

// hostCall sends request as JSON to a sizing import and decodes the JSON the
// host prepared into out.
func hostCall(fn func(unsafe.Pointer, int32) int32, request, out any) error {
	data, err := json.Marshal(request)
	if err != nil {
		return err //nolint:wrapcheck
	}

	if len(data) == 0 {
		data = []byte("{}")
	}

	size := fn(unsafe.Pointer(&data[0]), int32(len(data))) //nolint:gosec // a request is far below 2 GiB
	if size <= 0 {
		return json.Unmarshal([]byte("{}"), out) //nolint:wrapcheck
	}

	answer := make([]byte, size)
	hostHTTPTake(unsafe.Pointer(&answer[0]))

	return json.Unmarshal(answer, out) //nolint:wrapcheck
}

// hostFetchRequest is what http_fetch receives.
type hostFetchRequest struct {
	Headers          map[string]string `json:"headers,omitempty"`
	Method           string            `json:"method"`
	URL              string            `json:"url"`
	Body             string            `json:"body,omitempty"`
	RequestID        string            `json:"requestId,omitempty"`
	TimeoutMs        int64             `json:"timeoutMs,omitempty"`
	MaxResponseBytes int64             `json:"maxResponseBytes,omitempty"`
	Stream           bool              `json:"stream,omitempty"`
}

// hostFetchResponse is what http_fetch answers. Body is base64; with Stream,
// the host keeps the body open under StreamID instead.
type hostFetchResponse struct {
	Headers  map[string]string `json:"headers"`
	Body     string            `json:"body,omitempty"`
	StreamID string            `json:"streamId,omitempty"`
	Error    string            `json:"error,omitempty"`
	Status   int               `json:"status"`
	TooLarge bool              `json:"tooLarge,omitempty"`
	Aborted  bool              `json:"aborted,omitempty"`
	TimedOut bool              `json:"timedOut,omitempty"`
}

// hostReadResponse is what http_read answers: one base64 chunk of a stream.
type hostReadResponse struct {
	Chunk string `json:"chunk,omitempty"`
	Error string `json:"error,omitempty"`
	Done  bool   `json:"done"`
}

func hostFetch(req *hostFetchRequest) (*hostFetchResponse, error) {
	var resp hostFetchResponse
	if err := hostCall(hostHTTPFetch, req, &resp); err != nil {
		return nil, err
	}

	return &resp, nil
}

func hostRead(streamID string) (*hostReadResponse, error) {
	var resp hostReadResponse
	if err := hostCall(hostHTTPRead, map[string]string{"streamId": streamID}, &resp); err != nil {
		return nil, err
	}

	return &resp, nil
}

func hostRelease(streamID string) {
	data, _ := json.Marshal(map[string]string{"streamId": streamID}) //nolint:errchkjson // a map of strings always encodes
	hostHTTPRelease(unsafe.Pointer(&data[0]), int32(len(data)))      //nolint:gosec // a few bytes
}
