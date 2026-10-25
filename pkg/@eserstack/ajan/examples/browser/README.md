# eser-ajan WASM Browser Example

Minimal browser demo that loads `eser-ajan.wasm`, the wasi-profile reactor,
through a custom WASI shim and calls its functions on one reused instance.

## Prerequisites

Build the WASM binary from the repository root:

```bash
make ajan-wasm
```

## Setup

Copy the compiled WASM file into this directory:

```bash
cp pkg/@eserstack/ajan/dist/wasi/eser-ajan.wasm pkg/@eserstack/ajan/examples/browser/
```

## Run

Start a local HTTP server (WASM requires proper MIME types):

```bash
cd pkg/@eserstack/ajan/examples/browser
python3 -m http.server 8080
```

Or with Node.js:

```bash
npx serve pkg/@eserstack/ajan/examples/browser -p 8080
```

Open [http://localhost:8080](http://localhost:8080) in your browser.

## How it works

1. The page fetches `eser-ajan.wasm` via the Fetch API and compiles it with
   `WebAssembly.compile()`.
2. It creates one instance with the WASI shim and calls `_initialize`.
3. Each call writes the function name and its length-prefixed arguments into the
   module's input arena (`eser_ajan_alloc`), runs `eser_ajan_call` and parses
   the JSON envelope at `eser_ajan_result_ptr()`.

This is the protocol of the Node loader in `wasm/loader-reactor.ts`,
with the WASI shim inlined as plain JavaScript for zero-dependency browser use.
The shim has no filesystem, so the functions that read files answer the WASI
error here.
