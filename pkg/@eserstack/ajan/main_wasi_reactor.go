// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build wasip1

package main

// The WASM build is a reactor (decision-45, TASK-273). Built with
// -buildmode=c-shared, the module exports _initialize, which runs package
// init once, and the functions below; it never calls proc_exit, so one
// instance serves every call and keeps its handles between calls.
//
// Calling protocol:
//  1. ptr := eser_ajan_alloc(n) hands out n bytes of a Go-owned input arena.
//  2. The host writes the name into it, then the arguments. Each argument is
//     a little-endian uint32 byte count followed by that many bytes. A
//     registry name is a call and takes one argument, its request; the
//     reserved names stream.open (stream name, request), stream.read (handle)
//     and stream.close (handle) are the stream operations
//     (reactor_protocol.go).
//  3. n := eser_ajan_call(namePtr, nameLen, argsPtr, argsLen) runs the
//     operation and stores the dispatcher's JSON envelope (dispatch.go), the
//     same envelope the native EserAjanCall answers.
//  4. eser_ajan_result_ptr() points at the n envelope bytes. The pointer is
//     valid until the next call.
//
// The "version" call answers the handshake the host checks at load: the
// version, "abi", "profile" and "names", the sorted names this build serves,
// with the stream names again in "streams". A name outside the profile
// answers the code UNSUPPORTED_IN_WASM.
//
// The module imports eser_host (http_fetch, http_read, http_release,
// http_take, sleep) and exports eser_ajan_call_async and
// eser_ajan_async_result_ptr, the same protocol with its own result buffer,
// for the calls that wait on the host (host_fetch_wasi.go, TASK-277).

import (
	"unsafe"
)

// buildProfile names the set of names this build serves.
const buildProfile = "wasi"

// codeUnsupportedInWasm is the code of a name outside the profile.
const codeUnsupportedInWasm = "UNSUPPORTED_IN_WASM"

// unknownNameCode is the code of a name this build does not serve: the
// profile leaves out the domains that cannot run on wasip1, so a name it does
// not know is one only the native library serves.
const unknownNameCode = codeUnsupportedInWasm

var (
	// inputArena is where the host writes a call's name and arguments.
	inputArena []byte //nolint:gochecknoglobals
	// resultBuf holds the envelope of the last call.
	resultBuf []byte //nolint:gochecknoglobals
)

//go:wasmexport eser_ajan_alloc
func eserAjanAlloc(size int32) unsafe.Pointer {
	if size < 1 {
		size = 1
	}

	if cap(inputArena) < int(size) {
		inputArena = make([]byte, size)
	} else {
		inputArena = inputArena[:size]
	}

	return unsafe.Pointer(&inputArena[0])
}

//go:wasmexport eser_ajan_call
func eserAjanCall(namePtr unsafe.Pointer, nameLen int32, argsPtr unsafe.Pointer, argsLen int32) int32 {
	name, nameOK := arenaBytes(namePtr, nameLen)
	rawArgs, argsOK := arenaBytes(argsPtr, argsLen)

	if !nameOK || !argsOK {
		return storeEnvelope(failed(codeBadRequest, "the name or the arguments lie outside the input arena"))
	}

	args, err := decodeArgs(rawArgs)
	if err != nil {
		return storeEnvelope(failed(codeBadRequest, "%s", err.Error()))
	}

	return storeEnvelope(runReactorCall(string(name), args))
}

//go:wasmexport eser_ajan_result_ptr
func eserAjanResultPtr() unsafe.Pointer {
	if len(resultBuf) == 0 {
		return nil
	}

	return unsafe.Pointer(&resultBuf[0])
}

// arenaBytes returns a copy of [ptr, ptr+n) when that range lies inside the
// input arena. The host passes the pointers, so they are not trusted: an
// out-of-range slice would trap the whole module.
func arenaBytes(ptr unsafe.Pointer, n int32) ([]byte, bool) {
	if n == 0 {
		return []byte{}, true
	}

	if n < 0 || len(inputArena) == 0 {
		return nil, false
	}

	base := uintptr(unsafe.Pointer(&inputArena[0]))
	start := uintptr(ptr)

	if start < base {
		return nil, false
	}

	offset := start - base
	if offset > uintptr(len(inputArena)) || uintptr(n) > uintptr(len(inputArena))-offset {
		return nil, false
	}

	out := make([]byte, n)
	copy(out, inputArena[offset:offset+uintptr(n)])

	return out, true
}

// storeEnvelope keeps the envelope for the host and returns its length.
func storeEnvelope(env envelope) int32 {
	resultBuf = []byte(marshalEnvelope(env))

	return int32(len(resultBuf)) //nolint:gosec // an envelope is far below 2 GiB
}

// main is required by wasip1 but never runs in a reactor; the host calls the
// exports above after _initialize.
func main() {}
