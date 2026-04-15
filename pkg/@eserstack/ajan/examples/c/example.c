// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// Minimal C example for eser-ajan FFI.
//
// Compile:
//   gcc -o example example.c -L. -leser_ajan
//
// Run (Linux):
//   LD_LIBRARY_PATH=. ./example
//
// Run (macOS):
//   DYLD_LIBRARY_PATH=. ./example

#include "libeser_ajan.h"
#include <stdio.h>

int main(void) {
    // Initialize the Go runtime bridge
    int rc = EserAjanInit();
    if (rc != 0) {
        fprintf(stderr, "EserAjanInit failed with code %d\n", rc);
        return 1;
    }

    // Get and print the version string
    char* version = EserAjanVersion();
    printf("Version: %s\n", version);

    // Free the C string allocated by Go
    EserAjanFree(version);

    // Shut down the Go runtime bridge
    EserAjanShutdown();

    return 0;
}
