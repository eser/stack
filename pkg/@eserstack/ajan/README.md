# 🌉 [@eserstack/ajan](./)

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
deno task cli ajan version
# prints "eser-ajan version" followed by the repository's VERSION

# 3. (Optional) Test on other runtimes
ESER_AJAN_LIB_PATH=$(pwd)/pkg/@eserstack/ajan/dist/aarch64-darwin/libeser_ajan.dylib \
  bun --eval 'import * as ffi from "./pkg/@eserstack/ajan/ffi/mod.ts"; const lib = await ffi.loadEserAjan(); console.log(lib.symbols.EserAjanVersion()); lib.close();'

# 4. (Optional) Test WASM fallback
deno run --allow-all pkg/@eserstack/ajan/scripts/build.ts --wasm
ESER_AJAN_NATIVE=disabled deno task cli ajan version
```

### Load from TypeScript

`loadEserAjan()` opens the native library through the current runtime's FFI
(Deno, Bun or Node) and falls back to WASM when the native library cannot be
loaded:

```typescript
import * as ajan from "@eserstack/ajan";

const lib = await ajan.loadEserAjan();
console.log(lib.symbols.EserAjanVersion());
lib.close();
```

Most symbols take and return JSON strings. The request and response shape of
each one is documented on `FFILibrary` in `ffi/types.ts`.

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

| Target           | GOOS/GOARCH   | Output file              |
| ---------------- | ------------- | ------------------------ |
| `x86_64-linux`   | linux/amd64   | `libeser_ajan.so`        |
| `aarch64-linux`  | linux/arm64   | `libeser_ajan.so`        |
| `x86_64-darwin`  | darwin/amd64  | `libeser_ajan.dylib`     |
| `aarch64-darwin` | darwin/arm64  | `libeser_ajan.dylib`     |
| `x86_64-windows` | windows/amd64 | `libeser_ajan.dll`       |
| `wasi`           | wasip1/wasm   | `eser-ajan.wasm`         |
| `wasi-reactor`   | wasip1/wasm   | `eser-ajan-reactor.wasm` |

Cross-compilation for native targets requires the appropriate C cross-compilers
(e.g., `x86_64-linux-gnu-gcc`, `aarch64-linux-gnu-gcc`,
`x86_64-w64-mingw32-gcc`, and `clang -arch x86_64` for Intel macOS). The list
lives in `targets.ts`. WASM targets need no C compiler (`CGO_ENABLED=0`).

## Distribution

Each release archive contains everything needed for raw FFI consumption:

```
eser-ajan-{version}-{target}.tar.gz (or .zip for Windows)
  libeser_ajan.so / .dylib / .dll   # shared library
  libeser_ajan.h                     # C header
  LICENSE                          # Apache-2.0
  README.md                        # FFI usage examples
```

`scripts/package.ts` (see Packaging) writes one archive for each native target
built into `dist/`, alongside a `SHA256SUMS.txt` file for integrity
verification.

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
# prints {"ok":true,"result":"eser-ajan version ..."} with the repository's VERSION

echo '{"fn":"init"}' | wasmtime eser-ajan.wasm
echo '{"fn":"configLoad","args":{"optionsJSON":"{\"sources\":[\"json_file:config.json\"]}"}}' | wasmtime eser-ajan.wasm
echo '{"fn":"diResolve","args":{"name":"logger"}}' | wasmtime eser-ajan.wasm
echo '{"fn":"shutdown"}' | wasmtime eser-ajan.wasm
```

Every function of the native library except `EserAjanFree` has a command-mode
name: the symbol name in camelCase without the `EserAjan` prefix
(`EserAjanFormatEncode` is `formatEncode`). Functions that work on a handle (AI
models, loggers, HTTP clients, caches, streams, spawned processes) fail in this
mode, because each call starts a new instance and the handle is gone by the next
one.

### Reactor mode (`eser-ajan-reactor.wasm`)

Exports functions directly as WASM exports for embedding in a JS/TS host. Uses
`//go:wasmexport` (Go 1.24+). String results are returned via a shared buffer:
the export returns the byte length, and the host reads from the pointer returned
by `eser_ajan_result_ptr()`.

Exported symbols: `eser_ajan_version`, `eser_ajan_init`, `eser_ajan_shutdown`,
`eser_ajan_config_load`, `eser_ajan_di_resolve`, `eser_ajan_result_ptr`. The
module also exports six AI functions, but a host has no way to pass them
arguments yet, so the TypeScript loader reports them as unsupported.

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

It stamps the archives with the repository's `VERSION`. Override it:

```bash
deno run --allow-all pkg/@eserstack/ajan/scripts/package.ts --version=1.2.3
```

This produces `dist/eser-ajan-{version}-{target}.tar.gz` (or `.zip`) for each
native target in `dist/` plus `dist/SHA256SUMS.txt`. WASM builds are skipped;
they ship in `@eserstack/ajan-wasm`.

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

```typescript
import * as ajan from "@eserstack/ajan";

// Skip native, use WASM only
const wasmOnly = await ajan.loadEserAjan({ native: false });
wasmOnly.close();

// Native only, no WASM fallback
const nativeOnly = await ajan.loadEserAjan({ wasm: false });
nativeOnly.close();

// Explicit path
const explicit = await ajan.loadEserAjan("path/to/libeser_ajan.dylib");
explicit.close();
```

Environment variables always take precedence over programmatic options. If
`ESER_AJAN_NATIVE=disabled` is set, `{ native: true }` will NOT re-enable native
backends.

Set `ESER_AJAN_DEBUG` to any value to print, on stderr, why a backend was
skipped or failed. Nothing is printed while it is unset.

### Library and module paths

| Variable              | Default                           | Purpose                                                            |
| --------------------- | --------------------------------- | ------------------------------------------------------------------ |
| `ESER_AJAN_LIB_PATH`  | unset: search the locations below | Full path of the native library, e.g. `/opt/eser/libeser_ajan.so`  |
| `ESER_AJAN_WASM_PATH` | unset: search the locations below | Full path of the WASM module, e.g. `/opt/eser/eser-ajan.wasm`      |
| `ESER_AJAN_DEBUG`     | unset: no diagnostics             | Any value prints backend selection diagnostics on stderr, e.g. `1` |

None is required. Without an override, the native library is looked up next to
the module, in `dist/`, in the `@eserstack/ajan-{platform}` package and in
`/usr/local/lib` and `/usr/lib`; the WASM module next to the module, in `dist/`,
in `@eserstack/ajan-wasm` and in the same system directories.

## Test

```bash
# Go bridge
cd pkg/@eserstack/ajan && go test -race ./...

# TypeScript loaders
deno test --allow-all pkg/@eserstack/ajan/
```

## Upgrading from 4.x

These changes since 4.5.2 need a change in code, commands or files that use this
package. The [changelog](https://github.com/eser/stack/blob/main/CHANGELOG.md)
lists the changes in every package.

- `@eserstack/ajan/wasm` probes files with `Deno.statSync` or
  `process.getBuiltinModule("node:fs")`, as `ffi/resolve.ts` does. On a runtime
  with neither (Node before 22.3, Bun before 1.1, browsers),
  `loadEserAjanWasm()` without `wasmPath` throws "Could not find eser-ajan WASM
  module". Pass `wasmPath`, or use a supported runtime.
- `EserAjanShellExec` (and command-mode WASM `shellExec`) stops a command after
  10 minutes when the request has no `timeout`, and rejects a zero or negative
  `timeout` before the command starts. Before: `{"timeout": "0s"}` meant no
  limit. After: omit `timeout` for the default, or send a positive Go duration
  such as `"30m"`.
- `EserAjanHttpRequest` returns the status and headers with an error and no body
  for a response over 32 MiB, and `EserAjanHttpRequestStream` reads error-status
  bodies under the same limit. Send `maxResponseBytes` in the request JSON, or
  use the stream variant.
- `EserAjanCodebaseValidateFiles` and its stream variant fail the request for
  malformed `validatorOptions` of `filenames` or `large-file`, and `large-file`
  applies `maxKb`; it was always 1024 KB.
- `EserAjanNoskillsInit` writes `command: npx eser@latest noskills`
  (`noskillsfx.DefaultCommandPrefix`) into a new manifest instead of `noskills`.
  Edit the manifest's `command` to keep a bare `noskills`.

## 🔗 Links

- [JSR package](https://jsr.io/@eserstack/ajan): the API reference generated
  from source
- [`examples/`](./examples/): C, Python, Rust and browser programs that call the
  library
- [@eserstack/ajan-wasm](../ajan-wasm/README.md) and the platform packages such
  as [@eserstack/ajan-linux-x64](../ajan-linux-x64/README.md): the prebuilt
  binaries
- [eser/stack on GitHub](https://github.com/eser/stack)
