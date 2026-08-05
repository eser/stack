//go:build windows

package main

/*
#include <windows.h>

// See pin_image_posix.go for the full rationale: a Go runtime cannot be
// unloaded and reloaded in one process, and a host that does so crashes the
// next call in with "morestack on g0".
//
// The Windows equivalent of RTLD_NODELETE is GET_MODULE_HANDLE_EX_FLAG_PIN,
// which raises this module's reference count to a value FreeLibrary() can never
// bring back to zero.
//
// NOTE: this file is not compiled on darwin or linux hosts. It is exercised by
// the --target=x86_64-windows step in .github/workflows/publish-ajan.yml, which
// is the first place a mistake here would show up.
__attribute__((constructor))
static void eserAjanPinImage(void) {
	HMODULE self = NULL;
	GetModuleHandleExW(
		GET_MODULE_HANDLE_EX_FLAG_PIN | GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS,
		(LPCWSTR)(void *)&eserAjanPinImage,
		&self);
}
*/
import "C"
