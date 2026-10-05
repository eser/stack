# 📦 [@eserstack/ajan-wasm](./)

WebAssembly fallback for the [@eserstack/ajan](../ajan) FFI bridge, used when no
native library is available for the platform. It holds `eser-ajan.wasm` (command
mode) and `eser-ajan-reactor.wasm` (reactor mode).

`pkg/@eserstack/ajan/scripts/build.ts --wasm` builds both modules into
`pkg/@eserstack/ajan/dist/`, and `pkg/@eserstack/ajan/npm/generate-packages.ts`
copies them here. The `.wasm` modules are build outputs and are not committed;
only this manifest is.

## 🔗 Links

- [@eserstack/ajan](../ajan/README.md): the FFI bridge and the WASM loaders,
  with what each mode supports
- [eser/stack on GitHub](https://github.com/eser/stack)
