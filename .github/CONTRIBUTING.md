# Contributing to eser/stack

eser/stack follows the eserstack
[contributing guidelines](../pkg/@eserstack/directives/03-contributing.md) and
[Code of Conduct](../pkg/@eserstack/directives/01-social.md). This page adds
what is specific to this repository.

## Filing a bug or DX issue

Run `noskills-server doctor --json` and paste the output into the issue. The
GitHub issue templates (`bug.yml`, `feature.yml`, `dx.yml`) are pre-filled for
this. You can also run `noskills-server feedback` to open a pre-filled URL.

## Development setup

Run `deno task cli init` once after cloning: it installs the dependencies with
pnpm and sets up the git hooks (`eser codebase install`). The full check is
`deno task cli ok`; it must pass before every commit.

```bash
# Go toolchain
go mod download
deno task cli ok        # full validation (Deno + Go) — must pass before every commit

# Build binaries
go build ./cmd/noskills-server

# The release archives (eser, noskills-server) and SHA256SUMS.txt:
go run ./cmd/eser dev compile --current-only

# Run noskills-server tests
go test ./pkg/ajan/noskillsserverfx/... -v

# Lint and check the TypeScript clients (noskills-client, webtransport)
deno lint pkg/@eserstack/noskills-client/ pkg/@eserstack/webtransport/
deno check pkg/@eserstack/noskills-client/mod.ts pkg/@eserstack/webtransport/mod.ts
```

## Documentation

`docs/` holds two kinds of content, and the distinction matters before you edit
anything there:

- `docs/adr/` and `docs/schema/` are **hand-written and tracked**.
- `docs/api/` is **generated and untracked**. `deno task cli docs` deletes and
  rebuilds it from the JSDoc in `pkg/@eserstack/*/mod.ts`, so edits there are
  lost on the next run — change the doc comment instead.

Build the API reference locally with:

```bash
deno task cli docs
```

## Architecture decision records

ADRs live in `docs/adr/`. Read `0001-http3-and-webtransport.md` and
`0002-magical-moment-and-tthw-target.md` before touching transport or DX code.

## Extension points

### Adding a new cert provider

Implement `pkg/ajan/noskillsserverfx.CertProvider` (planned — `cert.go`):

```go
type CertProvider interface {
    Name() string
    Ensure(ctx context.Context, dataDir string) (CertHandle, error)
    Fingerprint() string
}
```

Register it in `server.go` via the `--cert-provider` flag. See
`SelfSignedProvider` for the reference implementation.

### Adding a new doctor check

Add a `Check{Name, Run}` struct to `pkg/ajan/noskillsserverfx/doctor.go` and
append it to the `checks` slice in `RunDoctor`. The check function returns
`(pass bool, detail string)`.

### Adding a new NS error code

Add an entry to `NSErrors` in `pkg/ajan/noskillsserverfx/errors.go`. The
`TestNSErrors_AllFieldsPopulated` test enforces that every entry has non-empty
`Code`, `Cause`, and `Fix`.

## Code standards

Each file in `pkg/ajan/noskillsserverfx/` must stay under 500 LOC.
