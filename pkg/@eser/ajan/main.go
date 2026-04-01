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

//export EserAjanConfigLoad
func EserAjanConfigLoad(path *C.char) *C.char {
	return C.CString(bridgeConfigLoad(C.GoString(path)))
}

//export EserAjanDIResolve
func EserAjanDIResolve(name *C.char) *C.char {
	return C.CString(bridgeDIResolve(C.GoString(name)))
}

func main() {}
