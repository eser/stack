# eserstack

[![JSR @eser](https://jsr.io/badges/@eser)](https://jsr.io/@eser)
[![codecov](https://codecov.io/gh/eser/stack/branch/main/graph/badge.svg?token=7TIL2XPJB6)](https://codecov.io/gh/eser/stack)
[![Build Pipeline](https://github.com/eser/stack/actions/workflows/build.yml/badge.svg)](https://github.com/eser/stack/actions/workflows/build.yml)
[![Built with the Deno Standard Library](https://raw.githubusercontent.com/denoland/deno_std/main/badge.svg)](https://deno.land/std)

<p align="center">
  <a href="./">
    <img alt="eser stack javascript toolkit" src="./etc/cover.svg" width="849" />
  </a>
</p>

eserstack is eser's personal software workshop — a foundation layer, developer
tools, and product incubator, all built on a single philosophy.

> This workshop runs on a shared philosophy ([PHILOSOPHY.md](./PHILOSOPHY.md))
> and a common set of directives that apply across all packages, contributors,
> and community channels
> ([@eserstack/directives](./pkg/@eserstack/directives/README.md)).

## Why eserstack?

Built for developers who:

- **Think in layers** — foundation first, tools on top, products last
- **Believe in explicit constraints** — quality is encoded at the start, not
  gated at the end
- **Want human-in-the-loop AI** — tools that think but don't decide
- **Build to ship** — real products, not perpetual side projects

## Packages

### Foundation

Stable, minimal, rarely changes. Axioms the rest builds on.

| Package                                             | Description                                              |
| --------------------------------------------------- | -------------------------------------------------------- |
| [@eserstack/primitives](pkg/@eserstack/primitives/) | Result\<T,E\>, Option\<T\>, type guards                  |
| [@eserstack/fp](pkg/@eserstack/fp/)                 | 70+ functional programming combinators                   |
| [@eserstack/di](pkg/@eserstack/di/)                 | IoC container, Registry, Scope                           |
| [@eserstack/standards](pkg/@eserstack/standards/)   | Cross-runtime, i18n, formatters, logging levels          |
| [@eserstack/functions](pkg/@eserstack/functions/)   | Monadic do-notation, middleware, trigger adapters        |
| [@eserstack/events](pkg/@eserstack/events/)         | Event bus, pub/sub                                       |
| [@eserstack/directives](pkg/@eserstack/directives/) | Ecosystem ground rules — technical and social directives |

### Libraries & Tools

Active, maintained, published independently. No CLI (Libraries) or
workflow-facing (Tools).

| Package                                           | Description                                                    |
| ------------------------------------------------- | -------------------------------------------------------------- |
| [@eserstack/shell](pkg/@eserstack/shell/)         | CLI framework: args, completions, exec, TUI                    |
| [@eserstack/formats](pkg/@eserstack/formats/)     | Bidirectional format conversion (JSON, YAML, CSV, TOML, JSONL) |
| [@eserstack/streams](pkg/@eserstack/streams/)     | Pipeline I/O                                                   |
| [@eserstack/logging](pkg/@eserstack/logging/)     | Hierarchical logging, OpenTelemetry                            |
| [@eserstack/codebase](pkg/@eserstack/codebase/)   | Git ops, scaffolding, version management                       |
| [@eserstack/workflows](pkg/@eserstack/workflows/) | Event-driven workflow engine                                   |
| [@eserstack/ai](pkg/@eserstack/ai/)               | AI provider abstraction (Claude, OpenAI, Gemini)               |

<details>
<summary>Full list (all Libraries & Tools)</summary>

**Libraries**

| Package                                               | Description                                                    |
| ----------------------------------------------------- | -------------------------------------------------------------- |
| [@eserstack/formats](pkg/@eserstack/formats/)         | Bidirectional format conversion (JSON, YAML, CSV, TOML, JSONL) |
| [@eserstack/streams](pkg/@eserstack/streams/)         | Pipeline I/O                                                   |
| [@eserstack/parsing](pkg/@eserstack/parsing/)         | Tokenizer, lexer, AST                                          |
| [@eserstack/logging](pkg/@eserstack/logging/)         | Hierarchical logging, OpenTelemetry                            |
| [@eserstack/http](pkg/@eserstack/http/)               | HTTP middleware, response helpers                              |
| [@eserstack/crypto](pkg/@eserstack/crypto/)           | Web Crypto wrappers                                            |
| [@eserstack/cache](pkg/@eserstack/cache/)             | XDG cache directories                                          |
| [@eserstack/config](pkg/@eserstack/config/)           | .env + env var configuration                                   |
| [@eserstack/testing](pkg/@eserstack/testing/)         | fakeFs, fakeServer, tempDir                                    |
| [@eserstack/jsx-runtime](pkg/@eserstack/jsx-runtime/) | Server-side JSX                                                |
| [@eserstack/collector](pkg/@eserstack/collector/)     | Export manifest generation                                     |
| [@eserstack/cs](pkg/@eserstack/cs/)                   | CS utilities (algorithms, data structures)                     |
| [@eserstack/ajan](pkg/@eserstack/ajan/)               | Go/WASM FFI bridge                                             |
| [@eserstack/registry](pkg/@eserstack/registry/)       | Recipe registry, distribution protocol, handlers               |

**Tools**

| Package                                               | Description                                      |
| ----------------------------------------------------- | ------------------------------------------------ |
| [@eserstack/bundler](pkg/@eserstack/bundler/)         | Abstract bundler, snapshot AOT                   |
| [@eserstack/shell](pkg/@eserstack/shell/)             | CLI framework: args, completions, exec, TUI      |
| [@eserstack/codebase](pkg/@eserstack/codebase/)       | Git ops, scaffolding, version management         |
| [@eserstack/workflows](pkg/@eserstack/workflows/)     | Event-driven workflow engine                     |
| [@eserstack/kit](pkg/@eserstack/kit/)                 | Recipe + template distribution                   |
| [@eserstack/cli](pkg/@eserstack/cli/)                 | Main entrypoint CLI                              |
| [@eserstack/ai](pkg/@eserstack/ai/)                   | AI provider abstraction (Claude, OpenAI, Gemini) |
| [@eserstack/app-runtime](pkg/@eserstack/app-runtime/) | Application lifecycle management                 |

</details>

### Products

Growing toward — or already with — their own identity.

| Package                                                     | Status            | Description                                              |
| ----------------------------------------------------------- | ----------------- | -------------------------------------------------------- |
| [@eserstack/noskills](pkg/@eserstack/noskills/)             | **GRADUATED**     | AI development orchestrator                              |
| [@eserstack/noskills-web](pkg/@eserstack/noskills-web/)     | Product           | web dashboard for noskills                               |
| [@eserstack/laroux](pkg/@eserstack/laroux/)                 | Product-Candidate | framework-agnostic web core — Growing toward graduation. |
| [@eserstack/laroux-react](pkg/@eserstack/laroux-react/)     | Product-Candidate | React integration for laroux                             |
| [@eserstack/laroux-server](pkg/@eserstack/laroux-server/)   | Product-Candidate | SSR runtime for laroux                                   |
| [@eserstack/laroux-bundler](pkg/@eserstack/laroux-bundler/) | Product-Candidate | build pipeline for laroux                                |

### Where to start

| Goal                                | Entry point                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------ |
| AI-assisted project development     | **noskills** → [install](#noskills)                                                  |
| Add typed utilities to your project | **@eserstack/fp**, **@eserstack/di** → `pnpm add jsr:@eserstack/fp`                  |
| Build a web app                     | **laroux** → [laroux docs](./pkg/@eserstack/laroux/README.md)                        |
| Understand the philosophy           | **PHILOSOPHY.md** → [read it](./PHILOSOPHY.md)                                       |
| Understand how eserstack operates   | **@eserstack/directives** → [ecosystem rules](./pkg/@eserstack/directives/README.md) |

## noskills

[![JSR](https://jsr.io/badges/@eserstack/noskills)](https://jsr.io/@eserstack/noskills)

> AI development orchestrator — structured discovery, human-in-the-loop, quality
> gates. Before a single line of code, noskills asks the right questions.

**Standalone install:** `pnpm add jsr:@eserstack/noskills` (or curl/npx/brew/nix
— [see all options](https://eser.run/install)) **In Claude Code:** Add to your
project and use via `deno task cli noskills spec new "description"`

![noskills demo from Claude Code](./etc/noskills-demo.gif)

<!-- TODO: record demo GIF showing CC agent workflow -->

[How it works →](./pkg/@eserstack/noskills/README-HOW.md)

## 🚀 Jumpstart

Ensure that [Deno](https://deno.land/) 2.4 or higher is installed on your system
first.

### Install the CLI

```bash
# macOS / Linux — install script
curl -fsSL https://eser.run/install | sh
# Downloads eser binary to ~/.local/bin. Inspect: https://eser.run/install

# Homebrew
brew install eser

# Nix
nix run github:eser/stack

# Deno (via JSR)
deno run jsr:@eserstack/cli

# npm / npx
npm install -g eser
# or: npx eser <command>
```

### Browse available recipes

```bash
$ eser kit list

PROJECTS
  library-pkg          Deno library package with tests and README
  laroux-app           Laroux.js web application with SSR and React
  go-service           Go microservice with hexagonal architecture
  ...

UTILITIES
  fp-pipe              Functional pipe and compose utilities
  ajan-httpfx          Ajan HTTP server framework
  ...
```

### Create a new project

```bash
$ eser kit new laroux-app --name my-site

✓ Created my-site with 14 file(s)
```

### Add a recipe to an existing project

```bash
$ eser kit add fp-pipe

✓ Added 1 file(s) from fp-pipe
  → lib/fp/pipe.ts
  ✓ pnpm add jsr:@eserstack/fp@^4.1.0
```

## Contributors

<!-- CONTRIBUTORS:START -->
<table>
  <tr>
    <td align="center"><a href="https://github.com/eser"><img src="https://avatars.githubusercontent.com/u/866558?v=4?s=80" width="80" /><br /><sub>eser</sub></a></td>
    <td align="center"><a href="https://github.com/ayhansipahi"><img src="https://avatars.githubusercontent.com/u/721142?v=4?s=80" width="80" /><br /><sub>ayhansipahi</sub></a></td>
    <td align="center"><a href="https://github.com/wralith"><img src="https://avatars.githubusercontent.com/u/75392169?v=4?s=80" width="80" /><br /><sub>wralith</sub></a></td>
  </tr>
</table>
<!-- CONTRIBUTORS:END -->

## 🙋🏻 FAQ

### Want to report a bug or request a feature?

If you're going to report a bug or request a new feature, please ensure first
that you comply with the conditions found under
[@eserstack/directives](https://github.com/eser/stack/blob/dev/pkg/@eserstack/directives/README.md).
After that, you can report an issue or request using
[GitHub Issues](https://github.com/eser/stack/issues). Thanks in advance.

### Want to contribute?

It is publicly open for any contribution from the community. Bug fixes, new
features and additional components are welcome.

If you're interested in becoming a contributor and enhancing the ecosystem,
please start by reading through our [CONTRIBUTING.md](CONTRIBUTING.md).

If you're not sure where to begin, take a look at the
[issues](https://github.com/eser/stack/issues) labeled `good first issue` and
`help wanted`. Reviewing closed issues can also give you a sense of the types of
contributions we're looking for and you can tackle.

If you're already an experienced OSS contributor, let's take you to the shortest
path: To contribute to the codebase, just fork the repo, push your changes to
your fork, and then submit a pull request.

### Requirements

- Deno 2.4 or higher (https://deno.land/)

### Versioning

This project follows [Semantic Versioning](https://semver.org/). For the
versions available, see the
[tags on this repository](https://github.com/eser/stack/tags).

### License

This project is licensed under the Apache 2.0 License. For further details,
please see the [LICENSE](LICENSE) file.

### To support the project...

[Visit my GitHub Sponsors profile at github.com/sponsors/eser](https://github.com/sponsors/eser)
