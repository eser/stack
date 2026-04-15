// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// Minimal Rust example for eser-ajan FFI.
//
// Compile:
//   rustc example.rs -L . -l eser_ajan
//
// Run (Linux):
//   LD_LIBRARY_PATH=. ./example
//
// Run (macOS):
//   DYLD_LIBRARY_PATH=. ./example

use std::ffi::CStr;
use std::os::raw::c_char;

extern "C" {
    fn EserAjanInit() -> i32;
    fn EserAjanVersion() -> *mut c_char;
    fn EserAjanFree(ptr: *mut c_char);
    fn EserAjanShutdown();
}

fn main() {
    unsafe {
        // Initialize the Go runtime bridge
        let rc = EserAjanInit();
        if rc != 0 {
            eprintln!("EserAjanInit failed with code {}", rc);
            std::process::exit(1);
        }

        // Get and print the version string
        let ptr = EserAjanVersion();
        let version = CStr::from_ptr(ptr).to_string_lossy();
        println!("Version: {}", version);

        // Free the C string allocated by Go
        EserAjanFree(ptr);

        // Shut down the Go runtime bridge
        EserAjanShutdown();
    }
}
