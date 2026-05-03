# Contributing to eser/stack

## First issue

Look for [`good first issue`](https://github.com/eser/stack/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) labels. Each issue has a clear acceptance criterion and a size estimate.

## Filing a bug or DX issue

Run `noskills-server doctor --json` and paste the output into the issue. The GitHub issue templates (`bug.yml`, `feature.yml`, `dx.yml`) are pre-filled for this. You can also run `noskills-server feedback` to open a pre-filled URL.

## Development setup

```bash
# Go toolchain
go mod download
deno task cli ok        # full validation (Deno + Go) — must pass before every commit

# Build binaries
go build ./cmd/noskills-server ./cmd/noskills

# Run noskills-server tests
go test ./pkg/ajan/noskillsserverfx/... -v

# Run TypeScript tests (noskills-client, webtransport, noskills-server-worker)
deno lint pkg/@eserstack/noskills-client/ pkg/@eserstack/webtransport/ pkg/@eserstack/noskills-server-worker/
deno check pkg/@eserstack/noskills-client/mod.ts pkg/@eserstack/webtransport/mod.ts
```

## Architecture decision records

ADRs live in `docs/adr/`. Read `0001-http3-and-webtransport.md` and `0002-magical-moment-and-tthw-target.md` before touching transport or DX code.

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

Register it in `server.go` via the `--cert-provider` flag. See `SelfSignedProvider` for the reference implementation.

### Adding a new doctor check

Add a `Check{Name, Run}` struct to `pkg/ajan/noskillsserverfx/doctor.go` and append it to the `checks` slice in `RunDoctor`. The check function returns `(pass bool, detail string)`.

### Adding a new NS error code

Add an entry to `NSErrors` in `pkg/ajan/noskillsserverfx/errors.go`. The `TestNSErrors_AllFieldsPopulated` test enforces that every entry has non-empty `Code`, `Cause`, and `Fix`.

## Commit style

Conventional commits: `feat(scope):`, `fix(scope):`, `chore(scope):`, `docs(scope):`. Run `deno task cli ok` before pushing — the pre-commit hook enforces this.

## Code standards

- Go: `golangci-lint run ./...` must be clean. Each file in `pkg/ajan/noskillsserverfx/` must stay under 500 LOC.
- TypeScript: `deno lint` and `deno check` must pass. No `any` in public APIs; use discriminated unions.
- No `//nolint:` without a comment explaining why.
