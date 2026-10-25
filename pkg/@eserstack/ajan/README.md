# 🌉 [@eserstack/ajan](./)

> **Note:** JSR is frozen at 4.5.x. From 5.0.0, `@eserstack/ajan` is published
> on npm under the same name (`pnpm add @eserstack/ajan`); the JSR versions stay
> available but get no updates.

> **eserstack Library** — [eser/stack on GitHub](https://github.com/eser/stack)
> **Install:** `pnpm add jsr:@eserstack/ajan`

C-shared library and WASM modules exposing the eser Go runtime bridge. Provides
a two-tier architecture: native FFI (Deno/Bun/Node) + WASM fallback
(browser/edge/any platform).

## Quick Start

```bash
# 1. Build the shared library for your platform (from the repository root)
make ajan-lib

# 2. Verify the Go bridge works
deno task cli ajan version
# prints "eser-ajan version" followed by the repository's VERSION

# 3. (Optional) Test on other runtimes
ESER_AJAN_LIB_PATH=$(pwd)/pkg/@eserstack/ajan/dist/aarch64-darwin/libeser_ajan.dylib \
  bun --eval 'import * as ffi from "./pkg/@eserstack/ajan/ffi/mod.ts"; const lib = await ffi.loadEserAjan(); console.log(lib.symbols.EserAjanVersion()); lib.close();'

# 4. (Optional) Test WASM fallback
make ajan-wasm
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

The Makefile at the repository root builds the library with Go and a C compiler;
nothing else is needed (decision-40). Every target sets `GOWORK=off` and stamps
`main.Version` from `VERSION`.

```bash
make ajan-lib                       # the library for this host
make ajan-lib TARGET=x86_64-linux   # one target, with its cross-compiler
make ajan-all                       # every native target, then the WASM modules
make ajan-wasm                      # the WASM reactor of the wasi profile only
make ajan-packages                  # copy dist/ into the @eserstack/ajan-* packages
make ajan-clean                     # remove dist/ and the staged binaries
```

### Available targets

| Target           | GOOS/GOARCH   | Output file          |
| ---------------- | ------------- | -------------------- |
| `x86_64-linux`   | linux/amd64   | `libeser_ajan.so`    |
| `aarch64-linux`  | linux/arm64   | `libeser_ajan.so`    |
| `x86_64-darwin`  | darwin/amd64  | `libeser_ajan.dylib` |
| `aarch64-darwin` | darwin/arm64  | `libeser_ajan.dylib` |
| `x86_64-windows` | windows/amd64 | `libeser_ajan.dll`   |
| `wasi`           | wasip1/wasm   | `eser-ajan.wasm`     |

Cross-compilation for native targets requires the appropriate C cross-compilers
(e.g., `x86_64-linux-gnu-gcc`, `aarch64-linux-gnu-gcc`,
`x86_64-w64-mingw32-gcc`, and `clang -arch x86_64` for Intel macOS). The table
is in the Makefile and in `targets.ts`, which `makefile-targets.test.ts` keeps
in step. WASM targets need no C compiler (`CGO_ENABLED=0`).

## Distribution

The library ships in the `@eserstack/ajan-*` npm platform packages, one per
native target, plus `@eserstack/ajan-wasm` for the WASM modules. Each holds the
shared library and its C header `libeser_ajan.h`; `make ajan-packages` stages
them from `dist/`.

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

The WASM build is one module, `eser-ajan.wasm`: the slim "wasi" profile of the
bridge, built with `-buildmode=c-shared` as a reactor (decision-45). It serves
the 52 functions that work on wasip1 (formats, crypto, config, parsing and its
stream, collector, codebase walks, validators and checks with their streams,
cache, csGenerate, logging, HTTP); every other name answers
`UNSUPPORTED_IN_WASM`. The noskills names left the profile with TASK-258: the
full spec lifecycle would take the module past its size limit. Loggers write
their records to the instance's stderr. `make ajan-wasm-check` fails when the
module grows past 8 MB, or 1.6 MB with brotli, or links aifx, the vendor AI
SDKs, gRPC, protobuf, QUIC, `os/exec`, `net/http` or the OpenTelemetry SDK.

The module exports `_initialize`, `memory` and five functions (reactor ABI 2):

- `eser_ajan_alloc(size)` returns a pointer to `size` bytes of an input arena.
- `eser_ajan_call(namePtr, nameLen, argsPtr, argsLen)` runs the named function.
  The host writes the name, then the arguments, into the arena; each argument is
  a little-endian uint32 byte count followed by its bytes. It returns the length
  of a JSON envelope: `{"ok":true,"result":"..."}`, or `ok: false` with `error`,
  also when the function answers with a JSON `error` field.
- `eser_ajan_result_ptr()` points at that envelope until the next call.
- `eser_ajan_call_async` and `eser_ajan_async_result_ptr()` are the same for the
  calls that wait on the host, with their own result buffer.

### Network on the WASM fallback

wasip1 cannot open a socket, so the HTTP names (`httpCreate`, `httpRequest`,
`httpRequestStream`, `httpStreamRead`, `httpStreamClose`, `httpClose`) ask the
host through the module's `eser_host` imports, which the loader provides on the
runtime's `fetch` (decision-45, TASK-277). With JSPI (`WebAssembly.Suspending`,
on in Node 26 and workerd), the module waits on the host's promise; the loader
calls these names through `WebAssembly.promising`, so on the fallback
`EserAjanHttpRequest`, `EserAjanHttpRequestStream` and `EserAjanHttpStreamRead`
return promises. They run one at a time; other calls go on while one waits.
Without JSPI the HTTP names answer an error.

The answers match the native bridge's, with its retry and circuit-breaker rules,
and these differences:

- the host follows redirects only within the same scheme (at most 20), and drops
  `Authorization` and `Cookie` when the host changes;
- a header sent more than once arrives joined by `,`, where the native bridge
  keeps the first value;
- a timeout is reported in the host's words;
- a request JSON with a `requestId` from `@eserstack/ajan/ffi/request-signals`
  stops when its AbortSignal fires (the Go-backed httpclient takes a `signal`);
  the native library ignores it.

The module does not link `net/http`, which would pull in `crypto/tls` (+7.3 MB
measured); it speaks to the host directly.

The envelope of `version` also carries `abi`, `profile` and `names`, which the
TypeScript loader checks once at load. `loadEserAjanWasm()` compiles the module
once, keeps one instance (so handles survive between calls), replaces it after a
trap, and gives it a preopen of the working directory when `node:wasi` is
available, which the filesystem functions need.

```typescript
import * as wasm from "@eserstack/ajan/wasm";

const lib = await wasm.loadEserAjanWasm();
console.log(lib.symbols.EserAjanVersion());
lib.symbols.EserAjanShellExec("{}"); // throws UnsupportedInWasmError
```

### Nesting limit

The bridge refuses JSON and YAML (and TOML) nested deeper than 1,000 levels,
`MaxNestingDepth` in [ajan/formatfx](../../ajan/formatfx/README.md), with error
JSON that names the limit. The registry checks every JSON argument before a
function decodes it, and formatfx checks documents before it decodes them.
Decoding recurses once per level, and in the WASM build a few thousand levels
overflow the host's stack, which Go cannot recover from; the limit keeps the
instance alive.

### Manual WASM build

```bash
cd pkg/@eserstack/ajan
GOOS=wasip1 GOARCH=wasm CGO_ENABLED=0 go build -buildmode=c-shared \
  -tags eserajan_wasi -trimpath -o eser-ajan.wasm .
```

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
- The WASM fallback is one module, `eser-ajan.wasm`, the wasi-profile reactor.
  The per-call module that read a JSON request on stdin,
  `eser-ajan-reactor.wasm` and the `mode` option of `loadEserAjanWasm()` and
  `resolveWasmPath()` are gone; drop `mode` from calls. Names outside the
  profile throw `UnsupportedInWasmError` (code `UNSUPPORTED_IN_WASM`) instead of
  failing per call.
- `EserAjanShellExec` stops a command after 10 minutes when the request has no
  `timeout`, and rejects a zero or negative `timeout` before the command starts.
  Before: `{"timeout": "0s"}` meant no limit. After: omit `timeout` for the
  default, or send a positive Go duration such as `"30m"`.
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
