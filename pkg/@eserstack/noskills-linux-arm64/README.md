# 📦 [@eserstack/noskills-linux-arm64](./)

The noskills binary for Linux ARM64.

The prebuilt `noskills` of [cmd/noskills](../../../cmd/noskills), installed
automatically as an optional dependency of the `noskills` npm package on this
platform; that package's `noskills` command runs it. `eser dev compile` at the
repository root builds the release archives into `etc/temp/binaries/`, and
`eser dev npm-binaries` copies the binary here. The binary is a build output and
is not committed; only this manifest is.

## 🔗 Links

- [cmd/noskills](../../../cmd/noskills/README.md): the Go noskills CLI
- [noskills](../noskills/README.md): the npm package that installs this one
- [eser/stack on GitHub](https://github.com/eser/stack)
