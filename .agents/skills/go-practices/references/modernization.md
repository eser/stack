# Go Modernization

Newer standard library features that replace older idioms or third-party
packages. The module's `go` directive decides what is allowed: this repository
targets `go 1.26`, so everything below up to Go 1.26 may be used, and nothing
newer until the directive is raised on purpose. Each item was checked against
the Go 1.26 toolchain. `go fix ./...` (rewritten in Go 1.26) applies many of
these rewrites automatically; review its diff like any other change.

---

## Replace These Idioms

| Instead of                                        | Use                                                   | Since |
| ------------------------------------------------- | ----------------------------------------------------- | ----- |
| `interface{}`                                     | `any`                                                 | 1.18  |
| `[]any` plus type assertions                      | a type parameter (language.md: Types)                 | 1.18  |
| multi-error libraries                             | `errors.Join`                                         | 1.20  |
| `HasPrefix` then `TrimPrefix`                     | `strings.CutPrefix`, `strings.CutSuffix`              | 1.20  |
| custom `minInt`/`maxInt` helpers                  | built-in `min`, `max`                                 | 1.21  |
| a loop of `delete` calls                          | built-in `clear(m)`                                   | 1.21  |
| `sort.Strings`, `sort.Slice`                      | `slices.Sort`, `slices.SortFunc` with `cmp.Compare`   | 1.21  |
| hand-written search, clone and compare loops      | `slices.Contains`, `slices.Clone`, `maps.Clone`       | 1.21  |
| `sync.Once` plus a package variable               | `sync.OnceValue`, `sync.OnceValues`, `sync.OnceFunc`  | 1.21  |
| zap, logrus, zerolog                              | `log/slog`, through `logfx` here                      | 1.21  |
| `if v == "" { v = def }`                          | `cmp.Or(v, def)`                                      | 1.22  |
| `for i := 0; i < n; i++`                          | `for i := range n`                                    | 1.22  |
| `v := v` copies in loops                          | nothing: each iteration has its own variable          | 1.22  |
| `math/rand`                                       | `math/rand/v2` (`IntN`, `N`); `crypto/rand` for keys  | 1.22  |
| gorilla/mux or chi for method and path routing    | `http.ServeMux` patterns (`"GET /users/{id}"`)        | 1.22  |
| `sql.NullString`, `sql.NullInt64`                 | `sql.Null[T]`                                         | 1.22  |
| `reflect.TypeOf((*I)(nil)).Elem()`                | `reflect.TypeFor[I]()`                                | 1.22  |
| building a slice only to range over it            | iterators: `iter.Seq`, `slices.Collect`, `Chunk`      | 1.23  |
| manual string interning maps                      | `unique.Make`                                         | 1.23  |
| `strings.Split` only to iterate                   | `strings.SplitSeq`, `FieldsSeq`, `Lines`              | 1.24  |
| `filepath.Clean` plus prefix checks on user paths | `os.OpenRoot` and `os.Root` methods                   | 1.24  |
| `omitempty` on `time.Time` and struct fields      | `omitzero`                                            | 1.24  |
| `context.Background()` in tests                   | `t.Context()`                                         | 1.24  |
| `for i := 0; i < b.N; i++` in benchmarks          | `for b.Loop()`                                        | 1.24  |
| `runtime.SetFinalizer`                            | `runtime.AddCleanup`                                  | 1.24  |
| `golang.org/x/crypto` sha3, hkdf, pbkdf2          | `crypto/sha3`, `crypto/hkdf`, `crypto/pbkdf2`         | 1.24  |
| `tools.go` blank imports                          | `tool` directives in `go.mod` (already used here)     | 1.24  |
| `wg.Add(1)` plus `defer wg.Done()`                | `wg.Go(func() { ... })` for work that returns nothing | 1.25  |
| sleeping or polling in concurrency tests          | `testing/synctest.Test` and `synctest.Wait`           | 1.25  |
| `go.uber.org/automaxprocs`                        | nothing: `GOMAXPROCS` follows cgroup limits           | 1.25  |
| `errors.As(err, &target)`                         | `errors.AsType[T](err)`                               | 1.26  |
| a `ptr[T](v)` helper                              | `new(v)`, which returns a pointer to that value       | 1.26  |
| `rsa.EncryptPKCS1v15` for new encryption          | RSA-OAEP or `crypto/hpke`                             | 1.26  |
| a third-party slog fan-out handler                | `slog.NewMultiHandler`                                | 1.26  |
| writing test output to a temp dir by hand         | `t.ArtifactDir()`                                     | 1.26  |
| `ReverseProxy.Director` (deprecated)              | `ReverseProxy.Rewrite` with `pr.SetURL`               | 1.20  |
| `fmt.Sprintf("%s:%d", host, port)`                | `net.JoinHostPort`, which brackets IPv6               | any   |

`wg.Go` fits only work that neither returns an error nor needs cancellation; use
`errgroup` for the rest (coding-practices: Owned Asynchronous Work).

Since Go 1.23, a timer or ticker that goes out of scope is collected without
`Stop()`. Still call `Stop()` when the timer must not fire.

---

## JSON: Stay on `encoding/json` for Now

`encoding/json/v2` needs `GOEXPERIMENT=jsonv2` on Go 1.26; without it the
package does not build. This repository does not set the experiment, so use
`encoding/json` (with `omitzero`, which works there since Go 1.24). Move to v2
when the module targets a Go release where it is the default, and test real
payloads first: v2 rejects duplicate object keys and invalid UTF-8 that v1
accepted.

---

## Tooling

- `go fix ./...` applies the modernizers the toolchain ships; check coverage
  with `go tool fix help`.
- Use `go doc`; Go 1.26 removed `go tool doc`.
- `govulncheck` reports vulnerabilities reachable from the code. It is pinned as
  a `tool` in `go.mod`; run `go tool govulncheck ./...`. No CI step runs it yet.
- Profile-guided optimization: a `default.pgo` CPU profile in the main package
  is applied automatically at build time. Add one only with a benchmark that
  shows the gain ([performance.md](performance.md): Runtime Settings).
- `benchstat` (`golang.org/x/perf/cmd/benchstat`) compares benchmark runs; add
  it as a `tool` directive when first needed.

---

## Raising the `go` Directive

Do not use an API newer than the module's `go` directive; `go vet` and newer
toolchains flag it. Raising the directive is a deliberate change of its own:
read the release notes for removed `GODEBUG` settings and behavior changes (the
JSON default is one), run the full suite and `go fix ./...`, then update this
file with the release's replacements after checking each one with `go doc` on
the new toolchain.
