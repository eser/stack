//go:build !wasip1 && !windows

package main

/*
// dladdr() is a GNU extension on glibc and is only declared when _GNU_SOURCE
// is defined; it is unconditional on darwin. Define it before <dlfcn.h> so the
// linux cross-builds in targets.ts compile.
#define _GNU_SOURCE
#include <dlfcn.h>

// glibc < 2.34 keeps dlopen/dladdr in libdl. Harmless on newer glibc, and
// darwin's linker ignores it (dl* live in libSystem).
#cgo linux LDFLAGS: -ldl

// eserAjanPinImage keeps this shared library permanently resident.
//
// The Go runtime cannot be unloaded and reloaded. It starts OS threads (sysmon,
// the cgo template thread, GC workers) that outlive any dlclose(), and it caches
// an M per calling thread in a pthread key. When a host dlclose()s the image and
// dlopen()s it again -- which Deno does on every test-file isolate teardown,
// because each test file gets a fresh isolate and disposing it drops the
// DynamicLibrary resource -- the whole runtime re-initializes while threads from
// the previous incarnation are still parked on the old m/g0 structures. The next
// call in dies with "fatal error: morestack on g0", in a scheduler traceback
// (acquirep <- stopm <- findRunnable <- schedule <- park_m) that names no
// application code at all, which is why it surfaces in whatever test happens to
// be running rather than in the one that loaded the library.
//
// Re-opening our own image with RTLD_NODELETE raises the flag on the
// already-loaded image, so the host's dlclose() drops the refcount but never
// unmaps. RTLD_NOLOAD guarantees we never trigger a second load.
//
// This is also why the failure is intermittent: under `deno test --parallel`
// the load count varies with scheduling, so a run either happens to reload the
// image or does not.
__attribute__((constructor))
static void eserAjanPinImage(void) {
	Dl_info info;
	if (dladdr((void *)eserAjanPinImage, &info) != 0 && info.dli_fname != NULL) {
		dlopen(info.dli_fname, RTLD_LAZY | RTLD_NOLOAD | RTLD_NODELETE);
	}
}
*/
import "C"
