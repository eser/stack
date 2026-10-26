//go:build !wasip1

package main

/*
#include <stdlib.h>
*/
import "C"

import (
	"unsafe"
)

// The native library exports the dispatcher ABI (dispatch.go, TASK-238) and
// nothing else. Every bridge function is a name in the registry
// (bridge_registry.go), reached through EserAjanCall or, for the streams,
// through EserAjanStreamOpen, EserAjanStreamRead and EserAjanStreamClose.
// These six names and their signatures are the ABI contract with the FFI host
// (node:ffi); abiVersion in dispatch.go changes whenever it does.
//
// Every string an export returns was allocated with C.CString (malloc); the
// host reads it and hands it back to EserAjanFree.
//
// Each body funnels through a guard from panic_guard.go. A panic escaping an
// exported function unwinds through cgo and aborts the host process, so the
// guard is what stands between a bug in a downstream fx package and a dead
// Node process. The C.GoString calls live inside the guarded closure on
// purpose, so argument marshalling is covered too.

// buildProfile names the set of names this build serves.
const buildProfile = "native"

// unknownNameCode is the code of a name this build does not serve.
const unknownNameCode = codeUnknownFunction

// guardEnvelope runs one dispatcher operation and encodes its envelope. A
// panic outside the bridge function (the dispatcher's own code) still answers
// an envelope.
func guardEnvelope(fn func() envelope) *C.char {
	return C.CString(guardString(func() string {
		answer, panicked := runGuarded(func() string { return marshalEnvelope(fn()) })
		if panicked {
			return marshalEnvelope(failed(codePanic, "the dispatcher panicked"))
		}

		return answer
	}))
}

// EserAjanVersion answers the handshake JSON: the library version, the
// dispatcher ABI version, the profile and every name with the streams listed
// apart. A host checks the ABI version right after loading the library.
//
//export EserAjanVersion
func EserAjanVersion() *C.char {
	return C.CString(guardString(handshakeJSON))
}

// EserAjanCall runs the call name with its request and answers the envelope.
//
//export EserAjanCall
func EserAjanCall(name, request *C.char) *C.char {
	return guardEnvelope(func() envelope {
		return dispatchCall(C.GoString(name), C.GoString(request))
	})
}

// EserAjanStreamOpen opens the stream name with its request and answers the
// envelope, whose result carries the new stream's handle.
//
//export EserAjanStreamOpen
func EserAjanStreamOpen(name, request *C.char) *C.char {
	return guardEnvelope(func() envelope {
		return dispatchStreamOpen(C.GoString(name), C.GoString(request))
	})
}

// EserAjanStreamRead reads the next chunk of the stream behind handle and
// answers the envelope; a result of "null" means the stream is done.
//
//export EserAjanStreamRead
func EserAjanStreamRead(handle *C.char) *C.char {
	return guardEnvelope(func() envelope {
		return dispatchStreamRead(C.GoString(handle))
	})
}

// EserAjanStreamClose closes the stream behind handle and answers the
// envelope.
//
//export EserAjanStreamClose
func EserAjanStreamClose(handle *C.char) *C.char {
	return guardEnvelope(func() envelope {
		return dispatchStreamClose(C.GoString(handle))
	})
}

// EserAjanFree releases a string another export returned.
//
//export EserAjanFree
func EserAjanFree(ptr *C.char) {
	guardVoid(func() {
		if ptr != nil {
			C.free(unsafe.Pointer(ptr))
		}
	})
}

func main() {}
