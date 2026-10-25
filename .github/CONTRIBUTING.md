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

You need Node 26.9 or later (`.node-version` pins the version CI uses), pnpm
11.18.0 and Go. Run `pnpm install` once after cloning, then `pnpm cli init`,
which installs the dependencies again and sets up the git hooks
(`eser codebase install`). The full check is `pnpm cli ok`; it must pass before
every commit.

```bash
# Go toolchain
go mod download
pnpm cli ok        # full validation (Node + Go), must pass before every commit

# Build binaries
go build ./cmd/noskills-server

# The release archives (eser, noskills, the laroux stub, noskills-server) and SHA256SUMS.txt:
go run ./cmd/eser dev compile --current-only

# Run noskills-server tests
go test ./pkg/ajan/noskillsserverfx/... -v

# Lint and test the TypeScript clients (noskills-client, webtransport)
pnpm exec oxlint pkg/@eserstack/noskills-client/ pkg/@eserstack/webtransport/
node --test "pkg/@eserstack/noskills-client/**/*.test.ts" "pkg/@eserstack/webtransport/**/*.test.ts"
```

## Documentation

`docs/adr/` and `docs/schema/` are hand-written and tracked. There is no
generated API reference: the JSDoc in the package source is the reference, so
change the doc comment, and run `pnpm cli docs-lint` to check that exported
symbols have one.

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
