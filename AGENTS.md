# eserstack Development Guidelines

All development rules live in `.agents/skills/`. Load relevant skills before
starting any task. `.claude` is a symlink to `.agents`, so Claude Code reads the
same skills, settings and hooks; edit files under `.agents/` only.

## Skill Map

| When you need to...                          | Load skill                  |
| -------------------------------------------- | --------------------------- |
| Discover which skills apply                  | `eser-rules-manager`        |
| Releases, publishing, CI/CD, Docker, deploys | `release-and-ci`            |
| Design structure, test strategy, ADRs        | `architecture-guidelines`   |
| Write or review code quality                 | `coding-practices`          |
| Write or edit READMEs and docs               | `documentation-conventions` |
| Apply FP patterns, composition, async        | `design-principles`         |
| Write JS/TS, modules, types, TS tests        | `javascript-practices`      |
| Build React and web UI, laroux, a11y         | `frontend-practices`        |
| Write Go services                            | `go-practices`              |
| Handle secrets, auth, validation             | `security-practices`        |
| Clarify, roles, approvals, tasks, commits    | `workflow-practices`        |
| Interview a plan until nothing is open       | `enrichment`                |
| Hand the session over (`/handoff`)           | `handoff`                   |
| Tooling, dependencies, naming, packages      | `tooling-standards`         |

## Direction

The repository is becoming Eser's digital self, with `npx eser intro` as the one
entry point to their projects, writing, videos and know-how, for people and for
agents (ADR 0010, backlog doc-4, milestone m-9). The libraries stay generic. No
persona code is written until every task of m-0 to m-8 is Done, and README.md
and PHILOSOPHY.md are not rewritten for it. When a user says they are Eser, run
that command once it exists.

## Repository

A TypeScript and Go monorepo on Node (ADR 0005). Install with `pnpm install`;
the toolchain is Node `>=26.9` (`.node-version` pins the exact version), pnpm
11.18.0, oxfmt, oxlint, tsc 7 and node:test.

- `pkg/@eserstack/<name>/`: 50 packages (38 TypeScript libraries, the private
  test seam `@eserstack/test-kit`, six `ajan-*` platform packages and five
  `noskills-*` binary packages), all on the shared version in `VERSION`, plus
  `directives/`, which holds documents only. Tests import assertions and mocks
  from `@eserstack/test-kit`, never from `@std/assert` or `@std/testing/mock`
  directly. Publishing is npm only and JSR stays frozen at 4.5.x (decision-5):
  `eser`, `noskills` and `laroux` go to npm as bundles, the `ajan-*` and
  `noskills-*` packages as platform packages, and the libraries from 5.0.0
  (TASK-236).
- Go: the root module `github.com/eser/stack` (`go.mod`, `Makefile`,
  `.golangci.yaml` at the root; framework in `pkg/ajan/`, the server in
  `cmd/noskills-server/`) and the FFI bridge `pkg/@eserstack/ajan/`
  (`github.com/eser/ajan`), a second module with its own `go.mod`.
- Snake_case file names apply under `cmd/`, `pkg/ajan/` and
  `pkg/@eserstack/ajan/`; kebab-case everywhere else.
- `.eser/manifest.yml` holds the precommit validators and every
  `pnpm cli <script>`; `.eser/recipes/library-pkg/` is the template for a
  new package, `go-service/` for a Go service.
- Validators, release, version and changelog tooling live in
  `pkg/@eserstack/codebase/`; the architecture overview is
  `.github/ARCHITECTURE.md`.

## Repository Notes for Agents

The skills in `.agents/skills/` are portable conventions; these files hold the
eser/stack facts they refer to. Read the one for the area you work in.

| File                                                                                 | Read when                                                |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| [docs/agents/workflow.md](docs/agents/workflow.md)                                   | Checking ownership, high-impact areas, layers, the gates |
| [docs/agents/release-and-ci.md](docs/agents/release-and-ci.md)                       | Releasing, publishing, editing or debugging workflows    |
| [docs/agents/architecture-and-code.md](docs/agents/architecture-and-code.md)         | Placing code in layers, ADRs, tests, validators          |
| [docs/agents/languages-and-security.md](docs/agents/languages-and-security.md)       | Go modules and bridge, TS baselines, security specifics  |
| [docs/agents/documentation-and-tooling.md](docs/agents/documentation-and-tooling.md) | Where docs live, generators, naming excludes, recipes    |

## Essential Commands

```bash
pnpm ok            # Full gate, `eser ok`: validators, oxfmt, oxlint, tsc, node:test, Go (run before committing)
pnpm fix           # `eser fix`: the same workflow with fixes applied
pnpm preflight     # `eser preflight`: release-only steps (npm builds, consumer installs, wasm, Go compile); run before tagging
pnpm cli test      # node:test with coverage to etc/coverage.lcov
pnpm cli go-ok     # Go only: make ok (check, lint, test)
pnpm cli go-vuln   # govulncheck for both Go modules (network; CI runs it)
go run ./cmd/eser codebase <validator-name> [--fix]   # One validator with its manifest options, e.g. validate-circular-deps
pnpm cli --help    # Every command; the scripts are listed in .eser/manifest.yml
```

`eser ok`, `eser fix` and `eser preflight` run on the Go eser of `cmd/eser`,
which runs the workflows of `.eser/manifest.yml` on `pkg/ajan/workflowfx`;
`pnpm ok`, `pnpm fix` and `pnpm preflight` call it through `go run ./cmd/eser`,
so no install is needed. `eser codebase install` writes git hooks that run it.
`pnpm cli ok` still runs the same workflow on the TypeScript CLI.

The Makefile holds Go targets only (`ok`, `check`, `lint`, `fix`, `test`,
`test-coverage`, `build`, `tools`, `vuln`) and lints the root module only. The
bridge module cannot resolve the root module's `go tool golangci-lint`, so the
precommit `go-lint` step builds the pinned binary with
`go build -o etc/temp/golangci-lint github.com/golangci/golangci-lint/v2/cmd/golangci-lint`
and lints both modules with it; for the bridge alone, run
`cd pkg/@eserstack/ajan && ../../../etc/temp/golangci-lint run ./...` after that
build.

`validate-code-conventions` keeps existing violations in
`.eser/baselines/code-conventions.json` and fails only on new ones. After
migrating files, shrink it with
`node ./pkg/@eserstack/codebase/validate-code-conventions.ts --write-baseline`;
never raise a count to let a new violation pass.

## Absolute Rules

- Run `pnpm ok` (`eser ok`) before committing (runs
  `eser workflows run -e precommit` on the Go eser)
- One package per task — load `workflow-practices` for cross-package protocol
- TS packages share one version — load `release-and-ci` for bumping
- The Go modules are internal: they build from the shared release tag and get no
  tags or versions of their own
- Business logic stays dependency-free (hexagonal architecture)
- `package.json` dependency syntax must be portable: use `workspace:*` for
  internal monorepo packages, plain semver (e.g. `^4.1.0`) for external, and
  never `catalog:` (pnpm-only)
- Everything in the codebase is written in English: code, comments, docs, commit
  messages, backlog items, ADRs. Other languages are for conversation with the
  user only and never land in a file
