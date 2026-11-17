# 🚦 [noskills](./)

The `noskills` command, published to npm as the package `noskills`: a
state-machine orchestrator for AI coding agents, which hands the agent one
instruction at a time and blocks it from skipping discovery, tests or proof of
done. The [@eserstack/noskills](../noskills/README.md) README describes the
workflow and every command.

```bash
npm install -g noskills
noskills init
```

`npx noskills <command>` works too, and is what the hooks noskills writes into
a repository call.

The command is the Go build of noskills ([cmd/noskills](../../../cmd/noskills)).
This package holds only a launcher: it runs the binary of the optional
dependency `@eserstack/noskills-<platform>` that npm installs for this machine,
for macOS (ARM64 and x64), Linux (ARM64 and x64) and Windows x64. The binary
hands `watch`, `manager` and `web`, which are not ported to Go yet, to the
TypeScript CLI of `@eserstack/noskills`, which this package depends on at its
own version.

Without npm, install the same binary with
`curl -fsSL https://raw.githubusercontent.com/eser/stack/main/etc/scripts/install.sh | sh -s noskills`,
`brew install eser/tap/noskills` or
`nix profile install github:eser/stack#noskills`; on Windows use
`install.ps1 -Product noskills`.

## 🔗 Links

- [@eserstack/noskills](../noskills/README.md): the workflow, the commands and
  the TypeScript modules
- [cmd/noskills](../../../cmd/noskills/README.md): the Go noskills CLI
- [eser/stack on GitHub](https://github.com/eser/stack)
