# Workflow Facts for eser/stack

Facts about the eser/stack repository that the workflow-practices skill refers
to. The skill states the rules; this file names the concrete areas, commands
and files they apply to here.

## Full Gate and Narrower Commands

The full gate is `pnpm cli ok`. It runs the precommit workflow from
`.eser/manifest.yml`: the codebase validators, `oxfmt --check`, `oxlint`,
`tsc --noEmit`, the node:test suites with coverage, and the Go checks.

```bash
pnpm cli workflows run -e precommit --only validate-eof   # one validator step
pnpm cli go-ok     # Go only; same as make ok
make lint          # golangci-lint on the root module
make test          # go test -race
pnpm cli test      # node:test with coverage
pnpm cli preflight # release-only steps; needed before tagging
```

`--only` matches a step's tool name, so it selects one validator. The shell
steps (`formatter`, `linter`, `type-check`, `tests` and the Go checks) do not
match their names; run the command each one lists in `.eser/manifest.yml`.

`make ok` covers Go only, so it never replaces `pnpm cli ok` for a change that
touches TypeScript.

## File Ownership

| Area                         | Concern                                                                             |
| ---------------------------- | ----------------------------------------------------------------------------------- |
| `pkg/@eserstack/standards/`  | Cross-runtime abstractions; **high impact**, every package depends on it            |
| `pkg/@eserstack/codebase/`   | Repo tooling and validators; owns `cli-system/`, the command tree of every binary   |
| `pkg/@eserstack/cli/`        | The `eser` binary and its npm bundle                                                |
| `pkg/@eserstack/noskills*/`  | Spec workflow, daemon client, web dashboard                                         |
| `pkg/@eserstack/laroux*/`    | Framework: server, bundler, React integration                                       |
| `pkg/@eserstack/ai/`         | AI providers: TypeScript adapters and the Go bridge                                 |
| `pkg/@eserstack/kit/`        | Recipes and scaffolding                                                             |
| `pkg/@eserstack/ajan/`       | FFI bridge to the Go library; its own Go module                                     |
| `pkg/ajan/`                  | Go library packages (`*fx`); `api/business/` is pure domain, `api/adapters/` is I/O |
| `pkg/ajan/noskillsserverfx/` | The noskills daemon: sessions, ledger, agent and mux workers                        |
| `cmd/`                       | Go entry points: `eser`, `noskills`, `noskills-server` and the laroux stub          |
| `.github/workflows/`         | CI/CD; **high impact**                                                              |
| `.eser/`                     | Workflow manifest, recipes and scripts                                              |
| `.agents/skills/`            | Agent rules; update them when a convention changes                                  |

A package is `pkg/@eserstack/<name>/` or one `pkg/ajan/<name>fx/`.

## High-Impact Changes That Need Approval

- a new import between `@eserstack/*` packages that did not depend on each
  other before;
- any change to `@eserstack/standards` or `.github/workflows/`;
- publishing configuration: `exports`, `files`, `bin` and
  `optionalDependencies` in a `package.json`, and the npm build scripts.

## Generated Files and Versions

- `VERSION` holds the shared version; `eser codebase release` bumps it and
  every `package.json` together.
- Each package's `package.json` is its only manifest; nothing generates
  another one from it.
- Lock files: `pnpm-lock.yaml` and `go.sum`.

## Commits, Pushes and Releases

AGENTS.md here does not delegate task commits to agents, so the Parallel Task
Agents flow of workflow-practices does not apply. An agent commits only when
the user asks for that commit, with the configured git identity and a one- or
two-line message. Pushes, tags and releases are the user's: an agent does not
start, suggest or offer them.

## Release Commands

`eser codebase release`, `rerelease` and `unrelease` commit, push to `main` and
push tags. The `v*.*.*` tag push starts publishing to npm; JSR is frozen at
4.5.x (decision-5).

## Package Layers

`.github/ARCHITECTURE.md` defines the layers a cross-package change follows,
dependencies first: Layer 0 (`@eserstack/standards` and other foundations),
then core utilities and infrastructure, then the framework, and the shipped
binaries last (Layer 4: `cli`, `noskills`, `laroux-server`). All packages share
one version, so a cross-package change needs no per-package bump.
