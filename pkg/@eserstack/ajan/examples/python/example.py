# Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

"""
Minimal Python example for eser-ajan FFI using ctypes.

The library exports the dispatcher ABI: EserAjanVersion answers the handshake
JSON, and EserAjanCall runs a registry name with its request and answers a
JSON envelope ({"ok": true, "result": "..."}). Every returned string goes
back to EserAjanFree.

Usage:
  # Linux
  LD_LIBRARY_PATH=. python example.py

  # macOS
  DYLD_LIBRARY_PATH=. python example.py

  # Windows
  python example.py  (place libeser_ajan.dll in the same directory)
"""

import ctypes
import json
import os
import sys


def _load_library() -> ctypes.CDLL:
    """Load the eser-ajan shared library for the current platform."""
    platform_ext = {
        "linux": ".so",
        "darwin": ".dylib",
        "win32": ".dll",
    }

    ext = platform_ext.get(sys.platform)
    if ext is None:
        raise OSError(f"Unsupported platform: {sys.platform}")

    lib_name = f"libeser_ajan{ext}"
    lib_path = os.path.join(os.path.dirname(__file__) or ".", lib_name)

    return ctypes.cdll.LoadLibrary(lib_path)


def main() -> None:
    lib = _load_library()

    # Declare the signatures. The answers are read as raw pointers so they can
    # be handed back to EserAjanFree.
    lib.EserAjanVersion.restype = ctypes.c_void_p
    lib.EserAjanVersion.argtypes = []

    lib.EserAjanCall.restype = ctypes.c_void_p
    lib.EserAjanCall.argtypes = [ctypes.c_char_p, ctypes.c_char_p]

    lib.EserAjanFree.restype = None
    lib.EserAjanFree.argtypes = [ctypes.c_void_p]

    def take(ptr: int) -> str:
        try:
            return ctypes.string_at(ptr).decode("utf-8")
        finally:
            lib.EserAjanFree(ptr)

    def call(name: str, request: str = "") -> dict:
        return json.loads(take(lib.EserAjanCall(name.encode(), request.encode())))

    # The handshake: version, dispatcher ABI, profile and names
    handshake = json.loads(take(lib.EserAjanVersion()))
    print(f"Version: {handshake['version']}, ABI {handshake['abi']}")

    # Initialize the Go runtime bridge, hash a text, shut down
    call("init")
    envelope = call("cryptoHash", json.dumps({"text": "hello", "algorithm": "SHA-256"}))
    print(f"cryptoHash: {json.loads(envelope['result'])}")
    call("shutdown")


if __name__ == "__main__":
    main()
