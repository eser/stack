# eser-ajan WASM Browser Example

Minimal browser demo that loads `eser-ajan.wasm` via a custom WASI shim and
calls functions using the command-mode JSON protocol (stdin/stdout).

## Prerequisites

Build the WASM binary from the package root:

```bash
deno run --allow-all scripts/build.ts --wasm
```

## Setup

Copy the compiled WASM file into this directory:

```bash
cp dist/wasm/eser-ajan.wasm pkg/@eserstack/ajan/examples/browser/
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
2. Each function call creates a fresh WASI shim instance with the JSON request
   pre-loaded as stdin bytes.
3. A new `WebAssembly.Instance` is created and `_start` is called, which reads
   stdin, processes the request, and writes the JSON response to stdout.
4. The shim captures stdout and the page parses the JSON result.

This is the same protocol used by the Deno/Node loader at
`wasm/loader-command.ts`, but with the WASI shim inlined as plain JavaScript for
zero-dependency browser use.
