# eser (Go)

The Go build of the eser CLI (M3-T4, ADR 0005). It does not replace the
TypeScript CLI yet: it covers manifest scripts, its own install, update and
diagnosis, plugin forwarding, the release commands of `eser codebase` and
`eser dev`, and `eser kit`, `eser cs` and `eser ai`. The other commands the
TypeScript CLI implements itself come in later M3 tasks.

```sh
make build            # bin/eser, with the version from VERSION
bin/eser --help       # built-in commands and the manifest's scripts
```

## Commands

- `eser <script> [args]` runs a script of `.eser/manifest.yml`, after its
  `depends`, in its `workingDirectory`. The arguments follow the command as
  separate words, and a command that starts with `eser` runs this binary.
- `eser version`, `eser --help`, `eser help <command>`,
  `eser completion bash|zsh|fish`.
- `eser install` copies the binary to `~/.local/bin` (when it exists) or
  `/usr/local/bin`; `eser uninstall` removes it from there.
- `eser update` downloads `eser-v<version>-<triple>.tar.gz` (`.zip` on Windows)
  from GitHub Releases, with the Rust target triples of decision-38, verifies it
  against the release's `SHA256SUMS.txt` and fails closed when it cannot, then
  renames the new binary over itself. A release without the archive ends with
  the `npm install -g eser` command.
- `eser doctor` reports the version, platform, binary, PATH, git, node, pnpm and
  go, the manifest and the git hooks; `--json` prints it as JSON.

## Release commands

`eser codebase` (alias `cb`) holds the release commands, on
`pkg/ajan/codebasefx`. Each one that changes a remote asks first, or takes
`--yes`; the confirmation reads a line when stdin is not a terminal.

- `release <patch|minor|major|same>` bumps every package, adds the changelog
  section already formatted as `deno fmt` formats it, commits
  `chore(codebase): release v<version>`, pushes the commit and then pushes the
  `v<version>` tag that starts the release pipeline. It refuses a dirty tree,
  and unpushed commits unless `--yes`. `--dry-run` prints each file it would
  write with the lines it would add and remove.
- `rerelease` deletes the version's tag and pushes it again at HEAD; `unrelease`
  deletes the version's GitHub Release and then its tag, locally and on the
  remote, and keeps the commit.
- `versions [sync|patch|minor|major|<version>]` (alias `version-bump`) shows the
  package versions, or changes them; `--dry-run` prints the edits.
- `changelog-gen` adds the section for the commits since the last tag.
- `gh release-tag`, `gh release-notes [--tag --create --title --repo]` and
  `gh contributors [--columns --readme --commit]` create the release tag, copy a
  version's changelog section to its GitHub Release, and update the contributor
  table of the README.

## Release builds: `eser dev`

- `eser dev compile [--current-only] [--out dir]` builds `eser` and
  `noskills-server` with `CGO_ENABLED=0` for the five release targets and writes
  `<name>-v<version>-<triple>.tar.gz` (`.zip` on Windows, the Rust triples of
  decision-38) and `SHA256SUMS.txt` to `etc/temp/binaries/`. `SOURCE_DATE_EPOCH`
  sets the time stored in the archives, so a rebuild of a commit gives the same
  bytes. A failed build is reported and the others still run; the exit code
  is 1.
- `eser dev homebrew` reads the release's `SHA256SUMS.txt` and pushes the
  formula of each binary it has archives for to `eser/homebrew-tap` with
  `GH_TOKEN`; the other formulas stay as they are.
- `eser dev nix-hashes` writes `nix/hashes.json`: the version and the SRI hash
  of each archive of `eser` and `noskills-server`, for the binaries the release
  has. The flake packages exactly the binaries the file lists.

Both take `--dry-run` (placeholder hashes for the binaries this release builds;
nothing is pushed or written) and `--sums <file>` (a local `SHA256SUMS.txt`).

## Recipes: `eser kit`

`eser kit` adds recipes to a project and starts projects from templates, on
`pkg/ajan/kitfx`. Its flags and output lines match the TypeScript kit, without
the colours. Recipes come from a registry manifest: `--registry` takes a path or
URL, `--local` uses the nearest `.eser/recipes.json` in this directory or a
parent, and the default is the registry of eser/stack on GitHub.

- `add <recipe>` writes the recipe after the recipes it requires, then installs
  its dependencies (`go get`, `deno add`, `npm install`) unless `--no-install`
  or `--dry-run`. `--var key=value` (repeatable) sets a variable, `--cwd` the
  project directory; `--force` overwrites existing files and `--skip-existing`
  leaves them, and without either an existing file is skipped with a warning.
  `--verbose` prints a line for each file.
- `list` prints the recipes by scale; `--language`, `--scale` and `--tag` filter
  them and `--json` prints the registry as JSON.
- `new <template>` (alias `create`) creates the `--name` directory (the template
  name by default) from a `project` recipe and overwrites what is there.
  `clone <specifier> [target-dir]` reads `recipe.json` (or `--recipe`) from
  `owner/repo[#ref]` or `gh:owner/repo/sub/path[#ref]`, and copies the whole
  repository or subpath from its tarball when there is none; `--name` (`-p`)
  names the target directory. The tarball is limited by `--max-bytes` and
  `--max-entries`, or `ESER_KIT_MAX_BYTES` and `ESER_KIT_MAX_ENTRIES`. Both take
  `--var`, `--no-post-install`, and `-i/--interactive` to ask for variables
  without a value; on a terminal they ask unless `--no-interactive`.
- `update <recipe>` writes the recipe's files again over the existing ones;
  `--dry-run` and `--verbose` work as for `add`.

A recipe's post-install commands run after its files are written, in the project
directory; the first one that fails stops the command.

## Kubernetes config: `eser cs`

`eser cs generate <cm|configmap|secret>/<name>` prints a ConfigMap or Secret
built from the `.env` files; `eser cs sync <resource>` reads the resource's keys
with `kubectl` and prints the `kubectl patch` command that sets them from the
environment (`-s` prints the patch only). The flags match the TypeScript CLI:
`-e/--env`, `-n/--namespace`, `-o/--output yaml|json` (generate defaults to
YAML, sync to JSON).

Both read the files of the environment in order, a later file replacing an
earlier value: `.env`, `.env.<env>`, `.env.local` (not for `test`) and
`.env.<env>.local`. The environment name comes from `-e`, then `ENV`, `APP_ENV`,
`NODE_ENV`, then `development`. `sync` also reads the process
environment, which replaces the files; `generate` does not. A resource key the
environment does not define is left out of the patch, with a warning on stderr.
A YAML manifest is one document, and data keys are sorted.

## AI providers: `eser ai`

`eser ai ask "prompt"` streams the answer of an AI provider, on `pkg/ajan/aifx`.
`-p/--provider` takes a name or alias (`cc` claude-code, `ol` ollama, `oc`
opencode, `kr` kiro, `ant` anthropic, `oai` openai, `gem` gemini, `vtx`
vertexai); without it the first available provider is used, in the order claude,
ollama on `localhost:11434`, opencode, then an Anthropic or OpenAI credential.
`-m/--model`, `--max-tokens n` and `--effort low|medium|high|xhigh|max` set the
request; `-v/--verbose` logs each step to stderr. `--json` waits for the whole
answer and prints the result in the shape of the TypeScript
`GenerateTextResult`. Ctrl-C stops the request and exits with code 130. The
answer is written as it arrives, without the TypeScript CLI's typewriter delay.

`eser ai list` prints each provider and whether it is available; `--json` prints
the list.

## Plugin forwarding

Any other `eser <name> [args]` runs, in this order (decision-10):

1. `eser-<name>` on PATH;
2. for `laroux`, `noskills` and `posts`, the bins `laroux`, `noskills` and
   `eser-posts`, on PATH and then in each directory of `ESER_PLUGIN_PATH`, which
   the npm launcher sets;
3. `npx --yes laroux@<version>` or `npx --yes noskills@<version>`, when npx is
   on PATH;
4. otherwise a message naming the `npm install -g` command.

The exit code of the plugin is the exit code of eser.
