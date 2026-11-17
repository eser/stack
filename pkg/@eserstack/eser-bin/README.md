# ⚡ [eser](./)

The `eser` command, published to npm as the package `eser`: Eser's
swiss-army-knife tooling for the terminal. It runs the workflows and validators
of a repository's `.eser/manifest.yml` (`eser ok`), its scripts, recipes
(`eser kit`), release commands (`eser codebase`) and AI prompts (`eser ai`),
and hands `eser noskills`, `eser laroux` and `eser posts` to their own
commands. [cmd/eser](../../../cmd/eser/README.md) lists every command.

```bash
npm install -g eser
eser --help
```

`npx eser <command>` works too.

The command is the Go build of eser ([cmd/eser](../../../cmd/eser)). This
package holds only a launcher: it runs the binary of the optional dependency
`@eserstack/eser-<platform>` that npm installs for this machine, for macOS
(ARM64 and x64), Linux (ARM64 and x64) and Windows x64. It depends on
[`noskills`](../noskills-bin/README.md) at its own version, so `eser noskills`,
and the `npx eser@latest noskills` hooks that eser 4.5 wrote into
repositories, run noskills with no other install.

Without npm, install the same binary with
`curl -fsSL https://raw.githubusercontent.com/eser/stack/main/etc/scripts/install.sh | sh`,
`brew install eser/tap/eser` or `nix profile install github:eser/stack`; on
Windows use `install.ps1`. An eser installed with npm is updated with npm
(`npm install -g eser@latest`), not with `eser update`.

## 🔗 Links

- [cmd/eser](../../../cmd/eser/README.md): the Go eser CLI and its commands
- [noskills](../noskills-bin/README.md): the noskills command this package
  depends on
- [eser/stack on GitHub](https://github.com/eser/stack)
