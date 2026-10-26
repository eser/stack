# Fork of jsonschema/v6

This directory is an in-tree fork of
[github.com/santhosh-tekuri/jsonschema](https://github.com/santhosh-tekuri/jsonschema),
version v6.0.3 (commit `b0fc661f4939578bc429f408c18202573dbafcc4`). Both Go
modules of eser/stack use it through a `replace` directive:

- `go.mod`: `replace github.com/santhosh-tekuri/jsonschema/v6 => ./third-party/jsonschema`
- `pkg/@eserstack/ajan/go.mod`: `replace ... => ../../../third-party/jsonschema`

The decision to fork, with no upstream pull request, is
`backlog/decisions/decision-56`.

## What the patch changes

Upstream compiles the metaschemas of Draft 4, 6, 7, 2019-09 and 2020-12 in an
`init()` in `draft.go`. Every process that links the package pays for it, even
one that never compiles a schema: about 1.3 ms of each native ajan bridge load
and 5.3 ms of a WASM init.

The fork moves that work to the first `NewCompiler()` call:

- `draft.go`: `init()` becomes `loadMetaschemas`, a `sync.OnceFunc` with
  upstream's init body unchanged.
- `compiler.go`: `NewCompiler()` calls `loadMetaschemas()` and then
  `newCompiler()`, which holds upstream's original `NewCompiler` body. The
  metaschemas themselves compile with `newCompiler()`, so loading them never
  calls itself.

Every schema compile starts from `NewCompiler()`, so compiled schemas see the
same metaschemas as upstream. Both changes carry an `eser/stack fork` comment.
Nothing else differs from v6.0.3, except that `.github/`, `go.work`,
`go.work.sum` and `.pre-commit-hooks.yaml` were not copied.

`pkg/ajan/workflowfx/workflowfx_jsonschema_init_test.go` checks the result with
`GODEBUG=inittrace=1`: the package's init must stay under 0.1 ms (0.042 ms
measured on 2026-10-24, against 5.9 ms for upstream v6.0.3).

## Rebasing onto a new upstream version

1. Copy the new version's module over this directory, keeping this file and
   leaving out the same files as above.
2. Apply the two changes again: move `init()`'s body in `draft.go` into
   `loadMetaschemas`, and split `NewCompiler()` in `compiler.go`.
3. Run `go test ./...` in this directory, then the workflowfx tests and the full
   gate from the repository root.
4. Update the version and commit at the top of this file.

## Security advisories

govulncheck reports on the module versions in `go.mod`, and a `replace` to a
local directory hides this copy from it. On every bump, and when an advisory
for jsonschema/v6 is published, check the upstream repository and the Go
vulnerability database by hand and update the copy.

The code keeps upstream's Apache-2.0 license (`LICENSE`) and file headers, so
the repository's license-header, file-name and lint checks skip
`third-party/`.
