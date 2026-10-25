# 📦 [@eserstack/ajan-darwin-x64](./)

eser-ajan shared library for macOS x64 (Intel).

Prebuilt `libeser_ajan.dylib` for the [@eserstack/ajan](../ajan) FFI bridge,
with its C header `libeser_ajan.h`, installed automatically as an optional
dependency of `@eserstack/ajan` and the `eser` CLI on this platform.
`make ajan-lib TARGET=<id>` at the repository root builds the library into
`pkg/@eserstack/ajan/dist/`, and `make ajan-packages` copies it here. The binary
is a build output and is not committed; only this manifest is.

## 🔗 Links

- [@eserstack/ajan](../ajan/README.md): the FFI bridge that loads this library
- [eser/stack on GitHub](https://github.com/eser/stack)
