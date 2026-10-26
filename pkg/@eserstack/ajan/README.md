# 🌉 [@eserstack/ajan](./)

> **Note:** JSR is frozen at 4.5.x. From 5.0.0, `@eserstack/ajan` is published
> on npm under the same name (`pnpm add @eserstack/ajan`); the JSR versions stay
> available but get no updates.

> **eserstack Library** — [eser/stack on GitHub](https://github.com/eser/stack)
> **Install:** `pnpm add jsr:@eserstack/ajan`

C-shared library and WASM module exposing the eser Go runtime bridge. On Node it
loads the native library through the built-in `node:ffi` module, and falls back
to the WASM build when `node:ffi` cannot load.

## Quick Start

```bash
# 1. Build the shared library for your platform (from the repository root)
make ajan-lib

# 2. Verify the Go bridge works
node --run cli -- ajan version
# prints the repository's VERSION, the dispatcher ABI and the backend

# 3. (Optional) Load an explicit library file from a script
ESER_AJAN_LIB_PATH=$(pwd)/pkg/@eserstack/ajan/dist/aarch64-darwin/libeser_ajan.dylib \
  node --input-type=module --eval 'import * as ffi from "./pkg/@eserstack/ajan/ffi/mod.ts"; const lib = await ffi.loadEserAjan(); console.log(lib.handshake.version); lib.close();'

# 4. (Optional) Test the WASM fallback
make ajan-wasm
ESER_AJAN_NATIVE=disabled node --run cli -- ajan version
```

### Load from TypeScript

`loadEserAjan()` opens the native library through `node:ffi` and falls back to
WASM when `node:ffi` or the native library cannot be loaded:

```typescript
import * as ajan from "@eserstack/ajan";

const lib = await ajan.loadEserAjan();
console.log(lib.handshake.version, lib.backend);

const encoded = lib.call("formatEncode", { format: "yaml", data: { a: 1 } });
console.log(encoded.result);

const walk = lib.stream("codebaseWalkFilesStream", { dir: "." });
for (let file = walk.read(); file !== null; file = walk.read()) {
  console.log(file.path);
}
walk.close();

lib.close();
```

Every name the bridge serves is an entry of the binding table in
`ffi/bindings.ts`: its kind (`call` or `stream`), whether it can block, whether
the WASM fallback serves it, and its request and answer types. `lib.call(name,
request)` runs a call; `lib.stream(name, request)` opens a stream whose
`read()` answers the next chunk, or `null` when the stream is done, and whose
`close()` releases it. A request is an object, or the bare handle string for
the few names that take only a handle (`logClose`, `httpClose`,
`aiCloseModel`).

Both answer the bridge function's parsed JSON, an answer with an `error` field
included, so each package keeps its own error mapping. They throw only when no
bridge function ran, with the dispatcher's code: `UnknownFunctionError` for
`UNKNOWN_FUNCTION`, `UnsupportedInWasmError` for `UNSUPPORTED_IN_WASM`, and
`AjanCallError` for the others. The library stays loaded after either.

The names marked `async` (`httpRequest` and the `httpRequestStream` open and
reads) answer a promise on every backend, because the WASM fallback waits on
the host's fetch for them; await them. For tests, `@eserstack/ajan/ffi/fake`
builds a library whose names are answered by handlers.

### Loader order

`loadEserAjan()` tries two steps, in this order (decision-37):

1. The native library through `node:ffi`. The module is on by default since Node
   26.9 and prints an `ExperimentalWarning` on first use. Under the permission
   model (`--permission`), grant it with `--allow-ffi`.
2. The WASM build (`eser-ajan.wasm`, see [WASM Usage](#wasm-usage)), when step 1
   fails: Node before 26.9, a process started with `--no-experimental-ffi`, a
   missing library, or `--permission` without `--allow-ffi`.

When both fail, the error names both causes, the flags above and
`ESER_AJAN_LIB_PATH`. Calls through `node:ffi` are synchronous: a long call such
as `aiGenerateText` blocks the event loop until it returns. The table marks
those names `blocking`; M2-T8 (TASK-239) moves them to worker threads.

```bash
# Run with node:ffi turned off, so the WASM build serves the calls
NODE_OPTIONS=--no-experimental-ffi node --run cli -- ajan version
```

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

The shared library exports the dispatcher ABI (ABI 3, `dispatch.go`): six
functions, the same on every platform. Any language with FFI or ctypes support
can call it directly.

| Export                              | Answers                                                             |
| ----------------------------------- | ------------------------------------------------------------------- |
| `EserAjanVersion()`                 | The handshake JSON: `version`, `abi`, `profile`, `names`, `streams` |
| `EserAjanCall(name, request)`       | The envelope of one call                                            |
| `EserAjanStreamOpen(name, request)` | The envelope of a stream open; its result carries `handle`          |
| `EserAjanStreamRead(handle)`        | The envelope of the next chunk; a result of `null` ends it          |
| `EserAjanStreamClose(handle)`       | The envelope of the close                                           |
| `EserAjanFree(ptr)`                 | Releases a string any of the above returned                         |

`name` is a name of the Go dispatch registry, such as `cryptoHash`, and
`request` is a string: JSON for most names, the bare handle for the few that
take only a handle, empty for the ones that take nothing. Writes, resizes,
kills, pushes and cancels on an open stream are calls that take the handle in
their request (`shellExecWrite`, `shellPtyResize`, `parsingTokenizeStreamPush`,
`kitExtractTarballStreamPush`, `aiCancelRequest`).

Every operation answers an envelope:

```json
{"ok": true, "result": "{\"hash\":\"2cf24d...\"}"}
{"ok": false, "code": "HANDLER_ERROR", "error": "...", "result": "{\"error\":\"...\"}"}
{"ok": false, "code": "UNKNOWN_FUNCTION", "error": "unknown function: cryptoHashh"}
```

`result` is the bridge function's JSON answer. An answer with an `error` field
fails the envelope with `HANDLER_ERROR` and stays in `result`; a Go panic does
the same with `PANIC`, and the process keeps running. An envelope without
`result` means no bridge function ran: `UNKNOWN_FUNCTION`,
`UNSUPPORTED_IN_WASM`, `KIND_MISMATCH` (a call on a stream name or the other way
round), `UNKNOWN_HANDLE` or `BAD_REQUEST` (a request nested deeper than the
limit below). A host checks `abi` in the handshake right after loading the
library; the TypeScript loader refuses a library with another ABI version and
names both versions.

### C

```c
#include "libeser_ajan.h"
#include <stdio.h>

int main(void) {
    char* handshake = EserAjanVersion();
    printf("%s\n", handshake);
    EserAjanFree(handshake);

    char* hash = EserAjanCall("cryptoHash", "{\"text\":\"hello\"}");
    printf("%s\n", hash);
    EserAjanFree(hash);
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
import ctypes, json, sys
ext = {"linux": ".so", "darwin": ".dylib", "win32": ".dll"}[sys.platform]
lib = ctypes.cdll.LoadLibrary(f"./libeser_ajan{ext}")
lib.EserAjanCall.restype = ctypes.c_void_p
lib.EserAjanCall.argtypes = [ctypes.c_char_p, ctypes.c_char_p]
lib.EserAjanFree.argtypes = [ctypes.c_void_p]
ptr = lib.EserAjanCall(b"cryptoHash", b'{"text":"hello"}')
print(json.loads(ctypes.string_at(ptr)))
lib.EserAjanFree(ptr)
```

### Rust

```rust
extern "C" {
    fn EserAjanVersion() -> *mut std::os::raw::c_char;
    fn EserAjanCall(
        name: *const std::os::raw::c_char,
        request: *const std::os::raw::c_char,
    ) -> *mut std::os::raw::c_char;
    fn EserAjanFree(ptr: *mut std::os::raw::c_char);
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
  extern "void* EserAjanCall(char*, char*)"
  extern "void EserAjanFree(void*)"
end
ptr = EserAjan.EserAjanCall("cryptoHash", '{"text":"hello"}')
puts ptr.to_s
EserAjan.EserAjanFree(ptr)
```

Full working examples live in [`examples/`](./examples/).

## WASM Usage

The WASM build is one module, `eser-ajan.wasm`: the slim "wasi" profile of the
bridge, built with `-buildmode=c-shared` as a reactor (decision-45). It serves
the 44 names that work on wasip1 (formats, crypto, config, parsing and its
stream, collector, codebase walks, validators and checks with their streams,
cache, csGenerate, logging, HTTP), the ones the binding table marks `wasm:
"yes"` or `"fs"`; every other name answers `UNSUPPORTED_IN_WASM`, and the
TypeScript loader refuses the names marked `"no"` without calling the module. The noskills names left the profile with TASK-258: the
full spec lifecycle would take the module past its size limit. Loggers write
their records to the instance's stderr. `make ajan-wasm-check` fails when the
module grows past 8 MB, or 1.6 MB with brotli, or links aifx, the vendor AI
SDKs, gRPC, protobuf, QUIC, `os/exec`, `net/http` or the OpenTelemetry SDK.

The module exports `_initialize`, `memory` and five functions (dispatcher ABI
3, the same envelope as the native exports):

- `eser_ajan_alloc(size)` returns a pointer to `size` bytes of an input arena.
- `eser_ajan_call(namePtr, nameLen, argsPtr, argsLen)` runs one operation. The
  host writes the name, then the arguments, into the arena; each argument is a
  little-endian uint32 byte count followed by its bytes. A registry name is a
  call and takes one argument, its request; the reserved names `stream.open`
  (stream name, request), `stream.read` (handle) and `stream.close` (handle)
  are the stream operations. It returns the length of the envelope.
- `eser_ajan_result_ptr()` points at that envelope until the next call.
- `eser_ajan_call_async` and `eser_ajan_async_result_ptr()` are the same for the
  calls that wait on the host, with their own result buffer.

### Network on the WASM fallback

wasip1 cannot open a socket, so the HTTP names (`httpCreate`, `httpRequest`,
the `httpRequestStream` stream, `httpClose`) ask the host through the module's
`eser_host` imports, which the loader provides on the runtime's `fetch`
(decision-45, TASK-277). With JSPI (`WebAssembly.Suspending`, on in Node 26 and
workerd), the module waits on the host's promise; the loader calls these names
through `WebAssembly.promising`, so `httpRequest` and the `httpRequestStream`
open and reads return promises (the table marks them `async`). They run one at a time; other calls go on while one waits.
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

The `version` call answers the same handshake as the native `EserAjanVersion`,
with the profile `wasi` and its 44 names, which the TypeScript loader checks
once at load. `loadEserAjanWasm()` compiles the module
once, keeps one instance (so handles survive between calls), replaces it after a
trap, and gives it a preopen of the working directory when `node:wasi` is
available, which the filesystem functions need.

```typescript
import * as wasm from "@eserstack/ajan/wasm";

const lib = await wasm.loadEserAjanWasm();
console.log(lib.handshake.names.length); // 44
lib.call("shellExec", { command: "true" }); // throws UnsupportedInWasmError
```

### Nesting limit

The bridge refuses JSON and YAML (and TOML) nested deeper than 1,000 levels,
`MaxNestingDepth` in [ajan/formatfx](../../ajan/formatfx/README.md), with error
JSON that names the limit. The dispatcher checks every JSON request before a
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

Environment variables switch off steps of the loader order. Set any of these
to `disabled` to skip the corresponding step:

| Variable                    | Effect                                                                  |
| --------------------------- | ----------------------------------------------------------------------- |
| `ESER_AJAN=disabled`        | Disable both steps (native + WASM); `loadEserAjan()` throws immediately |
| `ESER_AJAN_NATIVE=disabled` | Skip `node:ffi`; go straight to the WASM fallback                       |
| `ESER_AJAN_WASM=disabled`   | Disable the WASM fallback; only try `node:ffi`                          |

### Examples

```bash
# Force WASM-only (skip node:ffi)
ESER_AJAN_NATIVE=disabled node --run cli -- ajan version

# Disable all (useful for testing error paths)
ESER_AJAN=disabled node --run cli -- ajan version

# Native only, no WASM fallback (for CI)
ESER_AJAN_WASM=disabled node --run cli -- ajan version
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
`ESER_AJAN_NATIVE=disabled` is set, `{ native: true }` will NOT re-enable
`node:ffi`.

Set `ESER_AJAN_DEBUG` to any value to print, on stderr, why a step was skipped
or failed. Nothing is printed while it is unset.

### Library and module paths

| Variable              | Default                           | Purpose                                                           |
| --------------------- | --------------------------------- | ----------------------------------------------------------------- |
| `ESER_AJAN_LIB_PATH`  | unset: search the locations below | Full path of the native library, e.g. `/opt/eser/libeser_ajan.so` |
| `ESER_AJAN_WASM_PATH` | unset: search the locations below | Full path of the WASM module, e.g. `/opt/eser/eser-ajan.wasm`     |
| `ESER_AJAN_DEBUG`     | unset: no diagnostics             | Any value prints loader order diagnostics on stderr, e.g. `1`     |

None is required. Without an override, the native library is looked up next to
the module, in `dist/`, in the `@eserstack/ajan-{platform}` package and in
`/usr/local/lib` and `/usr/lib`; the WASM module next to the module, in `dist/`,
in `@eserstack/ajan-wasm` and in the same system directories.

## Test

```bash
# Go bridge
cd pkg/@eserstack/ajan && go test -race ./...

# TypeScript loaders
node --test --test-force-exit pkg/@eserstack/ajan/
```

## Upgrading from 4.x

These changes since 4.5.2 need a change in code, commands or files that use this
package. The [changelog](https://github.com/eser/stack/blob/main/CHANGELOG.md)
lists the changes in every package.

- The library exports the six functions of the dispatcher ABI instead of the 99
  `EserAjan*` exports, and `FFILibrary.symbols` is gone. Before: the
  `EserAjanCryptoHash` symbol with a JSON string in and a JSON string out.
  After: `lib.call("cryptoHash", req)` with an object in and the parsed answer
  out. A C, Python or Rust host calls
  `EserAjanCall("cryptoHash", requestJson)` and reads `result` from the
  envelope. The names are the dispatch names in `ffi/bindings.ts`.
- The stream exports became streams: `aiStreamText`, `aiStreamRead` and
  `aiFreeStream` are `lib.stream("aiTextStream", ...)` with `read()` and
  `close()`; likewise `httpRequestStream`, `shellExecStream` (was
  `shellExecSpawn`), `shellPtyStream` (was `shellPtySpawn`),
  `shellTuiKeypressStream` (was `shellTuiKeypressCreate`),
  `codebaseWalkFilesStream`, `codebaseValidateFilesStream` and
  `parsingTokenizeStream` (its chunks still go in through
  `parsingTokenizeStreamPush`, and `close()` answers the flushed tokens).
- `aiGenerateText` and the `aiTextStream` open take one request,
  `{ modelHandle, options }`, instead of a handle and an options JSON.
- `version` answers the handshake JSON instead of `eser-ajan version X`, and
  `init` and `shutdown` answer `{}` instead of `initialized` and `shutdown`;
  read the version from `lib.handshake.version`.
- The WASM module speaks ABI 3: a host of ABI 2 refuses it, and the stream
  names go through `stream.open`, `stream.read` and `stream.close`.

- The bridge runs on Node only, through `node:ffi` with the WASM build as the
  fallback; the other runtime backends and their native npm dependency are gone. Run on
  Node 26.9 or later, and pass `--allow-ffi` under `--permission`.
- `LoadOptions.backends`, `detectRuntime()`, `selectBackend()` and the
  `FFIBackend` and `RuntimeId` types are removed. Drop `backends` from
  `loadEserAjan()` calls; `native` and `wasm` still choose the steps.
- `@eserstack/ajan/wasm` probes files with `process.getBuiltinModule("node:fs")`,
  as `ffi/resolve.ts` does. On a host without it (browsers),
  `loadEserAjanWasm()` without `wasmPath` throws "Could not find eser-ajan WASM
  module". Pass `wasmPath`.
- The WASM resolver no longer looks for `eser-ajan.wasm.bin`. Rename such a
  copy to `eser-ajan.wasm`, or point `ESER_AJAN_WASM_PATH` at it.
- The WASM fallback is one module, `eser-ajan.wasm`, the wasi-profile reactor.
  The per-call module that read a JSON request on stdin,
  `eser-ajan-reactor.wasm` and the `mode` option of `loadEserAjanWasm()` and
  `resolveWasmPath()` are gone; drop `mode` from calls. Names outside the
  profile throw `UnsupportedInWasmError` (code `UNSUPPORTED_IN_WASM`) instead of
  failing per call.
- `shellExec` stops a command after 10 minutes when the request has no
  `timeout`, and rejects a zero or negative `timeout` before the command starts.
  Before: `{"timeout": "0s"}` meant no limit. After: omit `timeout` for the
  default, or send a positive Go duration such as `"30m"`.
- `httpRequest` returns the status and headers with an error and no body
  for a response over 32 MiB, and `httpRequestStream` reads error-status
  bodies under the same limit. Send `maxResponseBytes` in the request JSON, or
  use the stream variant.
- `codebaseValidateFiles` and its stream variant fail the request for
  malformed `validatorOptions` of `filenames` or `large-file`, and `large-file`
  applies `maxKb`; it was always 1024 KB.
- `noskillsInit` writes `command: npx eser@latest noskills`
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
