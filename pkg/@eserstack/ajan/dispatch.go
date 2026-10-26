// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

// The dispatcher ABI (TASK-238, decision-37). Every host reaches the bridge
// through four operations on the registry: call a name, open a stream, read
// a stream, close a stream. Each answers an envelope:
//
//	{"ok":true,"result":"<answer>"}
//	{"ok":false,"code":"HANDLER_ERROR","error":"<message>","result":"<answer>"}
//	{"ok":false,"code":"UNKNOWN_FUNCTION","error":"<message>"}
//
// "result" is the bridge function's answer, a JSON text. An answer that is a
// JSON object with an "error" string fails the envelope (HANDLER_ERROR) and is
// kept in "result", so the host can read the error's other fields. An
// envelope without "result" means no bridge function ran: the code says why.
//
// The native exports (main.go) answer the envelope as their return value; the
// WASM reactor (main_wasi_reactor.go) stores the same envelope for its host.
// This file carries no build tag, so both builds share it.

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/eser/stack/pkg/ajan/formatfx"
)

// abiVersion changes whenever the operations, the envelope or the handshake
// change; a host refuses a library or module with a different one.
const abiVersion = 3

// The codes of a failed envelope. The WASM build adds UNSUPPORTED_IN_WASM
// (main_wasi_reactor.go) for a name outside its profile.
const (
	// codeUnknownFunction: the registry has no such name.
	codeUnknownFunction = "UNKNOWN_FUNCTION"
	// codeKindMismatch: a call on a stream name, or a stream operation on a
	// call name.
	codeKindMismatch = "KIND_MISMATCH"
	// codeUnknownHandle: a stream read or close on a handle no stream owns.
	codeUnknownHandle = "UNKNOWN_HANDLE"
	// codeBadRequest: the request was refused before any bridge function ran.
	codeBadRequest = "BAD_REQUEST"
	// codeHandlerError: the bridge function answered an error.
	codeHandlerError = "HANDLER_ERROR"
	// codePanic: the bridge function panicked; the panic guard recovered it.
	codePanic = "PANIC"
)

// envelope is the answer of every dispatcher operation.
type envelope struct {
	Result *string `json:"result,omitempty"`
	Code   string  `json:"code,omitempty"`
	Error  string  `json:"error,omitempty"`
	OK     bool    `json:"ok"`
}

// handshake is what the "version" call and the native EserAjanVersion answer:
// the library version, the ABI version, the build profile and every name it
// serves, with the stream names listed apart.
type handshake struct {
	Version string   `json:"version"`
	Profile string   `json:"profile"`
	Names   []string `json:"names"`
	Streams []string `json:"streams"`
	ABI     int      `json:"abi"`
}

func handshakeJSON() string {
	return marshalResponse(handshake{
		Version: Version,
		ABI:     abiVersion,
		Profile: buildProfile,
		Names:   registeredNames(),
		Streams: registeredStreams(),
	})
}

// failed is an envelope for an operation that ran no bridge function.
func failed(code, format string, args ...any) envelope {
	return envelope{Code: code, Error: fmt.Sprintf(format, args...)} //nolint:exhaustruct
}

// answered builds the envelope of a bridge function's answer.
func answered(answer string, panicked bool) envelope {
	env := envelope{Result: &answer, OK: true} //nolint:exhaustruct

	if msg, isError := answerError(answer); isError {
		env.OK = false
		env.Error = msg
		env.Code = codeHandlerError

		if panicked {
			env.Code = codePanic
		}
	}

	return env
}

// runGuarded runs a bridge function and turns a panic into error JSON, so a
// bug in a downstream fx package answers an error instead of killing the
// host (panic_guard.go).
func runGuarded(fn func() string) (answer string, panicked bool) {
	defer func() {
		if recovered := recover(); recovered != nil {
			answer = errorResponse(reportPanic(recovered))
			panicked = true
		}
	}()

	return fn(), false
}

// checkRequest refuses a JSON request nested deeper than
// formatfx.MaxNestingDepth before any bridge function decodes it: decoding a
// deep request overflows the WASM host's stack, which recover cannot catch.
func checkRequest(name, request string) *envelope {
	if strings.HasPrefix(request, "{") || strings.HasPrefix(request, "[") {
		if err := formatfx.CheckJSONDepth(request); err != nil {
			env := failed(codeBadRequest, "%s: %s", name, err.Error())

			return &env
		}
	}

	return nil
}

// lookup finds a name of the given kind.
func lookup(name string, kind entryKind) (registryEntry, *envelope) {
	entry, ok := registry[name]
	if !ok {
		env := failed(unknownNameCode, "unknown function: %s", name)

		return entry, &env
	}

	if entry.kind != kind {
		env := failed(codeKindMismatch, "%s is a %s, not a %s", name, entry.kind, kind)

		return entry, &env
	}

	return entry, nil
}

// dispatchCall runs the call name with its request.
func dispatchCall(name, request string) envelope {
	entry, refused := lookup(name, kindCall)
	if refused != nil {
		return *refused
	}

	if refused := checkRequest(name, request); refused != nil {
		return *refused
	}

	return answered(runGuarded(func() string { return entry.call(request) }))
}

// dispatchStreamOpen opens the stream name with its request. The answer
// carries the new stream's handle.
func dispatchStreamOpen(name, request string) envelope {
	entry, refused := lookup(name, kindStream)
	if refused != nil {
		return *refused
	}

	if refused := checkRequest(name, request); refused != nil {
		return *refused
	}

	return answered(runGuarded(func() string { return entry.stream.open(request) }))
}

// streamOf finds the stream that owns handle from the handle's prefix.
func streamOf(handle string) (string, registryEntry, *envelope) {
	cut := strings.LastIndexByte(handle, '-')
	if cut > 0 {
		if name, ok := streamPrefixes[handle[:cut]]; ok {
			return name, registry[name], nil
		}
	}

	env := failed(codeUnknownHandle, "no stream owns the handle %q", handle)

	return "", registryEntry{}, &env //nolint:exhaustruct
}

// dispatchStreamRead reads the next chunk of the stream behind handle;
// "null" means the stream is done.
func dispatchStreamRead(handle string) envelope {
	name, entry, refused := streamOf(handle)
	if refused != nil {
		return *refused
	}

	if entry.stream.read == nil {
		return failed(codeKindMismatch, "%s has no read; it answers its chunks from the call that feeds it", name)
	}

	return answered(runGuarded(func() string { return entry.stream.read(handle) }))
}

// dispatchStreamClose closes the stream behind handle and releases it.
func dispatchStreamClose(handle string) envelope {
	_, entry, refused := streamOf(handle)
	if refused != nil {
		return *refused
	}

	return answered(runGuarded(func() string { return entry.stream.close(handle) }))
}

// answerError reports whether a function's answer is a JSON object with an
// "error" string, the way bridge functions report failure.
func answerError(answer string) (string, bool) {
	if len(answer) == 0 || answer[0] != '{' {
		return "", false
	}

	var probe struct {
		Error *string `json:"error"`
	}

	if err := json.Unmarshal([]byte(answer), &probe); err != nil || probe.Error == nil || *probe.Error == "" {
		return "", false
	}

	return *probe.Error, true
}

// marshalEnvelope encodes an envelope for the host.
func marshalEnvelope(env envelope) string {
	data, err := json.Marshal(env)
	if err != nil {
		return `{"ok":false,"code":"PANIC","error":"internal marshal error"}`
	}

	return string(data)
}
