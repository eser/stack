# @eserstack/ajan

> **eserstack Library** — [eser/stack on GitHub](https://github.com/eser/stack)
> **Install:** `pnpm add jsr:@eserstack/ajan`

C-shared library and WASM modules exposing the eser Go runtime bridge. Provides
a two-tier architecture: native FFI (Deno/Bun/Node) + WASM fallback
(browser/edge/any platform).

## Quick Start

```bash
# 1. Build the shared library for your platform
deno run --allow-all pkg/@eserstack/ajan/scripts/build.ts

# 2. Verify the Go bridge works
deno task cli go version
# → eser-ajan version 1.0.0

# 3. (Optional) Test on other runtimes
ESER_AJAN_LIB_PATH=$(pwd)/pkg/@eserstack/ajan/dist/aarch64-darwin/libeser_ajan.dylib \
  bun --eval 'import * as ffi from "./pkg/@eserstack/ajan/ffi/mod.ts"; const lib = await ffi.loadEserAjan(); console.log(lib.symbols.EserAjanVersion()); lib.close();'

# 4. (Optional) Test WASM fallback
deno run --allow-all pkg/@eserstack/ajan/scripts/build.ts --wasm
ESER_AJAN_NATIVE=disabled deno task cli go version
```

## Build

### Quick (current platform)

```bash
deno run --allow-all pkg/@eserstack/ajan/scripts/build.ts
```

### Single target

```bash
deno run --allow-all pkg/@eserstack/ajan/scripts/build.ts --target=x86_64-linux
```

### All targets (CI)

```bash
deno run --allow-all pkg/@eserstack/ajan/scripts/build.ts --all
```

### WASM only

```bash
deno run --allow-all pkg/@eserstack/ajan/scripts/build.ts --wasm
```

### Clean

```bash
deno run --allow-all pkg/@eserstack/ajan/scripts/build.ts --clean
```

### Available targets

| Target            | GOOS/GOARCH   | Output file              |
| ----------------- | ------------- | ------------------------ |
| `x86_64-linux`    | linux/amd64   | `libeser_ajan.so`        |
| `aarch64-linux`   | linux/arm64   | `libeser_ajan.so`        |
| `x86_64-darwin`   | darwin/amd64  | `libeser_ajan.dylib`     |
| `aarch64-darwin`  | darwin/arm64  | `libeser_ajan.dylib`     |
| `x86_64-windows`  | windows/amd64 | `libeser_ajan.dll`       |
| `aarch64-windows` | windows/arm64 | `libeser_ajan.dll`       |
| `wasi`            | wasip1/wasm   | `eser-ajan.wasm`         |
| `wasi-reactor`    | wasip1/wasm   | `eser-ajan-reactor.wasm` |

Cross-compilation for native targets requires the appropriate C cross-compilers
(e.g., `x86_64-linux-gnu-gcc`, `aarch64-linux-gnu-gcc`,
`x86_64-w64-mingw32-gcc`, `aarch64-w64-mingw32-gcc`). WASM targets need no C
compiler (`CGO_ENABLED=0`).

## Distribution

Each release archive contains everything needed for raw FFI consumption:

```
eser-ajan-{version}-{target}.tar.gz (or .zip for Windows)
  libeser_ajan.so / .dylib / .dll   # shared library
  libeser_ajan.h                     # C header
  LICENSE                          # Apache-2.0
  README.md                        # FFI usage examples
```

Archives are published for all six targets listed above, alongside a
`SHA256SUMS.txt` file for integrity verification.

## FFI Usage

The shared library exports a stable C ABI. Any language with FFI/ctypes support
can call it directly.

### C

```c
#include "libeser_ajan.h"
#include <stdio.h>

int main(void) {
    EserAjanInit();
    char* v = EserAjanVersion();
    printf("%s\n", v);
    EserAjanFree(v);
    EserAjanShutdown();
    return 0;
}
```

```bash
gcc -o example example.c -L. -leser_ajan
LD_LIBRARY_PATH=. ./example   # Linux
DYLD_LIBRARY_PATH=. ./example # macOS
```

### Python (ctypes)

```python
import ctypes, sys, os
ext = {"linux": ".so", "darwin": ".dylib", "win32": ".dll"}[sys.platform]
lib = ctypes.cdll.LoadLibrary(f"./libeser_ajan{ext}")
lib.EserAjanVersion.restype = ctypes.c_char_p
lib.EserAjanInit()
print(lib.EserAjanVersion().decode())
lib.EserAjanShutdown()
```

### Rust

```rust
extern "C" {
    fn EserAjanInit() -> i32;
    fn EserAjanVersion() -> *mut std::os::raw::c_char;
    fn EserAjanFree(ptr: *mut std::os::raw::c_char);
    fn EserAjanShutdown();
}
```

```bash
rustc example.rs -L . -l eser_ajan
```

### Ruby (Fiddle)

```ruby
require "fiddle/import"
module EserAjan
  extend Fiddle::Importer
  dlload "./libeser_ajan.so"
  extern "int EserAjanInit()"
  extern "char* EserAjanVersion()"
  extern "void EserAjanFree(char*)"
  extern "void EserAjanShutdown()"
end
EserAjan.EserAjanInit
puts EserAjan.EserAjanVersion
EserAjan.EserAjanShutdown
```

Full working examples live in [`examples/`](./examples/).

## WASM Usage

The WASM build produces two variants:

### Command mode (`eser-ajan.wasm`)

Reads a JSON request from stdin, writes a JSON response to stdout. Pipe-friendly
for CLI tooling and scripting.

```bash
# With wasmtime
echo '{"fn":"version"}' | wasmtime eser-ajan.wasm
# → {"ok":true,"result":"eser-ajan version 1.0.0"}

echo '{"fn":"init"}' | wasmtime eser-ajan.wasm
echo '{"fn":"configLoad","args":{"path":"/app/config.yml"}}' | wasmtime eser-ajan.wasm
echo '{"fn":"diResolve","args":{"name":"logger"}}' | wasmtime eser-ajan.wasm
echo '{"fn":"shutdown"}' | wasmtime eser-ajan.wasm
```

Supported functions: `version`, `init`, `shutdown`, `configLoad`, `diResolve`.

### Reactor mode (`eser-ajan-reactor.wasm`)

Exports functions directly as WASM exports for embedding in a JS/TS host. Uses
`//go:wasmexport` (Go 1.24+). String results are returned via a shared buffer:
the export returns the byte length, and the host reads from the pointer returned
by `eser_ajan_result_ptr()`.

Exported symbols: `eser_ajan_version`, `eser_ajan_init`, `eser_ajan_shutdown`,
`eser_ajan_config_load`, `eser_ajan_di_resolve`, `eser_ajan_result_ptr`.

### Manual WASM build

```bash
# Command mode
cd pkg/@eserstack/ajan
GOOS=wasip1 GOARCH=wasm CGO_ENABLED=0 go build -o eser-ajan.wasm .

# Reactor mode
GOOS=wasip1 GOARCH=wasm CGO_ENABLED=0 go build -tags eserajan_reactor -o eser-ajan-reactor.wasm .
```

## Packaging

After building, create distributable archives:

```bash
deno run --allow-all pkg/@eserstack/ajan/scripts/package.ts
```

Override version:

```bash
deno run --allow-all pkg/@eserstack/ajan/scripts/package.ts --version=1.2.3
```

This produces `dist/eser-ajan-{version}-{target}.tar.gz` (or `.zip`) plus
`dist/SHA256SUMS.txt`.

## Feature Flags

Environment variables control which FFI backends are enabled, supporting
incremental rollout. Set any of these to `disabled` to skip the corresponding
backend:

| Variable                    | Effect                                                               |
| --------------------------- | -------------------------------------------------------------------- |
| `ESER_AJAN=disabled`        | Disable ALL FFI (native + WASM); `loadEserAjan()` throws immediately |
| `ESER_AJAN_NATIVE=disabled` | Disable native FFI; skip straight to WASM fallback                   |
| `ESER_AJAN_WASM=disabled`   | Disable WASM fallback; only try native backends                      |

### Examples

```bash
# Force WASM-only (skip native FFI)
ESER_AJAN_NATIVE=disabled deno task cli ajan version

# Disable all (useful for testing error paths)
ESER_AJAN=disabled deno task cli ajan version

# Native only, no WASM fallback (for CI)
ESER_AJAN_WASM=disabled deno task cli ajan version
```

### Programmatic control

`loadEserAjan()` also accepts a `LoadOptions` object:

```ts
import * as ffi from "./ffi/mod.ts";

// Skip native, use WASM only
const lib = await ffi.loadEserAjan({ native: false });

// Native only, no WASM fallback
const lib = await ffi.loadEserAjan({ wasm: false });

// Explicit path
const lib = await ffi.loadEserAjan("/path/to/libeser_ajan.dylib");
```

Environment variables always take precedence over programmatic options. If
`ESER_AJAN_NATIVE=disabled` is set, `{ native: true }` will NOT re-enable native
backends.

Skipped backends are logged via `console.debug` so you can diagnose why a
particular backend was not used.

## Test

```bash
go test ./...
```
