# 📦 [@eserstack/eser-darwin-arm64](./)

The eser binary for macOS ARM64 (Apple Silicon).

The prebuilt `eser` of [cmd/eser](../../../cmd/eser), installed
automatically as an optional dependency of the `eser` npm package on this
platform; that package's `eser` command runs it.
`eser codebase dist compile` at the repository root builds the release archives
into `etc/temp/binaries/`, and `eser codebase dist npm-binaries` copies the
binary here. The binary is a build output and is not committed; only this
manifest is.

## 🔗 Links

- [cmd/eser](../../../cmd/eser/README.md): the Go eser CLI
- [eser](../eser-bin/README.md): the npm package that installs this one
- [eser/stack on GitHub](https://github.com/eser/stack)
