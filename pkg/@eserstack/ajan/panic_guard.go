package main

// Panic safety for the FFI boundary.
//
// Every exported symbol in this module is called from a foreign runtime --
// Node over cgo through node:ffi, or a WASM host over WASI. A Go panic that escapes an
// exported function does not become an exception the caller can catch: it
// unwinds through the cgo prologue and aborts the ENTIRE host process (or traps
// the whole WASM module). There is no host-side try/catch that helps.
//
// The guards below turn that class of failure into an ordinary error response.
// The compact message goes back to the caller as JSON; the full stack trace goes
// to stderr, because an FFI caller has no other channel through which to
// diagnose what went wrong inside the module.
//
// This file deliberately carries NO build tag so the cgo and WASI reactor
// builds share one implementation. The dispatcher (dispatch.go) runs every
// bridge function under its own recover, built on reportPanic.

import (
	"fmt"
	"os"
	"runtime/debug"
)

// reportPanic writes the recovered value plus a full stack trace to stderr and
// returns the compact message meant for the JSON payload handed back over FFI.
func reportPanic(recovered any) string {
	msg := fmt.Sprintf("panic: %v", recovered)

	_, _ = fmt.Fprintf(os.Stderr, "eser-ajan: recovered %s\n%s\n", msg, debug.Stack())

	return msg
}

// guardString runs fn and converts a panic into the module's JSON error
// envelope. Used by every string-returning export.
func guardString(fn func() string) (out string) {
	defer func() {
		if recovered := recover(); recovered != nil {
			out = errorResponse(reportPanic(recovered))
		}
	}()

	return fn()
}

// guardVoid runs fn and swallows a panic. Exports with no return value have no
// way to report the failure, so stderr is the only diagnostic left -- but a
// swallowed panic is still strictly better than a dead host process.
func guardVoid(fn func()) {
	defer func() {
		if recovered := recover(); recovered != nil {
			reportPanic(recovered)
		}
	}()

	fn()
}
