# Languages and Security in eser/stack

Facts about the eser/stack repository that the go-practices,
javascript-practices, frontend-practices and security-practices skills refer
to.

## Go Modules and Layout

- The root module is `github.com/eser/stack`, with `go.mod`, `Makefile` and
  `.golangci.yaml` at the repository root. There is no `go.work`.
- The ajan framework packages live in `pkg/ajan/<name>fx/` (`logfx`, `httpfx`,
  `connfx`, `configfx`, `processfx` and others).
- Business logic lives in `pkg/ajan/api/business/<domain>/`, adapters in
  `pkg/ajan/api/adapters/`, and the composition root is
  `pkg/ajan/api/adapters/appcontext/appcontext.go`.
- The only Go binary is `cmd/noskills-server/`.
- The cgo and WASI FFI bridge is a second module, `github.com/eser/ajan`, in
  `pkg/@eserstack/ajan/` (`bridge.go`, `main.go`, `main_wasi.go`,
  `main_wasi_reactor.go`, `panic_guard.go`). Every exported bridge function goes
  through the guards in `panic_guard.go`; goroutines that outlive a call recover
  on their own.
- Neither Go module is published for `go get`. The root module path has no
  `/v4` suffix, so Go tooling cannot resolve the `v4.x.y` tags for it, and the
  bridge reaches it through `replace github.com/eser/stack => ../../..`. Both
  build from the shared release tag; there are no per-module tags.
- Snake_case file names apply under `cmd/`, `pkg/ajan/` and
  `pkg/@eserstack/ajan/`, as the `validate-filenames` config in
  `.eser/manifest.yml` lists.
- Embedded assets example: `pkg/ajan/noskillsserverfx/docs_embed.go`.

## Go Commands

- `make ok` checks only the root module. `deno task cli ok` also vets, builds
  and lints the bridge module.
- `make test` runs `go test -race ./...`; `deno task cli go-test` adds
  coverage.
- `deno task cli go-vuln` (`make vuln`) runs govulncheck on both modules, and
  the Validate job in `.github/workflows/build.yml` runs it.
- The encoding/json/v2 experiment (`GOEXPERIMENT=jsonv2`) is not set, so Go
  code uses `encoding/json`.

## TypeScript

- Packages live in `pkg/@eserstack/<name>/`; run tests with
  `deno task cli test`.
- `validate-code-conventions` runs in `deno task cli ok` and fails on a new
  named import or `||` literal default. `.eser/baselines/code-conventions.json`
  holds the current count of older violations per rule and file; the counts
  only go down.
- Some older test files use the `_test.ts` suffix (in `pkg/@eserstack/kit` and
  `pkg/@eserstack/workflows`, for example); new ones use `.test.ts`.

## Frontend

- The React stack is laroux (`pkg/@eserstack/laroux*`). The noskills web
  dashboard (`pkg/@eserstack/noskills-web`) is not React: it renders HTML from
  TypeScript templates with plain browser scripts, and defines its design
  tokens as custom properties in `static/style.css`.

## Security

- The `httpfx` profiling module reads `PPROF_TOKEN`; when it is unset it only
  logs a warning and leaves `/debug/pprof/` open, so every deployment that
  mounts it sets the token.
- `pkg/ajan/noskillsserverfx/auth.go` stores PINs with bcrypt at cost 12 and
  compares session tokens with `subtle.ConstantTimeCompare`.
- AI provider keys are read by `pkg/ajan/aifx/config.go` under the providers'
  own variable names (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`).
- `webtransport` pins certificate hashes with `VerifyPeerCertificate`, the one
  accepted use of `InsecureSkipVerify`.
