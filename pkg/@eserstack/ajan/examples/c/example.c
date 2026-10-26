// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// Minimal C example for eser-ajan FFI.
//
// The library exports the dispatcher ABI: EserAjanVersion answers the
// handshake JSON, and EserAjanCall runs a registry name with its request and
// answers a JSON envelope ({"ok":true,"result":"..."}). Every returned string
// goes back to EserAjanFree.
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
    // The handshake: version, dispatcher ABI, profile and names
    char* handshake = EserAjanVersion();
    printf("Handshake: %s\n", handshake);
    EserAjanFree(handshake);

    // Initialize the Go runtime bridge
    char* init = EserAjanCall("init", "");
    printf("init: %s\n", init);
    EserAjanFree(init);

    // One call: hash a text
    char* hash = EserAjanCall(
        "cryptoHash", "{\"text\":\"hello\",\"algorithm\":\"SHA-256\"}");
    printf("cryptoHash: %s\n", hash);
    EserAjanFree(hash);

    // Shut down the Go runtime bridge
    EserAjanFree(EserAjanCall("shutdown", ""));

    return 0;
}
