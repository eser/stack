# 🧰 [ajan/kitfx](./)

> **eserstack Go library** in the root module `github.com/eser/stack`. Import
> `github.com/eser/stack/pkg/ajan/kitfx`. The module is not published for
> `go get`: build inside this repository, or require `github.com/eser/stack`
> with a `replace` directive that points at a checkout.

`kitfx` is the recipe engine behind `eser kit`: it loads a registry manifest
(`.eser/recipes.json`), orders a recipe after the recipes it requires, and
writes the recipe's files into a project with `{{.name}}` variables substituted,
then runs its post-install commands. It also clones a standalone `recipe.json`
from a GitHub repository, or the whole repository from its tarball when there is
no recipe file. Its behaviour follows the TypeScript kit in
`pkg/@eserstack/kit`, and `cmd/eser` has a test that runs both on the same
fixtures and compares the trees they write.

kitfx does not prompt or print on its own. A caller passes writers for the
progress lines and warnings, and a `PromptFunc` when missing variables should be
asked for; `cmd/eser` passes one built on `clifx.Prompter`.

## Quick Start

```go
package main

import (
	"context"
	"log"
	"os"

	"github.com/eser/stack/pkg/ajan/kitfx"
)

func main() {
	ctx := context.Background()

	manifest, _, err := kitfx.LoadRegistry(ctx, &kitfx.LoadRegistryOptions{
		Source: ".eser/recipes.json",
		CWD:    ".",
	})
	if err != nil {
		log.Fatal(err)
	}

	chain, err := kitfx.ApplyRecipeChain(ctx, "library-pkg", manifest, kitfx.ApplyOptions{
		CWD:                      "./my-lib",
		SourceBase:               manifest.RegistryURL,
		Variables:                map[string]string{"project_name": "my-lib"},
		SkipConflicts:            true,
		StrictVariables:          true,
		StopOnPostInstallFailure: true,
		Stdout:                   os.Stdout,
		Stderr:                   os.Stderr,
	})
	if err != nil {
		log.Fatal(err)
	}

	for _, recipe := range chain.Recipes {
		log.Printf("%s: %d file(s)", recipe.Name, len(recipe.Result.Written))
	}
}
```

## Registries

`LoadRegistry` reads `Source` (a path, or an http or https URL). Without one it
looks for `.eser/recipes.json` in `CWD` and its parents when `Local` is set, and
otherwise loads the eser/stack registry from GitHub (`DefaultRegistryURL`).
`ParseRegistryManifest` checks the manifest with the TypeScript kit's rules:
`name`, `description`, `author`, `registryUrl` and `recipes` present, each
recipe with a name, description, language, scale and files, known file kinds and
providers, and unique names. A `$schema` that does not name `registry/v1` loads
with a warning.

The older `FetchRegistry` stays for the FFI bridge: it walks up from the
directory when no source is given and does not validate.

## Applying a recipe

`ApplyRecipe` writes one recipe; `ApplyRecipeChain` writes a recipe after the
recipes it requires (`ResolveRequires`). Each file source resolves against
`SourceBase`, the manifest's `registryUrl`: an http or https base is fetched, a
`file://` URL or a plain path is read from disk, and a folder entry under a
`raw.githubusercontent.com` base is listed through the GitHub contents API. A
folder copies the files directly in it, not its subdirectories. Without a
`SourceBase` each source is a path of its own, as before.

These options select the TypeScript kit's behaviour. Their zero values keep the
earlier Go behaviour that the bridge relies on:

| Option                     | Set                                                                | Unset                                         |
| -------------------------- | ------------------------------------------------------------------ | --------------------------------------------- |
| `SkipConflicts`            | an existing file target is skipped with a warning on `Stderr`      | the apply stops with `ErrFileExists`          |
| `StrictVariables`          | only declared variables are substituted; a missing one is an error | undeclared values pass through, missing is "" |
| `StopOnPostInstallFailure` | the first failed command ends the apply with a `*PostInstallError` | a failed command is logged and the rest run   |

Every mode checks a variable's `pattern` (Go RE2 syntax) and asks through
`Prompt` for a declared variable without a value or default. A dry run prints
`[dry-run]` lines and lists the post-install commands without running them;
`SkipPostInstall` leaves them out. Targets that leave `CWD`, absolute ones
included, stop the apply with `ErrPathTraversal`.

`{{.name}}` is substituted in file contents. As in the TypeScript kit, a file
list recipe keeps its source and target paths as written and does not read
`ignore`; both apply in whole-repo mode.

## Cloning from GitHub

`FetchRecipeFromRepo` reads `recipe.json` (or `RecipePath`) from a repository
that `ResolveSpecifier` parsed: `owner/repo`, `owner/repo#ref`,
`gh:owner/repo/sub/path#ref`. A missing file returns `ErrRecipeFileNotFound`.

A recipe without `files` and an `ApplyOptions.Specifier` copies the whole
repository: kitfx downloads its tarball, extracts it with `ExtractTarball`
within `MaxBytes` (256 MiB by default) and `MaxEntries` (20,000), and copies
every regular file that `ignore` and the fixed list (`.git`, `recipe.json`,
`eser-registry.json`) keep. `{{.name}}` is substituted in path segments and in
text files; files with a binary extension (`IsBinaryFile`) are copied as they
are. An archive over a limit returns a `*TarballLimitError`.

`GitHubEndpoints` holds the raw, API and codeload base URLs, and `HTTPClient`
the client, so tests run against `httptest`.

## Dependencies

`DetectProjectType` looks for `go.mod`, `deno.json`, `deno.jsonc` and
`package.json`, in that order. `GetDependencyInstructions` returns `go get`,
`deno add` and `npm install` commands for a recipe's dependencies, with a
warning when the project type does not suit the recipe's language.
`RunInstallCommands` runs them with their output on the given writers and stops
at the first failure; `InstallDependencies` captures the output and runs them
all.

## 🔗 Links

- `go doc github.com/eser/stack/pkg/ajan/kitfx`: the API reference generated
  from source
- [cmd/eser](../../../cmd/eser/README.md): the `eser kit` commands
- [ajan/clifx](../clifx/README.md): the prompts `eser kit` asks with
- [eser/stack on GitHub](https://github.com/eser/stack)
