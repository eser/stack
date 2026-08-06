# TODOs

Tracked deferred work for the eserstack project.

## P1 — v5.0.0 major bump (release-blocker prerequisites)

**What:** `pkg/@eserstack/noskills-client` dropped three `DaemonEvent` variants
(`DeltaEvent`, `ToolStartEvent`, `ToolResultEvent`). That is a breaking change
to a published package, so the next release is a **major**: 4.1.58 → 5.0.0.

**Why this was NOT bumped alongside the change.** Two reasons, both concrete:

1. `deno task cli codebase versions major` rewrites ~43 `package.json` files
   plus `VERSION` and makes no git commit of its own (`versions.ts` has no git
   calls — the commit lives in `release.ts`). Run on a feature branch it rides
   along as unrelated churn.
2. A **major** is the one bump type the ajan platform caret ranges cannot
   absorb. `pkg/@eserstack/ajan/package.json` pins its six platform binaries at
   `^4.1.0`, and `npm/generate-packages.ts` stamps those packages from the root
   `VERSION`. Publishing them as `5.0.0` would no longer satisfy `^4.1.0`, so an
   install resolves a stale 4.x binary against a 5.x ABI. Pinning them exactly
   is NOT the fix — that is what `0d5c9cbf` reverted, because the platform
   packages are published _after_ the tag and `--frozen-lockfile` then fails on
   a version that does not exist yet.

**Step 1 is DONE — the ranges are already widened.** It was the
ordering-sensitive half and it does not have to wait for the release branch:
`^4.1.0 || ^5.0.0` resolves to exactly the same 4.x today, so widening early is
inert until the bump. Three files carried a constraint, not the one named above:

- `pkg/@eserstack/ajan/package.json` — six platform deps
- `pkg/@eserstack/cli/package.json` — the same six, at _mixed_ floors (three
  `^4.1.57`, three `^4.1.0`). Each floor was preserved and widened in place
  rather than flattened, since the `^4.1.57` floors may be deliberate.
- `pkg/@eserstack/cli/scripts/npm-build.ts` — the generated `@eserstack/ajan`
  dependency of the published CLI.

`pkg/@eserstack/codebase/ajan-ranges.test.ts` now enforces the constraint: every
`@eserstack/ajan*` range declared anywhere in the workspace must admit the root
`VERSION`. That converts a silent failure into a failing test at the moment of
the bump — an optionalDependency whose range matches nothing is _omitted_ by
pnpm rather than erroring, which is why this needed a guard and not a note.

**Do at release time, on a dedicated release branch:**

1. `deno task cli codebase versions major`, and commit the whole bump as one
   release commit.
2. `pnpm install --lockfile-only`, verify with `pnpm install --frozen-lockfile`.

**Effort:** S. The ordering hazard is now enforced rather than remembered.

## P2 — Submit to nixpkgs upstream

**What:** Submit the `eser` package to the official nixpkgs repository.

**Why:** Enables `nix-env -iA nixpkgs.eser` without needing the flake URL.
Significantly increases discoverability for Nix users.

**Context:** The in-repo `flake.nix` downloads pre-built binaries from GitHub
Releases. An upstream nixpkgs package would do the same but be maintained by the
nixpkgs community. Requires a stable release history (2-3 releases with binary
assets) and passing the nixpkgs review process.

**Effort:** M (mostly waiting for maintainer review)

**Depends on:** Stable binary distribution pipeline (shipped in current release)

## P3 — Scoop / winget for Windows

**What:** Add Windows package manager support via Scoop manifest and/or winget
manifest.

**Why:** The CI already compiles a Windows binary (`x86_64-pc-windows-msvc`).
Adding Scoop/winget makes it discoverable by Windows developers.

**Context:** A Scoop manifest is a JSON file in a "bucket" repo (similar to
Homebrew tap). A winget manifest requires submission to the
`microsoft/winget-pkgs` repository. Both are straightforward once binary
distribution is stable.

**Effort:** S per manager (~1 hour each)

**Depends on:** Stable binary distribution pipeline

## P2 — `concern list` tension warnings

**What:** Wire `detectTensions()` into the `concern list` CLI command so it
prints warnings when active concerns conflict (e.g. move-fast ↔ compliance).

**Why:** `detectTensions()` already exists in the codebase. The CLI plumbing is
the only missing piece. Visible warnings help developers understand trade-offs
before starting a spec.

**Context:** Identified during noskills UX plan review. detectTensions() is
implemented but not called from the concern list output path.

**Effort:** XS (CC: ~30 min)

## P3 — `noskills --about` command

**What:** Add a `--about` flag that prints the eserstack philosophy in 3
sentences and exits.

**Why:** Surfaces the philosophy from the CLI without requiring a browser. Quick
reminder of why noskills exists.

**Effort:** XS

## P3 — `noskills init` banner philosophy reference

**What:** Update the `noskills init` banner to include a one-line reference to
"Built on eserstack foundation layer."

**Why:** Reinforces the product identity at the first moment of use.

**Effort:** XS

## P2 — Backpressure-aware web sink defaults

**What:** When web sinks (httpResponse, webSocket) ship for @eserstack/streams,
configure sensible timeout and backpressure defaults.

**Why:** Pipeline timeout (in MVP) handles abort, but web sinks need per-sink
backpressure thresholds and configurable timeout defaults to prevent silent
hangs in production.

**Context:** The @eserstack/streams MVP ships with stdout/buffer/null sinks (all
fast). When web sinks arrive, they face real backpressure from network
conditions. The pipeline timeout mechanism provides the abort, but each web sink
needs sensible defaults for buffer size limits and timeout durations.

**Effort:** S (CC: ~15 min per sink)

**Depends on:** @eserstack/streams MVP (pipeline timeout)

---

# Technical Debt Audit (2026-08-01)

Findings from a full-codebase audit of `pkg/ajan` (86k LOC Go) and
`pkg/@eserstack` (194k LOC TS). 85 raw findings, 64 survived adversarial
verification; the 21 refuted ones are omitted. Ordered by recommended fix
sequence, not by severity — the P0 batch is small, unconditional, and unblocks
everything else.

> **Status (2026-08-01):** the entire P0 batch below is **done**, each with a
> regression test verified to fail against the original code. Remaining: P1, P2,
> P3. One new defect was surfaced while wiring the gate and is filed as **P0 —
> Go runtime crash under the FFI library** at the end of this section.

Recurring theme across every subsystem: **the correct safety primitive already
exists, right next to the call site that bypasses it.** `sendStreamEvent` exists
and 6 of 8 aifx adapters bypass it; `RequestSizeLimitMiddleware` exists and is
wired into zero servers; `setupCancelKill` exists and covers 1 of 16 spawn
sites; `writeStateAndSpec` exists and is used 3 times against ~39 hand-rolled
dual-writes. Most fixes below are "route the existing correct thing through the
call sites", not "build something new".

## P3 — `deno compile --engine quickjs` hangs on lazily-dispatched commands

**What:** Deno 2.9's experimental QuickJS backend (denoland/deno#36194, merged
2026-08-04) compiles this CLI 31 MB smaller (268.0 → 236.9 MB) and then fails
every command except `--help`, with `Top-level await promise never resolved`.

The trigger is `Command.lazyCommand` dispatch combined with a real dynamic
import: the load promise never settles, so the handler never runs. Since the
whole command tree is lazily loaded, that is every real command.

**Ruled out** (each verified inside a compiled quickjs binary): dynamic import
generally, including nested in awaited async functions and of modules with their
own top-level await; the size of the imported graph — importing
`cli-system/mod.ts` directly and building the command from it works;
`setTimeout`; `fetch`; `Deno.dlopen` plus a full FFI load; `@eserstack/streams`
output and `close()`; and the `async`/`await` vs `.then()` shape of the loader.

**Not minimised.** It reproduces reliably in this repo but I could not reduce it
to a dependency-free script, which is what an upstream issue needs. Module
dispatch (`modules: { x: { load: () => import(...) } }`) works under quickjs
while `lazyCommand` does not — that difference is the most promising thread for
whoever picks this up, and it is also the workaround.

**Why P3:** we are not adopting the backend. 31 MB is small next to the 278 MB
that removing the Claude Agent SDK took off every binary, and the failure mode
is severe. Worth filing upstream once minimised, because "call a function that
dynamically imports, then `.parse()` the result" is an ordinary CLI pattern and
the backend is young.

**Do not** add `--engine quickjs` without testing a lazily-dispatched command
end to end; `--help` passing proves nothing, as it never triggers a lazy load.

## P1 — Two installers, and the working one is the undocumented one

**What:** the repo ships two POSIX installers that install different things, and
the documented one is the broken one.

- `etc/scripts/install.sh` downloads `eser-<tag>-<triple>.tar.gz` +
  `SHA256SUMS.txt` — assets that **exist on every release**, produced by
  `build.yml`'s `compile-binaries` / `upload-assets`. It works. **Nothing
  references it** — not the README, not a workflow, not the brew formula.
- `etc/scripts/install-noskills-server.sh` downloads
  `noskills_<version>_<os>_<arch>`
  - `checksums.txt` — assets that **have never existed** (see the P0 above). It
    is the one advertised in `cmd/noskills-server/README.md` and in
    `.goreleaser.yaml`'s brew instructions.

So the install command in the docs has never worked, while the installer that
does work is invisible.

**Why it matters beyond the P0:** even once goreleaser publishes, a user needs
BOTH — `eser` is the CLI, and `eser-acp` is what its claude-code / kiro /
opencode providers spawn. Two separate curl-pipe-sh commands to get one working
tool is the wrong end state.

**Fix:** after the P0 lands and `noskills_*` archives exist, merge the two into
a single `etc/scripts/install.sh` that installs the `eser` CLI and the Go
binaries together, and point the README and brew formula at it. Not done now
because a merged installer would half-fail until the archives are published.

**Effort:** S, blocked on the P0.

## P0 — GoReleaser has never published; `install.sh` 404s on every release

**What:** `.goreleaser.yaml` builds `noskills-server`, `noskills` and `eser-acp`
and archives them as `noskills_<version>_<Os>_<Arch>.tar.gz` (`.zip` on Windows)
plus `checksums.txt`. **None of those assets has ever existed on any release.**

Verified against the GitHub API for the eight most recent tags (v4.1.47 →
v4.1.56): every release carries either 0 assets or the same 11 `eser-v*` files
produced by `build.yml`'s `compile-binaries` / `upload-assets` jobs, with
`SHA256SUMS.txt`. `noskills_*`: zero. `checksums.txt`: never present.

**Consequences, all currently live:**

1. `etc/scripts/install-noskills-server.sh` — the install command documented in
   `cmd/noskills-server/README.md:14` and in the goreleaser brew instructions —
   downloads a URL that 404s. It has never worked.
2. `eser-acp` has never shipped in any artifact, so ACP-backed providers
   (`claude-code`, `kiro`, `opencode`) and the daemon's `kind="acp"` worker
   cannot work from a release install. The `ShimMissingHint` error text tells
   users to "install the eserstack release", which does not deliver the shim.
3. The brew formula's `bin.install "eser-acp"` (`.goreleaser.yaml:175`) never
   runs, so the tap is stale too.
4. `etc/scripts/install-noskills-server.ps1` inherits the same 404 for the same
   reason.

**Root cause:** `build.yml`'s `tag-release` job pushes the tag with the default
`GITHUB_TOKEN` supplied by `actions/checkout`. GitHub deliberately does **not**
dispatch workflows for events created with `GITHUB_TOKEN` — it is the recursion
guard. `release.yml` triggers only on `push: tags: "v*"`, so it has never fired.
This is not a goreleaser misconfiguration; goreleaser is simply never invoked.

**Fix — needs a decision, because the options differ in blast radius:**

1. Push the tag with a PAT (or a GitHub App token) instead of `GITHUB_TOKEN`.
   Smallest change and keeps the two workflows separate, but requires a repo
   secret that only the owner can create.
2. Add a `workflow_dispatch` trigger with a `tag` input to `release.yml`, so a
   release can at least be run by hand. Additive and safe; matches the existing
   precedent in `publish-ajan.yml`. Does not make it automatic.
3. Invoke goreleaser directly from `build.yml` after `tag-release`, dropping
   `release.yml`. Fully automatic, but restructures the release pipeline.

**Option 2 is DONE** — `release.yml` now also accepts `workflow_dispatch` with a
`tag` input, and checks out that tag so goreleaser derives the right version. A
release can be cut by hand today. It is additive: the `on: push: tags` trigger
is untouched, so nothing changes if the token issue is fixed separately.

Still open, and still the owner's call: (1) needs a repo secret, and (3) rewires
release infrastructure. **Recommend 1** — it is the only option that makes
releases work unattended again.

**Verify after fixing:** a release must carry
`noskills_<version>_Darwin_arm64.tar.gz` and `checksums.txt`, and
`curl -fsSL .../install.sh | sh` must land `eser-acp` on PATH. The
`windows-smoke` job already covers the Windows half via `-ArchivePath`, which
deliberately bypasses the download so it tests the installer rather than the
release.

**Effort:** S for the fix; the value is that it makes three shipped features
reachable for the first time.

## ~~P0~~ DONE — Go runtime crash under the FFI library (surfaced 2026-08-01)

**What:** Investigate the intermittent
`fatal error: runtime: unexpected waitm - semaphore out of sync` thrown from
inside `libeser_ajan` during the Deno test suite.

**Why:** It aborts the whole test process, so `deno task cli ok` fails roughly 1
run in 6. It is a Go _runtime_ fatal error, not a panic, so nothing can recover
from it — in production it would take the host process down.

**Context:** Pre-existing, **not** introduced by the P0 work. It only became
visible because the gate now builds the native library, so the `*.ffi.test.ts`
suites actually run for the first time (they previously failed fast with "native
library unavailable"). Verified by A/B: rebuilding the library from the
unmodified `HEAD` `bridge.go` reproduces it at the same rate (1 crash / 6 full
runs) as the current tree. Isolating just the five FFI test packages did **not**
reproduce it in 8 runs, so the trigger appears to involve the full suite's
concurrency — most likely `Deno.dlopen` of one c-shared Go library from several
parallel test isolates. Start there.

**Effort:** M to diagnose; unknown to fix

**Done (2026-08-02).** The "concurrency" hypothesis above was wrong, and so were
two others I tried (FFI callbacks re-entering Go; `nonblocking: true` threadpool
dispatch — A/B'd at 3/8 vs 5/8 crashes, p = 0.62, i.e. no effect).

The actual cause is **sequential, not concurrent**: Deno disposes a test-file
isolate, which `dlclose`s the library; the next file `dlopen`s it again. A Go
runtime cannot be unloaded and reloaded — the second init runs while threads
from the first are still parked, and the scheduler dies. That is why isolating
the five FFI packages never reproduced it: one file, one load.

Fixed by making the image un-unloadable from inside itself — a cgo constructor
re-opens its own image with `RTLD_LAZY|RTLD_NOLOAD|RTLD_NODELETE`
(`pin_image_posix.go`), so `dlclose` drops the refcount but never unmaps.
Measured: **0 crashes / 8 full runs, against a pooled baseline of 8 / 16. Fisher
exact p = 0.022.**

**Caveat — not verified on Windows.** `pin_image_windows.go` uses
`GET_MODULE_HANDLE_EX_FLAG_PIN` and has never been compiled (no mingw toolchain
available here). It is also not in any published npm platform binary yet; those
need a rebuild to carry the pin. See the P3 Windows item below.

## ~~P0~~ DONE — Add `go.work` so the FFI bridge is actually checked

**What:** Add a `go.work` covering the root module and `pkg/@eserstack/ajan`,
plus `working-directory: pkg/@eserstack/ajan` gate steps in
`.eser/manifest.yml`.

**Why:** `pkg/@eserstack/ajan/go.mod` declares a second module and there is no
`go.work`, so the root-relative `go vet ./...`,
`go tool golangci-lint run ./...` and `go test -race ./...` all silently skip
`bridge.go` (4,954 LOC), `main.go`, `main_wasi.go` — **and their 1,360 LOC of
live, passing tests**. Running the lint by hand surfaces 13 issues today. This
is the highest-leverage item in the audit: it makes every other Go finding in
the bridge visible to the gate instead of to auditors.

**Context:** `.eser/manifest.yml:122` carries a comment asserting these steps
cover that directory. They do not.

**Effort:** S

**Done (2026-08-01):** go.work + explicit second pattern in the gate; 13 lint
issues -> 0; `go test -race` on the bridge module now runs (was never run). Two
real leaks fixed in bridge.go (missing `state.cancel()` on the drain path of
both codebase stream readers) and `bridgeShutdown` now drains all 13 handle
registries.

## ~~P0~~ DONE — CI must build the native lib before type-checking the TS half

**What:** Run `scripts/build.ts` in the CI `validate` job and pin
`ESER_AJAN_LIB_PATH` to the freshly built artifact.

**Why:** `validate` currently type-checks and lints the entire TS half against
the **previously published** native binary, so an ABI change cannot fail CI in
the commit that introduces it.

**Context (corrected 2026-08-04):** the paragraph that used to sit here had the
two packages the wrong way round, and prescribed the change that broke the
release pipeline.

What is actually true: `pkg/@eserstack/ajan/package.json` is the one on caret
ranges (all six platform deps at `^4.1.0`); `pkg/@eserstack/cli/package.json` is
the _mixed_ one — three at `^4.1.57`, three at `^4.1.0`. The alleged
4.1.56/4.1.57 lockfile straddle is stale: every one of the twelve entries in
`pnpm-lock.yaml` resolves to 4.1.57 at HEAD.

More importantly, the remedy it prescribed — pinning the platform deps exactly —
**was tried and reverted**. See `0d5c9cbf` ("fix(build): unpin ajan platform
deps to unblock frozen-lockfile"), which put all six back to `^4.1.0`. The
reason is written down in `pkg/@eserstack/codebase/versions.ts` inside
`syncAjanVersions`: the platform packages are published _after_ the version
bump, so pinning them exactly makes the lockfile reference versions that do not
exist yet and `--frozen-lockfile` fails.

**Do not re-apply the old advice.** If the ABI-coupling risk is to be addressed,
it needs a different mechanism — an install-time ABI check, or publishing the
platform packages before the bump — not exact pins.

**Done (2026-08-01):** `build-native-lib` step added to `.eser/manifest.yml`
ahead of every Deno step; `scripts/build.ts` pins `GOWORK=off` so released
artifacts still resolve from the module's own go.mod. This also fixed the
`*.ffi.test.ts` suites, which had been failing with "native library
unavailable".

**Nothing open from this entry.** An earlier revision listed "pin cli's six
platform binaries exactly and extend `syncAjanVersions` to cover them" as
remaining work. That is the advice corrected above: it was tried, it broke
`--frozen-lockfile`, and it was reverted in `0d5c9cbf`. The lockfile no longer
straddles two versions either — all twelve entries resolve to 4.1.57.

## ~~P0~~ DONE — Fix `workerImpl.Close()` self-deadlock (freezes the whole daemon)

**What:** Extract a `sendLocked` helper; move `worker.Close()` out from under
`sm.mu`.

**Why:** `pkg/ajan/noskillsserverfx/worker.go:314-326` takes `w.mu` then calls
`send()` (`:256-261`) which takes `w.mu` again — `sync.Mutex` is not reentrant.
Reproduced hanging in 2s. It fires at `sessions.go:110` **while `sm.mu` is still
held** (unlocked at `:111`, never reached), so every subsequent `GetOrCreate`,
`Remove`, `ListBySlug` and every pump goroutine's cleanup blocks forever —
permanent daemon-wide freeze, no panic, no log.

**Context:** Trigger is any `openLedger` failure: ENOSPC, read-only FS, bad
perms. Found independently by two auditors.

**Effort:** S

**Done (2026-08-01):** `sendLocked` extracted; `worker.Close()` moved out from
under `sm.mu`. Regression test `worker_close_test.go` verified to hang-and-fail
against the original.

## ~~P0~~ DONE — Fix uninterruptible `Close()` in shellfx exec and tui

**What:** Give `shellfx/exec` the process-group kill that `shellfx/pty` already
does correctly; close stdin's fd before `wg.Wait()` in `shellfx/tui`.

**Why:** Both hangs reproduced. `pkg/ajan/shellfx/exec/exec.go:160-170` waits on
`<-h.exitCh`, gated behind `wg.Wait()`, gated behind a `readerLoop` parked in
`r.Read` — with no `Setpgid` and no `cmd.WaitDelay`, a `sh -c "... &"`
grandchild holds the pipe open forever. `pkg/ajan/shellfx/tui/tui.go:121-125`
waits on a reader parked in `read(2)` on raw-mode stdin. Because
`EserAjanShellExecClose` / `EserAjanShellTuiKeypressClose` are **synchronous**
FFI symbols, these deadlock the Deno isolate's main thread, not just the child.

**Context:** `pkg/ajan/shellfx/pty/pty_unix.go:107-125` already signals `-pid`
and gets this right — the correct copy is the least-exercised one.

**Effort:** S

**Done (2026-08-01):** exec: `Setpgid` + process-group SIGKILL +
`cmd.WaitDelay`, and the pipe read ends are closed to unblock a parked `Read`.
tui: read-deadline interrupt plus a bounded wait so Close always returns. Both
regression tests verified to fail against the original.

## ~~P0~~ DONE — `SessionManager.GetOrCreate` holds the global mutex across a 30s spawn

**What:** Two-phase placeholder insert so the map lock is not held across
`SpawnWorker`.

**Why:** `pkg/ajan/noskillsserverfx/worker.go:142-192` holds the global session
mutex across a 30-second `SpawnWorker` deadline, serialising every session
operation behind the slowest spawn.

**Effort:** S

**Done (2026-08-01):** Two-phase placeholder (`sm.pending`) so the spawn runs
unlocked while concurrent callers for the same key wait rather than
double-spawning.

## ~~P0~~ DONE — Graceful shutdown is inert; every SIGTERM severs in-flight work

**What:** Use `context.WithoutCancel(ctx)` in both `Start` methods; call
`process.Shutdown()` after `process.Wait()`; replace the `WaitGroups` map with
one `sync.WaitGroup` plus a mutex-guarded name slice.

**Why:** `Start(ctx)` returns a `cleanup` closure doing
`context.WithTimeout(ctx, GracefulShutdownTimeout)` — capturing the _same_ ctx
whose cancellation triggers cleanup (`http_service.go:182-200`,
`http3_service.go:171-186`). Both call sites do
`<-goroutineCtx.Done(); cleanup()`, so the shutdown context is born already
cancelled and `GracefulShutdownTimeout` is dead. On the quic-go path it is worse
than a no-op: `<-ctx.Done()` makes it call `s.Close()`, force-killing live
QUIC/WebTransport sessions.

**Context:** `Process.Shutdown()` — the only thing that waits on the WaitGroups
— has **zero non-test callers**, so `cmd/noskills-server/main.go:156` returns
into `os.Exit` racing its own cleanup goroutine. The
`WaitGroups map[string]*sync.WaitGroup` (`processfx/process.go:29`) is
unsynchronised and reproducibly aborts with
`fatal error: concurrent map
writes`, which `recover()` cannot catch — while
`processfx/README.md:658-663` explicitly documents "Safe to call
`StartGoroutine` concurrently". Correct the README as part of this.

**Effort:** S

**Done (2026-08-01):** `context.WithoutCancel` in both services;
`process.Shutdown()` wired into `cmd/noskills-server/main.go`; the racy exported
`WaitGroups` map replaced with an unexported `sync.WaitGroup` +
`RunningNames()`. README corrected.

## ~~P0~~ DONE — httpclient leaks sockets and breaks its own retries

**What:** Add `drainAndClose(resp)` before each retry and each early return;
call `req.GetBody()` in `handleRetry`; reset `failureCount` on success.

**Why:** Three separate defects on the same path, all measured:

- `httpclient/transport.go:109,117-119,139-141` never closes or drains any
  non-final response — 15 distinct sockets for 5 all-503 client calls, zero
  reuse. With the package's default zero client timeout they are never
  reclaimed.
- The retry path rejects bodies without `GetBody` and then **never calls it**:
  `handleRetry` ends `return req.Clone(req.Context())`, which shallow-copies the
  drained Body, so attempt 2 dies with `ContentLength=N with Body length 0` and
  the caller sees a bogus transport error instead of the server's 503.
- `circuit_breaker.go:81-89` fast-paths `OnSuccess` before resetting
  `failureCount`, so it trips on lifetime-cumulative failures. Measured: open
  after 5 failures across 400 successes, against README text saying "5
  consecutive failures". With `MaxAttempts=3`, two ever-failed requests reach
  the threshold.

**Context:** Retry jitter (`retry_strategy.go:36-38`) is correctly implemented,
so the usual thundering-herd follow-on does not apply.

**Effort:** S

**Done (2026-08-01):** `drainAndClose` before every retry and early return
(measured: 5 dials -> 1 for 5 attempts); `GetBody` rewind in `handleRetry`;
`failureCount` reset on success. All three regression tests verified to fail
against the original.

## ~~P0~~ DONE — Lock down the `/mux` WebSocket (unauthenticated RCE)

**What:** Origin allowlist plus a per-process token on `/mux` and the mutating
REST routes. **Structurally:** remove `command` / `args` / `cwd` from the
wire-reachable Action surface so the client names a pane _kind_ that the
resolver maps server-side.

**Why:** `pkg/@eserstack/noskills-web/server.ts:87-92` routes `/mux` to
`handleMuxWs` with no auth, no token, no Origin check.
`terminal/ws-bridge.ts:18-34` upgrades unconditionally;
`mux/ipc/transport-ws.ts:33-39` does `JSON.parse(ev.data) as In`;
`mux/server/server.ts:244-263` passes `msg.action` straight to `applyAction`;
and `engine/types.ts:151-159`'s `newTab` action carries `command`, `args`,
`cwd`, which `manager/session-binding.ts:33-46` resolves into a PTY spawn with
`env: {...runtime.env.toObject()}`. WebSockets are CORS-exempt, so loopback
binding is not a boundary: any page visited while `noskills web` runs gets
arbitrary argv with the developer's full credential environment — and since
`connect()` is single-viewer, it evicts the real browser and reads the terminal
stream. `POST /api/action` and `/api/tab` are equally CSRF-able (no content-type
check).

**Context:** Judges split on ranking (architect 6th, SRE 3rd) because exposure
requires the dev server to be running. Severity is high, exploitability is
conditional.

**Effort:** M

**Done (2026-08-01):** Per-process token (CSPRNG, constant-time compare) +
Origin allowlist + JSON content-type gate; token delivered to the browser via a
`<meta>` tag. Ingress sanitizer strips `command`/`args`/`cwd` from remote
`newTab` actions while leaving the local TUI's capability intact. 15 tests, 5 of
them end-to-end against a live server.

## P0 — Related lower-severity security hardening

**What:** Four independent fixes, each small:

- Gate the PIN lockout's `X-Forwarded-For` behind a trusted-proxy allowlist.
  `pkg/ajan/noskillsserverfx/auth.go` does PIN auth properly (bcrypt cost 12,
  `crypto/rand`, `subtle.ConstantTimeCompare`) and its per-IP lockout is real —
  but the key is an unvalidated header on a daemon bound to `:4433` on all
  interfaces. The bypass is the header, not the mechanism.
- `CorsMiddleware` defaults to `allowOrigin:"*"` **and**
  `allowCredentials:true`, reflecting any origin with no `Vary`. The TS twin
  defaults `credentials:false` and sets `Vary` — match it.
- QUIC cert pinning matches any cert in the attacker-supplied chain while
  `InsecureSkipVerify` is on: `transport_http3.go:129-140`, duplicated at
  `webtransport/client.go:107-120`. Hash `rawCerts[0]` only.
- `eser update` installs when checksum verification cannot run
  (`cli/commands/handlers/update.ts:157-183`) while all three sibling consumers
  of the same `SHA256SUMS.txt` fail closed. Make it fail closed too.

**Effort:** S each

## ~~P0~~ DONE — aifx stream emitters block forever and leak child contexts

**What:** Promote `sendStreamEvent` to the only emitter; thread ctx through
`ParseJsonlStream`; fix `StreamIterator.Next` holding `iter.mu` across a blocked
receive; pass the real cancel context in the three CLI adapters.

**Why:** 27 raw `eventCh <-` sends across 6 adapters block forever on a full
64-slot buffer, while the ctx-aware `sendStreamEvent` sits in the same package,
is used by the other 2 adapters, and is explicitly unit-tested.
`StreamIterator.Next` holds `iter.mu` across the blocked receive and `Close`
takes the same mutex — so the advertised remedy deadlocks. Three CLI adapters
take the cancel context into a parameter named `_` and spawn on the _parent_
ctx, so `Close()` kills nothing.

**Effort:** M

**Done (2026-08-01):** All 27 raw `eventCh <-` sends across 6 adapters routed
through the ctx-aware `sendStreamEvent` (moved to `stream_send.go`); ctx
threaded through `ParseJsonlStream`; the three CLI adapters no longer discard
their context into `_`; `StreamIterator.Next` no longer holds `iter.mu` across
its blocking receive.

## ~~P0~~ DONE — Node FFI backend frees none of its C strings

**What:** Declare the Node backend's returns as `void*`, use `koffi.decode`, and
free.

**Why:** `pkg/@eserstack/ajan/ffi/backend-node.ts:355-358` has no binding to
`EserAjanFree` at all — 96 malloc'd C strings are never released. Deno and Bun
backends both do this correctly.

**Effort:** S

**Done (2026-08-01):** All 96 string returns re-declared `void*`, decoded with
`koffi.decode(ptr, "char", -1)`, then freed. Measured end-to-end against the
real bridge: 73.7 MB -> 22 MB RSS growth over 200k calls.

## P1 — One memoized FFI client, replacing 19 copies

**What:** A single `@eserstack/ajan/ffi/client` exporting `ensureLib` / `getLib`
/ `requireLib` / `getLoadError()`, deleting the 19 duplicates. Generate the
99-symbol table from one manifest.

**Why:** 14 near-byte-identical `ffi-client.ts` files (`cache`, `codebase`,
`collector`, `crypto`, `cs`, `formats`, `httpclient`, `kit`, `logging`,
`noskills`, `parsing`, `posts`, `shell`, `workflows`) plus 4-5 more inlined
loaders in `*/adapters/ffi/loader.ts` — 19 independent singletons of the same
24-line primitive. Three have already diverged: `logging` uses a top-level
`await ensureLib()` with a **sync** `requireLib`, `codebase` an **async**
`requireLib` with a different message, `kit` a fire-and-forget
`void
ensureLib()`. Every one ends `.catch(() => {})`, discarding the genuinely
useful error string that `pkg/@eserstack/ajan/ffi/mod.ts:199-260` constructs.
`loadEserAjan` has no memoization, so each loader performs its own
`Deno.dlopen`.

**Context:** This is the load-bearing seam joining the Go and TS halves and it
has no owner. Highest leverage-per-hour item in the audit after `go.work`.

**Effort:** M

## P1 — Make the Go-bridge-vs-TS adapter choice observable and lossless

**What:** Stop silently falling back; surface which implementation ran; stop
dropping options on the bridge path.

**Why:** `pkg/@eserstack/ai/adapters/mod.ts:57-95` (`defaultFactories()`) tries
the Go bridge **first** and silently falls back to TS — so identical source
behaves differently depending on whether a `.dylib` happened to load on that
machine. The bridge path drops Tools, Temperature, TopP, ResponseFormat,
ThinkingBudget and all non-text content blocks
(`pkg/@eserstack/ajan/bridge.go:454-486`), under a `//nolint:exhaustruct`
suppressing exactly the linter that would have caught it.

**Effort:** M

**Depends on:** the memoized FFI client (shared load-error reporting)

## P1 — Atomic state writes and honest read failures

**What:** One `writeJsonAtomic` (temp + rename) routed through all four writers
in each language; split read failures into "absent" vs "corrupt"; make Go's
`WriteManifest` preserve unknown keys; move the try/catch inside the
`listSpecStates` / `listConcerns` loops.

**Why:** Every write is truncate-and-rewrite via plain `writeTextFile` with no
temp+rename, in both languages, under two source comments that falsely assert
atomicity — `noskillsfx/persistence.go:136` says "atomically writes state" above
an `os.WriteFile`; `noskills/state/persistence.ts:639` says "write both
atomically" above two sequential writes. Every read failure is caught by one of
**175 bare `catch {}`** and returns `createInitialState()`, so a torn file is
indistinguishable from a fresh project.

Worst case, and the reason this is the only theme that destroys user work: Go's
`WriteManifest` (`persistence.go:219-234`) marshals only `NosManifest` and
writes it as the **entire** file. Running the Go `noskills concern add` in this
repo would overwrite `.eser/manifest.yml` — including the `workflows:` block
`deno task cli ok` depends on — on a normal, successful run.

**Context:** The migration code in the same file already uses two-phase rename
with a comment explaining why, so the technique is known and simply absent from
the hot paths. Go already splits absent-vs-corrupt correctly at
`persistence.go:115-134` — copy that.

**Effort:** M

## P1 — Give workflow state a single owner and a single reader

**What:** Route all writes through `writeStateAndSpec`; make every reader use
`resolveState`.

**Why:** State is dual-written to `state.json` and `specs/<name>.json` from ~39
hand-rolled call sites, while the correct combined helper
(`state/persistence.ts:643 writeStateAndSpec`) is used 3 times. A third copy of
phase lives in `.eser/.state/sessions/*.json`. Readers are split: spec-scoped
commands use `resolveState` (per-spec wins), but `commands/invoke-hook.ts:256` —
the **file-edit enforcement gate** — reads the global store, so after
`spec
revisit` it still sees `EXECUTING` and permits edits the state machine
disallows. No crash required.

**Context:** Call sites at
`state/persistence.ts:105-119,248,283,311,347-371,
396-417,452-472`.

**Effort:** M

## P1 — Wire config to behaviour, or delete the knobs

**What:** Add `httpfx.DefaultMiddlewares(cfg *Config) []Handler` translating
config into wired middlewares; call
`SetDiscloseErrors(cfg.ExposeInternalErrors)` from the service constructors; add
`MaxBytesReader` inside `ParseJSONBody` as a floor. Delete every knob with no
home rather than implementing it.

**Why:** `pkg/ajan/httpfx/config.go` declares `APIKeys` (:8), `SkipAuthPaths`
(:13), `InitializationTimeout` (:20), `RateLimitRequests` (:24),
`MaxRequestSizeMB` (:25), `AuthEnabled` (:34), `ExposeInternalErrors` (:36) — a
repo-wide grep returns **only the declarations**. `pkg/ajan/config.go:20` adds
`JWTSecret` with the comment "validated at startup"; there is no startup
validation. `RequestSizeLimitMiddleware`, `RateLimitMiddleware`,
`SecurityHeadersMiddleware`, `AuthMiddleware`, `MetricsMiddleware`,
`TracingMiddleware` and `lib.ValidateExternalURL` all have **zero non-test call
sites**. `ErrorHandlerMiddleware`
(`httpfx/middlewares/error_handler_middleware.go:5-11`) is literally
`result := ctx.Next(); return result` — wired as the outermost middleware under
the comment "error handler wraps everything".

**Context:** The project's own
`.claude/skills/security-practices/references/rules.md:89-105` instructs
operators to set `RATE_LIMIT_REQUESTS`, `MAX_REQUEST_SIZE_MB` and
`EXPOSE_INTERNAL_ERRORS` — all three inert. `httpfx/context.go:86-101` parses an
unbounded JSON body, reachable pre-auth on `/auth/login`.

**Effort:** M

## P1 — Route all 16 spawn sites through one `processfx.Spawn`

**What:** Export `processfx.Spawn(ctx, argv, opts)` implementing process-group
kill plus `cmd.WaitDelay`, and route every `exec.Command*` site through it.

**Why:** `setupCancelKill` (`pkg/ajan/workflowfx/tools_unix.go:19`) does this
correctly and covers 1 of 16 `exec.Command*` sites.
`pkg/@eserstack/ajan/bridge.go:2224-2255` is one of the sites that does not.

**Effort:** M

## P1 — `Router.Group()` silently 404s; `connfx` ports are unsatisfiable

**What:** Either mount the group's mux into the parent router, or delete
`Group()`. Delete the `connfx` Repository/Queue port layer rather than repairing
it.

**Why:** `pkg/ajan/httpfx/router.go:91-95,200-203` — `Group()` returns a fresh
unmounted mux, so grouped routes 404 with no error at registration time.
`pkg/ajan/connfx/data_ports.go:42-226` is 366 lines of Repository/Queue ports
satisfiable by no adapter, and `registry.go:315-342` (`Registry.GetRepository`)
type-asserts the **vendor object** (`*redis.Client`, `*sql.DB`), so it returns
`ErrInterfaceNotImplemented` 100% of the time. `GetRepository` has no callers —
deletion is the correct fix.

**Effort:** S

## P1 — Config parsing fails open on every error

**What:** Make `reflectSetField` return `error` and propagate with the key path;
fix the named-return + defer bug in both file parsers; use comma-ok plus
`lib.CaseInsensitiveGet` in `expandVariables`.

**Why:** `pkg/ajan/configfx/manager.go:426-511` (`reflectSetField`) discards the
error from all 16 conversions and _cannot_ propagate one — the signature returns
nothing. Both file parsers overwrite the parse error with `Close()`'s nil via a
named-return + defer bug (`jsonparser.go:41-56`, `envparser.go:341-360`).
Reproduced: `PORT=not-a-number DBG=yes READ_TO=30` yields
`err=<nil> port=0 dbg=false rt=0s` — the invalid override **beats the declared
default** and lands on zero. Go's `net/http` treats a zero read/write timeout as
_unlimited_, and duration fields with defaults exist across httpfx, httpclient,
connfx, aifx and workerfx. A truncated `config.json` is indistinguishable from a
missing one.

**Context:** Separately, an undefined `${VAR}` in a `.env` panics through an
unchecked type assertion (`envparser.go:323`) on the default load path —
including inside the cgo bridge, taking the host process down. Case-insensitive
mode makes it panic even when the variable _is_ defined. Two existing tests pin
the broken float behaviour and will need updating.

**Effort:** M

## P1 — `@eserstack/shell/exec` corrupts arguments, and it is the mandated API

**What:** Stop serialising to a string — push each interpolated value directly
into the argv array. Delete `pipe()` or make it throw. Add a test file; there is
none under `pkg/@eserstack/shell/exec/`.

**Why:** `codebasefx/validators.go:545` rewrites `new Deno.Command` violations
to "@eserstack/shell/exec", making this the blessed path (~50 call sites). Its
template tag shell-quotes each interpolated value (`parser.ts:47-54`) then
re-tokenizes with a parser that treats `\` as an escape **inside single quotes**
(`:60-112`) — quote and unquote are not inverses. Verified by execution:
`${"a\\b"}` becomes `ab`, `${"C:\\Users\\x"}` becomes `C:Usersx`, `${""}`
silently vanishes and shifts positional args, and `${"a\\' --evil x"}` escapes
its own quoting to inject a separate `--evil` argv entry.
`cli/commands/handlers/update.ts:194-197` interpolates Windows paths into
PowerShell, so CLI self-update is simply broken on Windows. `pipe()`
(`command.ts:326-337`) reassigns `input` per stage and never feeds any child's
stdin.

**Effort:** M

## P2 — Pick one owner per duplicated domain (the biggest architectural debt)

**What:** For each duplicated concept, declare a single source of truth. Move
the tables (`VALID_TRANSITIONS`, `QUESTIONS`, `RESERVED_NAMES`, capability rows,
the state schema) into data loaded by both languages, and add a `testdata/`
golden corpus executed by **both** `deno test` and `go test` inside
`deno task cli ok`.

**Why:** `pkg/ajan/noskillsfx/` (4,584 lines) re-implements
`pkg/@eserstack/noskills/` (46,115 lines) over **the same on-disk files** —
`.eser/.state/progresses/state.json`, `specs/<name>.json`,
`ledger/<spec>/ledger.jsonl` — with 23 explicit `// mirrors X.ts` comments
across 10 files. All 8 AI providers exist twice (`pkg/ajan/aifx/adapter_*.go`
≈12.7k LOC vs `pkg/@eserstack/ai/adapters/*.ts` ≈4k LOC) plus a third FFI path.
The 99-symbol C ABI is restated by hand in 7-8 files. There is no JSON Schema,
no codegen, no golden corpus; a repo-wide grep for parity or conformance
harnesses returns nothing.

Drift is verified, not hypothetical:

- A legacy `discovery.userContext` string hard-fails `json.Unmarshal` in Go
  while the TS CLI reads it fine (reproduced).
- `noskillsserverfx/specs.go:381` calls `WriteSpecState`, which in Go never
  appends a ledger record — while `specs.go:134` serves a `/ledger` endpoint
  reading the file only the TS CLI writes.
- Go's `InferClassification` feeds the spec slug into keyword matching; TS's
  does not.
- `RESERVED_NAMES` is 21 entries in TS, 20 in Go.
- In aifx each copy is broken where the other is correct: Go nests the entire
  JSON Schema one level deep in `input_schema.properties` and never sets
  `required` (`adapter_anthropic.go:636-661`, reproduced on the wire), while TS
  sends `tool_choice: "required"`, which Anthropic rejects
  (`adapters/anthropic.ts:311`).
- Anthropic streaming double-counts output tokens (`adapter_anthropic.go:293`
  plus `:359`, 2× measured) and emits two contradictory `MessageDone` events.
- Capability metadata now exists in three tables and 4 of 8 providers disagree
  (third table at `pkg/@eserstack/ai/adapters/ajan-bridge.ts:523-540`).

Failure mode: every domain change is a two-language edit that nothing verifies,
and the answer a user gets depends on which binary ran, which depends on whether
a `.dylib` happened to load.

**Context — do this measurement first.** Before committing to _keeping_ both
sides, benchmark whether the FFI hop is actually faster. The entire
justification is a source comment saying "provides better performance", and
every call is a JSON marshal plus a C-string round-trip. If it is not faster at
most call sites, the cheapest resolution of the most expensive theme is
deletion, not synchronisation.

**Effort:** XL — but strictly cheaper now than after more surface accretes. All
three judge panels ranked this #1 or #2.

**Other citations:**
`pkg/ajan/noskillsfx/{machine.go:10, compiler.go:12,405,
persistence.go:159,275, slug.go:32-37, schema.go:219}`,
`pkg/@eserstack/noskills/{context/compiler.ts:496,
state/persistence.ts:127-160,311}`

## P2 — Collapse the two RSC serializers

**What:** One traversal producing the chunk stream, with SSR materialising React
elements from those same chunks. **Minimum viable today:** a shared
`serializeRef(id)` helper plus a round-trip test asserting both emitters produce
identical chunk arrays.

**Why:** `preprocessTree`
(`laroux-server/adapters/react/ssr-renderer.ts:173-619`) and `renderElement`
(`.../rsc-flight-renderer.ts:78-320`) are two independent 400-600 line
traversals of the same tree emitting the same chunk protocol, consumed by one
parser. They have diverged: ssr-renderer emits `` `$${chunkId}` `` for arrays;
rsc-flight-renderer emits raw integers (`:101-102`) — and `parseModel`
(`laroux-react/client.ts:501-575`) only dereferences strings starting with `$`,
so chunk IDs render as literal text. The same file is internally inconsistent
(`renderProps` at `:344` correctly emits `$N`).

Separately, `createClientPlaceholder` (`ssr-renderer.ts:132-166`) _substitutes_
a `<div data-client-component style="display:contents">` for every client
component in the server HTML, while the RSC chunk for that node has no wrapper.
In the default `streaming-optimal` mode the client hydrates the whole root from
the payload — a guaranteed structural mismatch on every page containing a link
(`link.tsx` is itself `"use client"`), swallowed by `onRecoverableError` at
**debug** level under the comment "Hydration mismatches are expected for async".

**Context:** `etc/adrs/0001` already named the fix ("Option 2 … single source of
truth for tree traversal") and its Related Files point at a package that no
longer exists — update the ADR. Do this only after adding one fixture app; there
is currently no consumer exercising laroux at all.

**Effort:** XL structural / S for the shared helper plus round-trip test

## P2 — Close the coverage and integration-test gaps

**What:** Set a patch-coverage floor; measure Go coverage; add golden-output
tests for the bundlers and a fixture app that actually starts a server.

**Why:** Coverage is `informational: true` with `continue-on-error: true`, and
Go coverage is never measured at all. The bundler backends are tested only as
constructors — `rolldown.test.ts` is 342 lines with zero references to `bundle`
/ `build` / `transform`. No test in the TS tree ever starts a server or calls
`.bundle()`.

**Effort:** S for the floors, XL for bundler/SSR golden tests

**Depends on:** the `go.work` and CI-native-lib items above

## P2 — `@eserstack/standards/cross-runtime` ambient I/O singleton

**What:** Investigate and, if confirmed, replace with an injected runtime port.

**Why:** It is a top-level-awaited ambient I/O singleton imported by 222 files,
which the project's own bundler string-replaces with a hand-written shim. Two
subsystem auditors independently named it as the mechanism by which "business
logic stays dependency-free" gets violated repo-wide — but the specific finding
was refuted on its stated impact, so **no verified finding covers it**. This is
a known unknown, not a confirmed defect: scope it before committing to a fix.

**Context:** `pkg/@eserstack/standards/cross-runtime/mod.ts:240-241` carries an
explicit `// deno-lint-ignore no-top-level-await`.

**Effort:** M to investigate

## P2 — logfx OTel providers are no-ops in every existing code path

**What:** Either connect the exporters or document them as unwired.

**Why:** The observability seam exists but nothing connects it, so **none of the
hangs, leaks or freezes listed above are observable when they fire**. That is
the real cost, and it is why this sits at P2 rather than P3 despite the original
"every span is a silent no-op" framing being refuted as overstated.

**Effort:** M

## P2 — Split `bridge.go` and make `Init` / `Shutdown` honest

**What:** Split the 4,954-line `bridge.go` into per-subsystem files inside
`package main`; either drain handles in `bridgeShutdown` or document
`Init`/`Shutdown` as no-ops; refresh the stale `require` line in
`pkg/@eserstack/ajan/go.mod`.

**Why:** `bridgeShutdown` (`bridge.go:262-267`) sets `initialized = false` and
reclaims nothing, and `initialized` is write-only — grep returns the declaration
at `:54` and two writes, and no reads. So `Init`/`Shutdown` imply a lifecycle
contract they do not honour. Note the handle maps themselves are **not**
leaking: all 13 have explicit release paths (16 `delete()` sites, each closing
the underlying resource), and TS callers do release them with a double-close
guard (`shell/exec/child-go.ts:98-108`).

**Context:** The god-file shape is partly forced — cgo `//export` requires every
exported symbol to live in one `package main`, so it cannot be split across Go
packages. It _can_ be split across files within `package main`; the tests
already use that convention (`bridge_http_stream_test.go`, `bridge_log_test.go`,
`bridge_codebase_stream_test.go`).

**Effort:** S

## P3 — Delete rather than repair: unconsumed and wrong-by-construction code

**What:** For each item below, prefer deletion over a fix. All three judge
panels independently listed most of these as overrated on impact; the honest
question is whether they should exist at all.

- `streamfx` — zero importers, four verified defects.
- `connfx` AMQP adapter — its "reconnection logic" comment sits above a body
  that has none, and its `Close` leaks the connection when the channel is
  already dead.
- `processfx.Supervisor` — no production callers.
- `RateLimitMiddleware` goroutine leak — never wired, so unreachable today.
- `functions/pipeline.ts collect()` — mints a fresh `state: {} as S` per
  middleware, so the documented Koa-style shared context never shares (verified:
  `state seen: {}`); the double-`next()` guard compares against a single shared
  `prevIndex`, so a 3-stage chain runs downstream twice with no error.
- `di/container.ts` — memoizes async lazy singletons only _after_ resolution, so
  concurrent `get()` double-constructs (verified: `built times: 2`).
- `fp/deep-copy.ts:89-92` — does `new Type()` and copies only `Object.keys`, so
  a copied `Date` becomes _now_, a `Map` becomes empty, and
  `Object.create(null)` throws.

**Effort:** S each, or zero if deleted

## P3 — `Results.JSON` is served as `text/plain`

**What:** Give `Result` a header field, or special-case the content type.

**Why:** No `Result` carries a header, so `Results.JSON` — 85 call sites,
including `/openapi.json` — is served as `text/plain`.

**Effort:** S

## P3 — Ledger and event `.jsonl` files have no rotation

**What:** Add size- or age-based rotation to the append-only `.jsonl` stores.

**Why:** Unbounded growth on long-lived projects. Flagged in the audit's closing
notes rather than as a verified finding — the original "O(n^2) hot path" framing
was refuted, but the unbounded growth is real.

**Effort:** S

## P3 — Windows is built and published but never exercised end to end

**What:** Add a Windows job that actually runs the CLI and the PTY paths, not
just compiles them.

**Why:** CI compiles and publishes `x86_64-pc-windows-msvc`, but no test
exercises it. The `shell/exec` argv-corruption item above independently
establishes that CLI self-update is broken on Windows today
(`cli/commands/handlers/update.ts:194-197`) — which is exactly the class of
defect an e2e job would have caught.

**Effort:** M

**Depends on:** the `@eserstack/shell/exec` argv fix
