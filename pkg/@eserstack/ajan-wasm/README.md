# 📦 [@eserstack/ajan-wasm](./)

WebAssembly fallback for the [@eserstack/ajan](../ajan) FFI bridge, used when no
native library is available for the platform or node:ffi is turned off. It holds
`eser-ajan.wasm`, the slim "wasi" profile of the bridge built as a reactor: one
instance serves every call and keeps its handles, and functions outside the
profile (AI, HTTP, logging, shell) answer `UNSUPPORTED_IN_WASM`.

`make ajan-wasm` at the repository root builds the module into
`pkg/@eserstack/ajan/dist/wasi/`, and `make ajan-packages` copies it here. The
`.wasm` module is a build output and is not committed; only this manifest is.

## 🔗 Links

- [@eserstack/ajan](../ajan/README.md): the FFI bridge and the WASM loader, with
  the names the profile serves
- [eser/stack on GitHub](https://github.com/eser/stack)
