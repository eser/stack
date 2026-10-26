// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// Minimal Rust example for eser-ajan FFI.
//
// The library exports the dispatcher ABI: EserAjanVersion answers the
// handshake JSON, and EserAjanCall runs a registry name with its request and
// answers a JSON envelope ({"ok":true,"result":"..."}). Every returned string
// goes back to EserAjanFree.
//
// Compile:
//   rustc example.rs -L . -l eser_ajan
//
// Run (Linux):
//   LD_LIBRARY_PATH=. ./example
//
// Run (macOS):
//   DYLD_LIBRARY_PATH=. ./example

use std::ffi::{CStr, CString};
use std::os::raw::c_char;

extern "C" {
    fn EserAjanVersion() -> *mut c_char;
    fn EserAjanCall(name: *const c_char, request: *const c_char) -> *mut c_char;
    fn EserAjanFree(ptr: *mut c_char);
}

/// Copies an answer and hands it back to EserAjanFree.
unsafe fn take(ptr: *mut c_char) -> String {
    let text = CStr::from_ptr(ptr).to_string_lossy().into_owned();
    EserAjanFree(ptr);
    text
}

unsafe fn call(name: &str, request: &str) -> String {
    let name = CString::new(name).unwrap();
    let request = CString::new(request).unwrap();
    take(EserAjanCall(name.as_ptr(), request.as_ptr()))
}

fn main() {
    unsafe {
        // The handshake: version, dispatcher ABI, profile and names
        println!("Handshake: {}", take(EserAjanVersion()));

        // Initialize the Go runtime bridge, hash a text, shut down
        println!("init: {}", call("init", ""));
        println!(
            "cryptoHash: {}",
            call("cryptoHash", r#"{"text":"hello","algorithm":"SHA-256"}"#)
        );
        call("shutdown", "");
    }
}
