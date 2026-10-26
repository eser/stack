//go:build !wasip1

package main

// Go-string fronts for the cgo exports in main.go. A _test.go file cannot use
// cgo, so the Go tests drive the exports through these, the same way node:ffi
// does: C strings in, a C string out, released with EserAjanFree.

/*
#include <stdlib.h>
*/
import "C"

import (
	"unsafe"
)

// takeExportString copies an export's answer and frees it.
func takeExportString(answer *C.char) string {
	defer EserAjanFree(answer)

	return C.GoString(answer)
}

// withCStrings hands fn C copies of values and frees them afterwards.
func withCStrings(values []string, fn func(args []*C.char) *C.char) string {
	args := make([]*C.char, len(values))
	for i, value := range values {
		args[i] = C.CString(value)
	}

	defer func() {
		for _, arg := range args {
			C.free(unsafe.Pointer(arg))
		}
	}()

	return takeExportString(fn(args))
}

func exportVersion() string {
	return takeExportString(EserAjanVersion())
}

func exportCall(name, request string) string {
	return withCStrings([]string{name, request}, func(a []*C.char) *C.char { return EserAjanCall(a[0], a[1]) })
}

func exportStreamOpen(name, request string) string {
	return withCStrings([]string{name, request}, func(a []*C.char) *C.char { return EserAjanStreamOpen(a[0], a[1]) })
}

func exportStreamRead(handle string) string {
	return withCStrings([]string{handle}, func(a []*C.char) *C.char { return EserAjanStreamRead(a[0]) })
}

func exportStreamClose(handle string) string {
	return withCStrings([]string{handle}, func(a []*C.char) *C.char { return EserAjanStreamClose(a[0]) })
}
