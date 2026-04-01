# Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

"""
Minimal Python example for eser-ajan FFI using ctypes.

Usage:
  # Linux
  LD_LIBRARY_PATH=. python example.py

  # macOS
  DYLD_LIBRARY_PATH=. python example.py

  # Windows
  python example.py  (place libeser_ajan.dll in the same directory)
"""

import ctypes
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

    # Declare function signatures
    lib.EserAjanInit.restype = ctypes.c_int
    lib.EserAjanInit.argtypes = []

    lib.EserAjanVersion.restype = ctypes.c_char_p
    lib.EserAjanVersion.argtypes = []

    lib.EserAjanFree.restype = None
    lib.EserAjanFree.argtypes = [ctypes.c_char_p]

    lib.EserAjanShutdown.restype = None
    lib.EserAjanShutdown.argtypes = []

    # Initialize the Go runtime bridge
    rc = lib.EserAjanInit()
    if rc != 0:
        raise RuntimeError(f"EserAjanInit failed with code {rc}")

    # Get and print the version string
    version = lib.EserAjanVersion()
    print(f"Version: {version.decode('utf-8')}")

    # Free the C string allocated by Go
    lib.EserAjanFree(version)

    # Shut down the Go runtime bridge
    lib.EserAjanShutdown()


if __name__ == "__main__":
    main()
