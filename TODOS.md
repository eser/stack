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

**Why P3:** we are not adopting the backend. 31 MB is a small win against a 268
MB binary -- for scale, dropping one oversized dependency earlier took 278 MB
off every binary -- and the failure mode is severe. Worth filing upstream once
minimised, because "call a function that dynamically imports, then `.parse()`
the result" is an ordinary CLI pattern and the backend is young.

**Do not** add `--engine quickjs` without testing a lazily-dispatched command
end to end; `--help` passing proves nothing, as it never triggers a lazy load.

## ~~P1~~ DONE — Two installers, and the working one was undocumented

Resolved. There is one installer now: `etc/scripts/install.sh`, taking the
product as an argument (`eser`, `noskills`, `laroux`, `noskills-server`), with
`etc/scripts/install.ps1` as its Windows counterpart. Every product is built at
one version by one pipeline into one `SHA256SUMS.txt`, so a single script serves
all of them.

## ~~P0~~ DONE — GoReleaser has never published

Resolved by removing GoReleaser rather than repairing it.

The diagnosis stands as history: `build.yml`'s `tag-release` pushed the tag with
the default `GITHUB_TOKEN`, and GitHub does not dispatch workflows for events
created with that token, so `release.yml` — which triggered only on `push: tags`
— never fired. Verified against the API for v4.1.47 → v4.1.56: not one release
carried a `noskills_*` asset.

`.goreleaser.yaml` and `.github/workflows/release.yml` are both deleted.
`pkg/@eserstack/cli/scripts/compile.ts` now cross-builds `noskills-server`
(CGO_ENABLED=0, `-s -w`) alongside the deno-compiled binaries, so there is no
second workflow left to fail to trigger.

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

## ~~P0~~ DONE — Related lower-severity security hardening

**Done (2026-08-09).** All four resolved; two were worse or wider than
described.

- **CORS — the entry understated this.** `cors_middleware.go:109-113` was not a
  permissive default, it was _unconditional origin reflection_. Browsers reject
  `ACAO: *` together with credentials, so the wildcard default failed CLOSED;
  that branch converted an inert misconfiguration into a working
  any-origin-with- credentials policy — live on the daemon, wired ahead of
  `PinAuthMiddleware` on a router serving `/auth/login`. Combined with the XFF
  item below, any page a victim visited could drive PIN guesses at their daemon
  and read the token from the response. The reflect-on-wildcard branch is
  deleted, credentials default to false, `Vary: Origin` is emitted whenever the
  origin is request-dependent, and the comma-list bug (emitting the whole joined
  string as one invalid `ACAO`) is fixed. The test that pinned the insecure
  default was updated.
- **X-Forwarded-For.** New `httpfx.TrustedProxies` primitive, allowlist empty by
  default (trusts nobody), nil-safe so a config error degrades to `RemoteAddr`
  only. Forwarded headers are read solely when the immediate peer is trusted,
  and the chain is walked **right-to-left** to the first untrusted hop — the old
  code took the left-most element, which is entirely attacker-supplied. Wired
  through config → server → auth handler, and `resolve_address_middleware.go`,
  which had the identical bug class, now shares the same primitive instead of
  repeating it.
- **QUIC cert pinning — already fixed** by c06b36ce/b4ffb796 before this pass.
  Both sites hash `rawCerts[0]` only and additionally cover resumed handshakes
  via `VerifyConnection`. The line numbers in the original entry were stale.
- **`eser update` fail-open.** Both branches inverted to fail closed, and the
  match tightened from `includes()` to an exact second-field comparison
  mirroring `install.sh` — a substring test would accept the line for
  `<archive>.sig` or `<archive>.sha256`. The file had also moved to
  `codebase/cli-system/handlers/update.ts`. **The entry missed a fourth site:**
  `etc/scripts/install.ps1` fails open too (and its `WebException` catch is
  version-dependent, missing PowerShell 7's `HttpResponseException`); fixed in
  the same pass.

Original description follows.

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

## ~~P1~~ DONE — One memoized FFI client, replacing 19 copies

**Done (2026-08-09).** `loadEserAjan` now shares handles, and
`@eserstack/ajan/ffi/client` is the single loader every package goes through.
All **18** real singletons are gone — a repo-wide grep for `_libPromise` outside
the ajan package returns nothing. The 14 `ffi-client.ts` files became ~11-line
re-export shims rather than being deleted, because those module paths are what
each package's own code imports; the 4 `adapters/ffi/loader.ts` copies now
import the shared client, so crypto, formats and parsing hold one handle each
instead of two. The 3 shell-local `requireLib` helpers were deliberately kept:
they are not loaders, just null-checks carrying a domain-specific message
("EserAjanShellPty* requires FFI or command-mode WASM"), and they now delegate
through the shim.

Sharing makes `close()` a cross-package action, so handles are **reference
counted**: each caller gets a wrapper whose `close()` is idempotent for that
caller, and the library really closes only when the last holder releases. That
prevents one package from unmapping a library another is still calling.
Deliberate second decision: a **failed** open is not cached, because the usual
causes (library not built yet, permission not granted) change within a process
lifetime and a later attempt should be allowed to succeed.

`getLoadError()` is the point of the exercise — every one of the old copies
ended in `.catch(() => {})`, discarding the checked-paths list and the
native-vs-WASM cause that `ffi/mod.ts` had carefully built.

Verified by `ffi/client_test.ts`: concurrent callers get distinct wrappers over
one shared `symbols` object; one holder closing leaves another's handle working;
a double-close does not decrement twice; the last close really closes and the
guard then refuses calls; a released entry reopens on the next request.

**Not done:** the `callJson` envelope helper this entry also proposed. Each
package throws its own typed errors with its own message mapping (see
`formats/adapters/ffi/loader.ts`), and adding a helper without migrating those
call sites onto it would just be dead code. Filed as remaining below.

### ~~Remaining from this entry~~ DONE — `callJson` envelope helper

**Done (2026-08-10).** `callJson` lives in `@eserstack/ajan/ffi/client` and the
four `adapters/ffi/loader.ts` files (formats, crypto, parsing, config) now go
through it — 8 call sites, each losing its own copy of ensure/null-check/
stringify/parse/error-test.

The design point that made earlier attempts not fit: the error TYPES are the one
genuinely per-package part. Each package throws its own class with its own code
mapping (`FormatFfiError` recovering `FORMAT_NOT_FOUND` from the message,
`CryptoError` recovering `CRYPTO_UNKNOWN_ALGORITHM`, and so on). So `callJson`
takes `onUnavailable` and `onError` factories rather than flattening everything
into one generic error — which is what I had previously judged would make the
helper dead code, and was the right call until it was shaped this way.

Two details worth keeping: `invoke` is awaited, so the nine symbols Deno marks
`nonblocking` work unchanged alongside the synchronous ones; and the error field
is only treated as a failure when it is a **non-empty string**, because the
bridge omits it on success and some responses legitimately carry `error: null`.

**Not migrated, deliberately:** the remaining call sites in `logging`, `shell`,
`codebase` and the AI bridge do not share this envelope — they stream, poll
handles, or shape their own responses — so routing them through `callJson` would
mean contorting the helper rather than removing duplication.

### Original entry

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

**Update (2026-08-09 FFI review):** the count is now **21** copies, not 19 — 14
`ffi-client.ts` files (byte-identical modulo comments; verified by diffing
`cache` vs `collector`), 4 `adapters/ffi/loader.ts` re-implementations (config,
formats, crypto, parsing), and 3 shell-local `requireLib` wrappers
(`shell/exec/child-go.ts:23-31`, `shell/exec/pty-go.ts:20-28`,
`shell/tui/keypress-go.ts:21-28`). Worse: formats, crypto, and parsing each
carry **two independent singletons in the same package**, both reachable from
the package's public `mod.ts` (e.g. `formats/mod.ts:58`, `crypto/mod.ts:18`),
with divergent error mapping for the same symbols — so one package can hold two
dlopen handles. A process touching logging + shell + formats + codebase dlopens
the same dylib 4+ times. The fix shape stands: memoize inside `ajan/ffi/mod.ts`
(per-path) and ship `@eserstack/ajan/ffi/client` with
`ensureLib`/`getLib`/`requireLib` plus a `callJson(symbol, req)` envelope helper
(~10 lines of `stringify → call → parse → error-check` repeat at 30+ call sites,
~300 lines total).

**Effort:** M — done, see the summary at the top of this entry.

## ~~P1~~ DONE — Make the Go-bridge-vs-TS adapter choice observable and lossless

**Mostly already fixed; the observability gap is now closed too (2026-08-09).**

**The "lossless" half was stale.** The bridge already carries every generation
option -- `Temperature`, `TopP`, `ThinkingBudget`, `ResponseFormat` and `Tools`
all map through `bridge.go`, with the first three as pointers specifically so
"unset" stays unset rather than becoming a zero the provider would honour. The
`//nolint:exhaustruct` this entry blamed is gone from that path, and
`bridge_ai_wire_test.go` pins the mapping.

**The "silently falls back" half was stale in its stated form.** The choice is
per-provider now, not all-or-nothing, and the TS adapters are retained
deliberately: they are the only working path when no NATIVE binary loads, and
the bridge refuses to load over WASM precisely so that case falls back rather
than registering a provider that is present and broken. That reasoning is
documented at the call site.

**What was genuinely still open: the reason was discarded.**
`tryLoadBridgeFactories` ended in a bare `catch { return [] }`, so falling back
silently changed which implementation answers every AI call with nothing left to
explain why -- no native binary for this platform, an ungranted FFI permission,
a library that failed to open. It now records the cause and exposes it as
`getBridgeLoadError()`, re-exported from `adapters/mod.ts`. The underlying
loader's own diagnostic (checked paths, native-vs-WASM cause) survives as the
error's `cause`, since `ffi/mod.ts` no longer discards it either.

**Still open:** nothing reports which implementation actually served a given
call. `getBridgeLoadError()` answers "why not the bridge", which is the question
a bug report needs; a per-provider "who served this" readout would need a
decision about where it surfaces (CLI flag, `doctor` output, structured log).

### Original entry

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

## P1 — Atomic state writes and honest read failures (Go side DONE)

**The destructive half is fixed (2026-08-09); the TS side and the read-failure
classification remain open.**

`WriteManifest` no longer destroys the file. This entry's worst case was real
and reproduced before fixing: it marshalled `NosManifest` -- which models only
the noskills keys -- and wrote the result as the ENTIRE file, so an ordinary,
successful mutation deleted `stack:`, `workflows:` and `scripts:`. In this repo
that means deleting the `workflows:` block `deno task cli ok` executes. It was
reachable from the FFI bridge as well, not just the Go CLI.

It now merges the managed keys into the existing document through `yaml.Node`.
The obvious `map[string]any` merge would have passed a "foreign keys survive"
test while silently dropping **every comment** and reordering the document
alphabetically -- a smaller destruction, not the absence of one -- so there is a
second test pinning comments and document order. A manifest that exists but
cannot be parsed is now an error rather than something to overwrite.

Writes go through a new `writeFileAtomic` (temp file in the same directory,
`Sync`, `Chmod`, `Rename`), now used by `WriteManifest`, `WriteState` and
`WriteSpecState`. `WriteState`'s doc comment had claimed "atomically writes
state" above a plain `os.WriteFile` since it was written.

**Verified divergence found while doing this, and NOT fixed** (it belongs to the
duplicated-domain entry, and reconciling it changes an on-disk format): the TS
writer nests the noskills keys under a `noskills:` key (`state/persistence.ts`
does `doc.set("noskills", node)`), while Go's `ReadManifest`/`WriteManifest`
read and write them at the document's **top level**. Neither implementation can
see what the other wrote. `IsInitialized` also only stats the file despite its
comment claiming it checks the noskills section; the comment is corrected in
place.

**TS side done too (2026-08-10).** `writeTextFileAtomic` (sibling temp file,
rename, temp removed on any failure) now backs the four state-bearing writers:
`writeState`, `writeSpecState`, `writeConcern` and the manifest writer. A
sibling temp is required, not incidental -- rename is only atomic within a
filesystem, so a system temp directory would silently degrade to a copy.

Absent vs corrupt is now split in `readState` and `readSpecState`. The Go
signature (`(initial, err)`) does not translate: every TS caller depends on
these reads not throwing, so changing that would ripple everywhere for no gain.
Instead the return value is unchanged and a corrupt file produces a one-time
per-path warning naming the file. That is the difference between "nothing to
restore" and "restore this" -- previously a truncated file was indistinguishable
from an uninitialised project.

**A bug the test caught, worth recording.** The first `isNotFoundError` sniffed
Deno's `NotFound` name and Node's `ENOENT` code. The cross-runtime fs port
normalises both into its own `NotFoundError` class, so neither matched and every
_missing_ file was reported as corrupt -- precisely the false alarm the warning
exists to avoid. It now checks the class, keeping the raw forms as a fallback
for errors that bypass the port.

**Finished (2026-08-10).** Session bindings are atomic too -- they were filed
here as low stakes, which was wrong: they carry a copy of `phase`, and the
pre-tool-use enforcement gate reads it. The two `.gitignore` writes are the only
remaining plain writes, and they genuinely are low stakes (regenerated content,
no user work).

The list loops are fixed. The `try` used to wrap the entire walk in
`listSpecStates` and `listConcerns`, so one corrupt file aborted enumeration and
returned a **silently truncated list** -- every entry after the bad one looked
as though it did not exist, under a comment claiming the catch was only about a
missing directory. Now per-file, with the outer catch left for the absent
directory. The regression test names files so the broken one sorts first.

Worth noting where the correct pattern came from: `listSessions`, in the SAME
file, already had the per-file try/catch. This is the audit's recurring theme in
miniature -- the right primitive sitting next to the call sites that bypass it.

Temp files are safe against all three listings: they end in `.tmp` and every
walker filters on `.json`.

### Original entry

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

## P1 — Give workflow state a single owner and a single reader (READER FIXED)

**The enforcement-gate half is fixed (2026-08-09); the single-writer half
remains open.**

The reader bug was real and is the part with teeth, because it silently relaxes
enforcement. `handlePreToolUse` in `commands/invoke-hook.ts` read
`persistence.readState(root)` directly in its no-session branch, so once a
spec-scoped command moved a spec's phase, the gate kept consulting the global
copy — still saying `EXECUTING` — and permitted file edits the state machine no
longer allowed. No crash and no error; enforcement just applied a phase that was
no longer current.

That branch now resolves through the per-spec file when the global store names a
spec, falling back to the global copy when the spec directory is gone.
`resolveState` already implements exactly that precedence, so this routes the
last reader through it rather than adding a second rule.

**Scope note:** the entry's other two reader paths were already correct — the
session branch uses the session phase, and the no-`NOSKILLS_SESSION` branch
picks the _most restrictive_ phase across live sessions, which errs safe.

The regression test pins the invariant the gate depends on (a fresh per-spec
file beats a stale global one) in `state/resolve-state-precedence.test.ts`. It
does not drive `handlePreToolUse` end to end: that function is unexported and
reads env vars and stdin, so covering it directly needs a harness
disproportionate to a five-line change. Worth building if this area is touched
again.

**Writer half done (2026-08-10) — and the "~39 call sites" framing was wrong in
a way that mattered.**

The real count is **9 non-test files** that write both stores, not 39 call
sites. More importantly, only **4** of those write the SAME state to both and
were safe to migrate: `block`, `reopen`, and `approve` (twice). Those now call
`writeStateAndSpec`.

**Routing "every call site" through the helper, as this entry advised, would
have introduced bugs in five places:**

- `done`, `wontfix`, `cancel` and the dashboard's complete action deliberately
  write DIFFERENT states — a terminal phase (COMPLETED / WONTFIX) is kept in the
  per-spec file for history while the global store returns to IDLE. One state to
  both would either erase the record or strand the global store in a terminal
  phase.
- `reset` captures the spec name BEFORE `resetToIdle` clears it. The helper keys
  off `state.spec`, which is null by then, so it would have silently skipped the
  per-spec write and left that file stale — the exact class of bug the entry
  above this one is about.

All five now carry that reasoning at `writeStateAndSpec`'s definition, so the
next reader does not "finish the job" and reintroduce it.

**Still open:** the third copy of phase in `.eser/.state/sessions/*.json`. Also
worth recording: the two writes inside `writeStateAndSpec` are sequential, not
transactional — each file is individually atomic now, so neither can be torn,
but a crash between them leaves them disagreeing. `resolveState` prefers the
per-spec copy, which is the conservative side of that race.

### Original entry

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

## P1 — Wire config to behaviour, or delete the knobs (PARTIALLY DONE)

**The security-relevant half is done (2026-08-09); the inert knobs remain.**

The unbounded pre-auth body is closed. `ParseJSONBody` now wraps the body in
`http.MaxBytesReader`. Deliberately a **floor, not a policy**:
`RequestSizeLimitMiddleware` is still wired into zero servers, so putting the
bound in the parser is what makes it hold for every caller regardless of which
middlewares a given server installs. This mattered because `/auth/login` parses
its request the same way, so an unauthenticated caller could stream until the
process ran out of memory. The limit cannot be set to "unlimited": zero or
negative restores the documented 50 MB default, since an accidental zero should
fail to the default rather than back to the unbounded read this exists to
prevent.

`MaxRequestSizeMB` and `ExposeInternalErrors` are now actually read, via
`applyConfigPolicies` called from both `NewHTTPService` and `NewHTTP3Service`.
Those two were the ones the project's own
`.claude/skills/security-practices/references/rules.md` instructs operators to
set, so this is what makes that guidance true rather than decorative.

`ErrorHandlerMiddleware` now does something. It was
`result := ctx.Next();
return result` -- a pure passthrough -- while installed
as the OUTERMOST middleware in the daemon under the claim that it wraps
everything. It now recovers a handler panic into a sanitized 500 instead of
letting it escape. net/http would recover it at the connection level, but by
killing the connection: the client sees a dropped request rather than a
response, and no Result-based shaping applies. `http.ErrAbortHandler` is
re-panicked, per net/http's contract.

**Correction to this entry:** it lists `AuthMiddleware` among the middlewares
with "zero non-test call sites". That is wrong -- it has two. The genuinely
unwired ones are `RequestSizeLimitMiddleware`, `RateLimitMiddleware`,
`SecurityHeadersMiddleware`, `MetricsMiddleware` and `TracingMiddleware`.

**Still open:** `APIKeys`, `SkipAuthPaths`, `InitializationTimeout`,
`RateLimitRequests` and `AuthEnabled` are still declared and read by nothing;
`JWTSecret` still carries a "validated at startup" comment with no startup
validation; the five middlewares above are still wired nowhere; and the proposed
`httpfx.DefaultMiddlewares(cfg)` helper does not exist. Each remaining knob
needs the delete-or-implement decision this entry's title asks for -- that is a
product call about which of them are meant to exist at all, not something to
guess.

### Original entry

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

## ~~P1~~ DONE — Route all 16 spawn sites through one `processfx.Spawn`

**Done (2026-08-09), as `processfx.HardenCommand` rather than a `Spawn`
wrapper.**

The shape matters: a `Spawn(ctx, argv, opts)` that owns spawning would have had
to absorb every call site's own stdio, capture and env handling. `HardenCommand`
takes the `*exec.Cmd` the site already built and fixes only the part that was
wrong -- process group, group-kill on cancel, `WaitDelay` -- so migrating a site
is one line and cannot change its I/O behaviour.

Applied to the cancellable sites that lacked it: `processfx.Run` (covering both
`Exec` and `Run`), `codebasefx/git.go`, `noskillsserverfx/worker.go`,
`noskillsserverfx/projects.go` (a `git clone`, which can hang indefinitely), and
`pkg/@eserstack/ajan/bridge.go`'s `sh -c` -- the exact grandchild case. The two
sites that were already correct (`shellfx/exec`, `workflowfx/tools_unix`) were
left alone; the non-cancellable `exec.Command` sites take no context, so
cancellation cannot orphan anything there.

**A bug in the first draft, worth recording.** `HardenCommand` originally
guarded the assignment with `if cmd.Cancel == nil`. But `exec.CommandContext`
has _already_ installed a Cancel that kills the direct child only -- that
default IS the defect -- so the guard made the function a silent no-op for
exactly the commands it existed to fix. The grandchild test caught it: 10s
timeout before, 0.01s after. `processfx.Exec` cancellation likewise went from
5.25s (the `WaitDelay` fallback expiring) to 0.25s (a real group kill). Cancel
is now replaced unconditionally, while `WaitDelay` remains a default a caller
can override -- the test pins that distinction.

**Windows is honest about its limits:** no process groups are set there, because
killing a tree needs a Job Object. The direct child is still killed, which is
what happened before; the code says so rather than implying more.

### Original entry

**What:** Export `processfx.Spawn(ctx, argv, opts)` implementing process-group
kill plus `cmd.WaitDelay`, and route every `exec.Command*` site through it.

**Why:** `setupCancelKill` (`pkg/ajan/workflowfx/tools_unix.go:19`) does this
correctly and covers 1 of 16 `exec.Command*` sites.
`pkg/@eserstack/ajan/bridge.go:2224-2255` is one of the sites that does not.

**Effort:** M

## ~~P1~~ DONE — `Router.Group()` silently 404s; `connfx` ports are unsatisfiable

**Done (2026-08-09) — and the connfx half of this entry was wrong.**

`Router.Group()` now panics with an explanation instead of returning an
unmounted router whose every route 404s. It had zero non-test callers. Note it
was broken twice over: the fresh `http.ServeMux` was never mounted into the
parent, AND `Route` ignores `r.path` entirely (see its own TODO), so a prefix
would not have been applied even after mounting. Both halves have to land
together, so implementing it is not the small change this entry implied.
Panicking matches how the file already reports programmer error (`RouteRaw`
panics on a frozen router). Deletion should ride the 5.0.0 major.

The existing `TestRouter_Group` is worth calling out: it asserted only that
`GetPath()` concatenated the prefixes, never registering a route or issuing a
request — so it passed for as long as the feature was completely non-functional.
It now pins the refusal.

**Do NOT delete the connfx port layer.** This entry called it "366 lines of
Repository/Queue ports satisfiable by no adapter". That is false, and acting on
it would have deleted working code: `RedisAdapter` implements `Repository` in
full, pinned now by `repository_reachability_test.go`. Most of `data_ports.go`
is also load-bearing inside the package — `Message` has 57 internal uses,
`ConnectionCapability` 18.

The real defect was **reachability, not absence**. `GetRepository` asserted
against `conn.GetRawConnection()`, which every adapter implements by returning
the vendor handle (`*redis.Client`), while the `Repository` methods live on the
adapter — so it could never find them and returned `ErrInterfaceNotImplemented`
100% of the time, exactly as the audit measured. It now checks the connection
itself as well as the raw handle and reports what it tried.

**Still open (small, no consumer):** wiring `RedisAdapter` through so
`GetRepository` can actually return it needs an adapter accessor on the
`Connection` port. That is a design change, and nothing calls `GetRepository`
today, so it was not invented speculatively.

### Original entry

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

## ~~P1~~ DONE — Config parsing fails open on every error

**Done (2026-08-09).** All three defects in this entry were still live and are
fixed.

`reflectSetField` now returns `error` and every one of its ~16 conversions
propagates instead of discarding into `_`. All three call sites carry the key
path outward, including the slice-element one this entry did not mention. This
was the damaging one: an invalid override did not merely get ignored, it **beat
the declared default** and assigned zero while reporting success — and zero is
not inert, since `net/http` reads a zero Read/WriteTimeout as _no timeout_. A
typo in a deploy environment silently removed the timeouts it was meant to set.
Pinned by `configfx_invalid_value_test.go` across int, bool and duration.

The two existing float tests that this entry predicted "will need updating" did
exactly that — both literally _documented_ the fail-open behaviour as intended
("malformed float32 should silently produce zero"). They now assert rejection.

The `${VAR}` panic is fixed. `expandVariables` used a bare map index plus
`.(string)`, which panicked on any undefined name, and panicked **even for
defined names** under case-insensitive parsing, because keys are stored through
`lib.CaseInsensitiveSet` but were read with the literal spelling. Reproduced
before fixing, in `envparser_expand_test.go`. This one mattered beyond configfx:
the same code runs inside the cgo bridge, where a panic unwinds past the FFI
boundary and aborts the host process. Undefined now expands to empty, following
POSIX and godotenv, which this parser is a port of.

The named-return/defer bug is fixed in **both** parsers:
`defer func() { err =
file.Close() }()` overwrote the parse error
unconditionally, so a truncated or corrupt file was indistinguishable from a
valid one. The close error is now recorded only when the parse itself succeeded.
Pinned by `configfx_corrupt_file_test.go`.

### Original entry

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

## ~~P1~~ DONE — `@eserstack/shell/exec` corrupts arguments, and it is the mandated API

**Done (2026-08-09) — the argv half was already fixed; the rest is now closed.**

**The argv-corruption claim is stale.** Every corruption this entry lists was
already repaired by earlier work, and `parser.ts` carries the comments recording
it. Verified rather than assumed: all four named cases round-trip exactly
(`a\b`, `C:\Users\x`, `${""}` keeping its argv slot, and the `a\' --evil x`
injection arriving as one token), and then a **200,000-case fuzz** over an
alphabet of quotes, backslashes, `$`, backticks, pipes, semicolons, ampersands,
tabs and newlines found **zero** violations of the real invariant: one
interpolated value must arrive as exactly one byte-identical argv entry. That
invariant is now a test (`command.test.ts`) so it cannot silently regress.

**`pipe()` was genuinely broken and now refuses.** `PipedCommandBuilder.text()`
ran each command in turn and overwrote its `input` variable with each one's
stdout, never writing anything to the next child's stdin — so `a.pipe(b).text()`
returned b's output with b reading the _inherited_ stdin. It reported success
while answering a question nobody asked. `pipe()` now throws with a message
pointing at `.child()`, the unreachable `PipedCommandBuilder` is deleted, and
the `mod.ts` doc example that advertised the broken feature is gone. Deletion of
the method should ride the 5.0.0 major.

**Tests exist now.** This entry said there were none under
`pkg/@eserstack/shell/exec/`; `parser.test.ts` had since appeared, and
`command.test.ts` adds the round-trip invariant, the empty-interpolation slot,
and the `pipe()` refusal.

### Original entry

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

**Context:** `docs/adr/0003` already named the fix ("Option 2 … single source of
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

**Update (2026-08-09 FFI review):** bridge.go is now 5,510 lines. Concrete
duplication inventory for the split: ~10 registry quadruplets (map + RWMutex +
create/lookup/close) that a generic `handleRegistry[T]` would collapse; 5
near-identical stream create/read/close triplets (`codebaseWalkStreamState` and
`codebaseValidateStreamState` at bridge.go:4476-4486 are byte-identical
structs); `aiHandleResponse` re-declared four times (`cacheHandleResponse`,
`postsHandleResponse`, `parsingTokenizerHandleResponse`,
`tuiKeypressCreateResponse`); the kit `chainResult→results` loop appears 4 times
(bridge.go:3458, 3568, 3646, 3711); URL/header assembly duplicated between
`bridgeHttpRequest` (1417-1446) and `bridgeHttpRequestStream` (1555-1581).
Estimated 1,500+ lines removable. Also: `noskillsBridgeDetectBranch` (2671-2685)
hand-parses `.git/HEAD` while `codebasefx.GetCurrentBranch` is imported and used
in the same file (4070). On the Init/Shutdown honesty question: only the AI
adapter ever calls Init (`ai/adapters/ajan-bridge.ts:903`), nothing on the TS
side ever calls Shutdown or `lib.close()`, and because all consumers share one
Go image with global registries, any single consumer calling `EserAjanShutdown`
would destroy every other package's live handles via `closeAllHandles` — the
current safety is "nobody calls it", not isolation.

**Effort:** S (split) / M (with the generic registry + stream state)

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

## ~~P3~~ DONE — `Results.JSON` is served as `text/plain`

**Done (2026-08-10).** `Result` gained `InnerContentType` plus a `ContentType()`
accessor; `JSON` and `PlainText` set theirs, and the router writes the header.
Two ordering details that make or break it: the header must be set BEFORE
`WriteHeader` or net/http discards it, and it is only set when the existing
header is empty, so a middleware or raw handler that already chose one wins.

An empty content type keeps the old sniffing behaviour, so the ~120 `Result`
literals that do not know their type are unaffected — which is also why this did
not need touching all 85 call sites. (`exhaustruct` is referenced by `//nolint`
comments throughout this package but is not actually enabled in
`.golangci.yaml`, so adding a field broke no keyed literal.)

**This fix exposed a data race I had introduced earlier.** Wiring
`ExposeInternalErrors` into the service constructors meant `SetDiscloseErrors`
now runs at construction, while `discloseErrors` was a plain `bool` read by
every request goroutine — a genuine race that `go test -race` caught across a
dozen httpfx tests. It is now `atomic.Bool`, matching the treatment
`configuredMaxRequestBodyBytes` already had. The setter had existed for a long
time; nothing called it outside tests, so the unsafety was latent until the knob
was actually connected.

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

---

# FFI End-to-End Review (2026-08-09)

Findings from a focused review of the eser-ajan FFI seam: Go bridge
(`pkg/@eserstack/ajan`), the three TS backends, the WASM fallback, and all
consumer packages. Four parallel review agents (symbol parity, TS backends, Go
bridge, consumer wiring) plus live verification; the two highest-severity Go
findings were re-verified by hand against the source.

**Verified working — baseline, not TODOs.** All 100 `//export` symbols in
`main.go` match the built dylib (`nm` diff), `ffi/types.ts`, and all three
backend declaration maps 1:1 (names, arity, pointer/int types). Live smoke test
passes on Deno, Bun, and Node against the native dylib: init/version, JSON
round-trips, handle lifecycle, and malformed JSON returns structured errors
without crashing. `go test ./...` passes; formats/crypto/parsing/ai FFI suites
all pass. Wiring contracts (TS request/response shapes vs Go structs) verified
field-for-field for logging, formats, codebase, and ai. No consumer bypasses the
unified loader. String freeing in the wrapper layer is centralized and leak-free
on happy paths. (Local-only observation, no action:
`dist/aarch64-darwin/libeser_ajan.dylib` was built at 4.3.0, one release behind
`VERSION`; CI rebuilds fresh so this is a stale local artifact.)

Two findings from this review were folded into existing audit entries rather
than filed here: the consumer-loader duplication update (now 21 copies, dual
singletons per package) lives in **P1 — One memoized FFI client**, and the
bridge.go duplication inventory + Init/Shutdown footgun lives in **P2 — Split
`bridge.go`**.

> **Status (2026-08-09, same day):** everything filed in this section is **done
> except two items**, both explicitly noted below: the full symbol-table
> collapse (its highest-value half, the machine parity check, shipped) and
> making Bun/Node AI calls genuinely async (documented instead). Also fixed in
> the same pass, from the earlier audit: **P0 — Related lower-severity security
> hardening**, and **P1 — One memoized FFI client** (18 duplicated loader
> singletons collapsed onto one shared, reference-counted handle).
>
> `deno task cli ok` is green end to end. Independently re-verified rather than
> taken from agent reports: `gofmt`/`vet`/`go build`/`go test -race` on both Go
> modules; the `GOOS=wasip1` build; exactly 100 cgo exports before and after the
> wholesale `main.go` rewrite; the native smoke test on Deno, Bun and Node; the
> WASM fallback now raising a named, actionable error; and the full Deno suite
> at 2248 passed / 0 failed.
>
> Two things the fixing pass surfaced that the review had not:
>
> - `CloseIdleConnections` would have been a **silent no-op** written the
>   obvious way — `ResilientTransport` does not implement it, so the promoted
>   `http.Client` method does nothing. It has to reach the inner transport.
> - The `dist/wasi/` artifact simply had never been built locally, which is the
>   whole reason the fallback resolved the published
>   `@eserstack/ajan-wasm@4.1.57` instead. Once `scripts/build.ts` runs, the
>   local 4.3.1 wasm wins. That sub-finding was a stale local artifact, **not**
>   a code defect — no fix was needed or made.
>
> Unrelated pre-existing gate failures fixed in passing: `.agents/` (the
> vendor-neutral mirror of `.claude/`, untracked) tripped `validate-filenames`
> because `SKILL.md` is a fixed convention name that cannot be kebab-case, and
> `validate-secrets` on a security doc that teaches by counter-example. Both got
> the exemption `.claude/` already had, in `.eser/manifest.yml`.
>
> One structural consequence worth knowing: extending the security fix pushed
> `pkg/ajan/noskillsserverfx/server.go` past the deliberate 500-line
> `validate-server-loc` limit, so its session REST handlers moved to
> `session_handlers.go`, matching the existing `auth.go`/`auth_handlers.go`
> pairing. server.go is now 423 lines.

## ~~P1~~ DONE — WASM command-mode fallback silently breaks every handle-based API

**Done (2026-08-09).** Culled, not faked: handle-based symbols now raise a named
error stating that the module is re-instantiated per call, that handles cannot
survive, and how to fix it (install the platform package or set
`ESER_AJAN_LIB_PATH`). Stateless symbols still work — verified live,
`FormatList` returns data while `LogCreate` throws. `ShellPtyRead` rejects
rather than throwing synchronously, so its `Promise<string>` contract holds.
Reactor `""` stubs now return valid JSON, and the unusable reactor AI exports
carry a comment explaining why the host cannot call them. The stale-4.1.57
sub-finding needed no fix (see the status note above).

**What:** Either keep one live `WebAssembly.Instance` across calls in the
command-mode loader, or cull the command-mode symbol surface to stateless
functions (format, crypto, config, codebase one-shots) so handle-based calls
fail loudly instead of lying.

**Why:** `wasm/loader-command.ts:41-69` instantiates a **fresh** WASI instance
(fresh linear memory) per symbol call, and `main_wasi.go:24-35` serves exactly
one request per `_start` — so every Go-side registry (`modelHandles`,
`logHandles`, `httpStreamHandles`, `ptyHandles`, …) resets between calls.
Reproduced live: `EserAjanLogCreate` returns `{"handle":"log-1"}` and
`EserAjanLogClose` one call later returns
`{"error":"log handle not found: log-1"}`. Yet the loader exposes all ~100
symbols, and `loadEserAjan()` falls back to it automatically, so on any machine
without a native library every stateful API silently misbehaves (stream reads
return `"null"` immediately, model handles vanish, …).

**Context:** Command mode is the **default** (`wasm/mod.ts:69`). Related rot in
the same layer, fix or delete together:

- The repo's own WASM fallback resolves the published
  `@eserstack/ajan-wasm@4.1.57` from node_modules — reproduced live:
  `ESER_AJAN_NATIVE=disabled` reports `eser-ajan version 4.1.57` against a 4.3.x
  native bridge. Two minors of silent behavioral drift on the fallback path.
- Reactor loader stubs return `""` (not valid JSON) from `LogClose`,
  `AiCloseModel`, `AiFreeStream`, `HttpClose`, `HttpStreamClose`, `CacheClose`
  (`wasm/loader-reactor.ts:134,149,150,167,173,199`) — callers that `JSON.parse`
  get "Unexpected end of JSON input" instead of a clear error.
- `main_wasi_reactor.go:66-98` exports 6 AI functions whose arg-passing protocol
  is unimplementable from the host (args are read out of `resultBuf`, but no
  export lets the host write into it; `eser_ajan_result_ptr` returns null while
  the buffer is empty, :31-33). The TS loader correctly stubs them all — the Go
  exports are dead weight. Treat reactor mode as experimental or remove it
  (matches the standing note in P2 — Pick one owner).

**Effort:** S (cull to stateless + fix stubs) / M (persistent instance)

## ~~P1~~ DONE — No `recover()` anywhere on the cgo export surface

**Done (2026-08-09).** `panic_guard.go` adds
`guardString`/`guardInt`/`guardVoid` (stack trace to stderr, compact JSON to the
caller). `main.go` was rewritten wholesale so all ~100 exports funnel through
them, with `C.GoString` argument marshalling deliberately _inside_ the guarded
closure so malformed input is covered too. The WASI dispatch is guarded in one
place; the reactor's `resultBuf` slicing is bounds-checked. Export set verified
byte-identical at 100 before and after. Note the limit: `recover()` cannot catch
Go _runtime_ fatal errors (concurrent map writes, the semaphore class) — only
panics.

**What:** One shared wrapper (`defer recover()` returning
`{"error":"panic: …"}`) that every `//export` in `main.go` routes through;
bounds-check the WASI reactor's buffer slicing.

**Why:** `grep recover()` over `pkg/@eserstack/ajan` returns zero hits
(verified). Malformed JSON is handled at every entry point, but a panic anywhere
in `bridge.go` or any downstream `pkg/ajan/*fx` package unwinds through cgo and
**aborts the host Deno/Node/Bun process** — the no-panic guarantee currently
rests on every transitive dependency instead of on the boundary. One concrete
in-repo panic path exists today: `main_wasi_reactor.go:68-101` slices
`resultBuf[:hostSuppliedLen]` with no bounds check, and `resultBuf` is nil
before the first `setResult`.

**Context:** The 2026-08-01 audit already documented a related class (config
envparser panic "including inside the cgo bridge" — see P1 — Config parsing
fails open). A boundary `recover()` converts that whole class from process-abort
to a JSON error.

**Effort:** S

## ~~P1~~ DONE — Logging over FFI: data race, level-gate bypass, swallowed errors

**Done (2026-08-09).** All three. The log entry gained a mutex plus a
`snapshot()` that reads `filters` and `formatter` together under one `RLock`;
the race test reproduces `WARNING: DATA RACE` when the locks are removed. The
formatter path now gates on the same `Enabled` predicate `shouldLog` answers
with. On the TS side, `logger.ts` parses both responses and degrades to a stderr
console sink, warning once per process — logging never throws and never silently
drops a line. Two deliberate choices: stderr not stdout (a log line on stdout
corrupts piped output, the bug the ffi `debugLog` comment records), and a
substring marker rather than a full `JSON.parse` on the hot path.

**What:** Three defects in one pipeline; fix together and add a `-race` test.

- Per-entry synchronization for log handles: `bridgeLogConfigure`
  (`bridge.go:1955-1975`) looks the entry up under `logMu.RLock`, releases, then
  **writes** `entry.filters` / `entry.formatter` / `entry.levelVar`, while
  `bridgeLogWrite` (`bridge.go:1866-1877`) reads `entry.filters` /
  `entry.formatter` with no lock. Deno's `nonblocking: true` symbols run on a
  thread pool, so these are genuinely concurrent — a real Go data race
  (function-value word tearing). Verified by hand. `logMu` protects only the
  map, not the entries; entries need their own mutex or atomics.
- Custom formatter bypasses the level gate: with `entry.formatter != nil`,
  `bridgeLogWrite` writes to stderr unconditionally (`bridge.go:1870-1877`);
  `levelVar` is only consulted on the slog path. After
  `logConfigure {formatter:"text", level:"ERROR"}`, a DEBUG write still emits —
  while `bridgeLogShouldLog` for the same handle says false.
- The TS client swallows both failure signals: `#ensureGoHandle`
  (`logging/logger.ts:94-108`) parses `{handle?, error?}` but ignores `error`,
  and the `EserAjanLogWrite` return value is never parsed (`logger.ts:238-245`).
  If create fails, `#goHandle` stays undefined, Go returns
  `{"error":"log handle not found: "}` (`bridge.go:1847-1852`), and every
  subsequent log line vanishes with no signal.

**Context:** Root cause is architectural: `bridgeLogCreate`/`bridgeLogWrite`
hand-assemble a slog handler and re-implement filter/format emission instead of
`logfx` owning it — the first two bugs are direct consequences. Consider routing
through logfx as part of the fix.

**Effort:** S (locks + gate + TS error check) / M (route through logfx)

## ~~P1~~ DONE — Validator results are mislabeled in `codebaseValidateFiles`

**Done (2026-08-09).** Fixed at the root cause rather than by correcting the
list: name and function now travel together as `validatorEntry` pairs, so the
two lists cannot drift again. Unknown requested names now return
`ErrUnknownValidator` instead of being dropped. Both call sites share the
helper. `TestDefaultValidatorEntriesMatchBuiltins` compares function pointers
against `codebasefx.BuiltinValidators()`, so reordering _there_ cannot silently
reintroduce this. The consumer sweep found nothing pinning the wrong names — all
17 `withGoValidator` call sites pass a single name and overwrite the label.

**What:** Zip results with names at resolution time instead of keeping two
parallel lists; error (or at least report) on unknown requested validator names.
Add one assertion on result names to the non-stream test path.

**Why:** Verified by hand. Default path: `resolveValidators(nil, …)` returns
`codebasefx.BuiltinValidators()` ordered
`[EOF, TrailingWhitespace, BOM, MergeConflicts, LineEndings, Secrets]`
(`pkg/ajan/codebasefx/validators.go:619-628`), but `validatorNames` returns
`["eof","bom","trailing","line-endings","merge-conflicts","secrets"]`
(`bridge.go:4354-4360`) — indices 1-4 are mislabelled: trailing-whitespace
issues are reported as "bom", BOM as "trailing", merge conflicts as
"line-endings", line endings as "merge-conflicts". Requested path:
`resolveValidators` silently drops unknown names (`bridge.go:4344-4348`) while
`validatorNames` echoes the requested list verbatim — `["bogus","eof"]` yields
EOF results labelled "bogus". Same defect duplicated in
`bridgeCodebaseValidateFilesStreamCreate` (`bridge.go:4642-4648`).

**Effort:** S

## ~~P1~~ DONE — Bun backend: GC use-after-free hazard on input buffers

**Done (2026-08-09).** Removed the hazard rather than racing it: `ptr()` is gone
from the backend entirely and buffers are passed as TypedArrays, which bun:ffi
keeps alive across the call. Merely holding a reference in the calling frame
would have worked too, but leaves the trap armed for the next wrapper someone
adds.

**What:** Keep the encoded `Uint8Array`s alive across the FFI call (return the
buffer from `toCString` and hold it in the caller's frame, or pass TypedArrays
directly — bun:ffi accepts them for `ptr` args, which removes the hazard
entirely).

**Why:** `toCString` (`ffi/backend-bun.ts:442-446`) passes `ptr(encoded)` out
while `encoded` becomes unreachable the moment the function returns; bun:ffi's
`ptr()` returns a raw number and requires the TypedArray to outlive the pointer.
Worst case is the two-argument calls (`EserAjanAiGenerateText` /
`EserAjanAiStreamText`, backend-bun.ts:485-505): allocating the second buffer
can trigger a GC that collects the first **before** the call executes. The Deno
backend explicitly guards this exact hazard (`backend-deno.ts:529-531` — "both
buffers must stay referenced… or the GC could free memory Go is reading"); the
Bun backend does not.

**Effort:** S

## P1 — Collapse the three TS backends into one symbol table + adapters (PARTIALLY DONE)

**Partially done (2026-08-09) — item (c), the machine parity check, has shipped;
(a) and (b) remain open.** The drift risk this entry exists to remove is now
guarded even though the duplication itself is not yet collapsed:
`pkg/@eserstack/codebase/ajan-ffi-parity.test.ts` ties all six declaration sites
together — the cgo exports in `main.go`, `ffi/types.ts`, the three native
backends and the WASM loader — plus a runtime check that the _compiled_ library
exposes exactly the declared symbols, plus WASI dispatch names against what the
loader sends. Extractors are indentation-agnostic and floor-checked, so a
silently-empty parse reports itself instead of passing vacuously. It lives
beside `ajan-ranges.test.ts`, the existing precedent for a cross-cutting
invariant guard. Also landed from this entry's spirit: `ffi/close-guard.ts` is
now one shared implementation used by all three backends instead of three
hand-rolled copies.

**Still open:** the symbol table itself (a) and the mapped type over it (b).
Note the constraint the guard now imposes — the loaders' symbol names must stay
_literal_ object keys, or the extractor needs updating in the same commit.

**What:** (a) A shared `symbols-table.ts` — `{name, arity, nonblocking}` for all
100 symbols (~120 lines); derive Deno's dlopen map, Bun's dlopen map, koffi's
prototype strings, and all wrapper functions from it by a loop. Each backend
shrinks to a ~60-100-line adapter
(`open/encodeArg/call/callAsync/decodeAndFree/close`). (b) Make `types.ts`'s
570-line `symbols` interface a mapped type over the table. (c) A small generated
parity check: Go `//export` list vs table keys vs the `main_wasi.go` case list.

**Why:** The three backends total 3,085 lines (deno 1,403 / bun 972 / node 710)
of which ~90% is mechanical repetition: every symbol except four specials fits
`()→string`, `(string)→string`, or `(string,string)→string`. Today a new Go
export requires **five** hand edits (main.go, types.ts, three backends — plus
main_wasi.go and the WASM loaders), and nothing machine-checks the agreement:
`createSymbolWrappers` takes `rawSymbols: any` (`backend-deno.ts:471-474`), so a
missing declaration compiles cleanly and explodes at runtime; the Bun/Node maps
have no compile-time tie to types.ts at all. Today's 100-way agreement is real
but hand-kept. Not just line count: the Bun GC bug and the decode-throw leaks
(below) exist precisely because each backend hand-rolled its own encode/free
helpers instead of sharing one audited implementation.

**Context:** Extends **P1 — One memoized FFI client** (which already names the
manifest idea) and the "99-symbol C ABI restated by hand in 7-8 files" line in
**P2 — Pick one owner per duplicated domain**. Do the memoized client and this
in one motion — same seam, same owner.

**Effort:** M

**Depends on:** nothing; unblocks the parity check and shrinks every future
export to a one-line table edit

## ~~P2~~ DONE — `loadEserAjan` bare catch swallows all native errors

**Done (2026-08-09).** The native error is captured, passed through `debugLog`,
carried as the Error `cause`, and named in the combined failure message
alongside the WASM cause. An explicitly-passed `libraryPath` that fails to open
now rethrows instead of falling back. The documented-but-nonexistent `backends`
option was implemented rather than deleted, and `selectBackend`'s doc corrected
to match what it does.

**What:** Capture the native error, `debugLog` it, include it in the combined
failure message, and rethrow (no WASM fallback) when the caller passed an
explicit `libraryPath`.

**Why:** `ffi/mod.ts:264-273` discards: `resolveLibraryPath`'s carefully built
checked-paths message (`resolve.ts:231-238`), Deno `--allow-ffi` permission
errors, dlopen failures for a found-but-wrong library (arch mismatch, ABI
drift), and `selectBackend`'s own error. A real native error silently degrades
to WASM — which per the P1 entry above may be broken-at-runtime — and when WASM
also fails, the thrown message claims "No native FFI backend available"
reporting only the WASM error. Even `ESER_AJAN_DEBUG=1` cannot surface the
native cause (the catch doesn't log). An explicit `libraryPath` failing to open
almost certainly should not fall back at all.

**Effort:** S

## ~~P2~~ DONE — Library resolution misses the standard hoisted-npm layout

**Done (2026-08-09).** Resolution now walks `node_modules` ancestors upward from
the module directory, so the hoisted scope-sibling layout resolves regardless of
cwd, with `checkedPaths` still listing every location actually probed in probe
order. The `node:fs` top-level await is deferred into `fileExists` (memoized),
so a runtime without `node:fs` can now reach the WASM fallback that exists for
it instead of failing at import time — which also removes a `no-top-level-await`
lint exception. Stale comments corrected; the JSR constraint is documented.

**What:** Walk `node_modules` ancestors from `moduleDir` (or add
`${moduleDir}/../..` as a scope-sibling root; `import.meta.resolve` /
`require.resolve` is the robust option under Node/Bun). Defer the `node:fs`
import into `fileExists`.

**Why:** When installed from npm, this module lives at
`<proj>/node_modules/@eserstack/ajan/ffi/` and the optional platform package is
hoisted to the sibling `<proj>/node_modules/@eserstack/ajan-<slug>/` — which
equals `${moduleDir}/../../ajan-<slug>/` and is **never checked**:
`resolve.ts:208-217` tries only `moduleDir`, `pkgRoot`, and `cwd` as
`node_modules` roots. So the standard npm layout resolves **only when the
process cwd is the project root** — a CLI invoked from any subdirectory falls
through to system paths, then errors (or silently drops to WASM via the bare
catch above). pnpm's isolated layout misses all three roots too.

**Context:** Also in resolve.ts: the top-level `await import("node:fs")`
(`resolve.ts:18`) is reached via mod.ts's _static_ import, so on any runtime
lacking `node:fs` the whole entry module fails at import time — before the WASM
fallback (the branch meant for exactly such runtimes) can run. Comment nits:
`resolve.ts:126` names the package `@eserstack/eser-ajan-{platform}` (code uses
`@eserstack/ajan-{slug}`); JSR installs have no optionalDependencies and
remote-cached modules have no `import.meta.dirname`, so JSR effectively requires
`ESER_AJAN_LIB_PATH` — worth documenting.

**Effort:** S

## ~~P2~~ DONE — FFI `close()` has no closed-state guard; close during in-flight calls

**Done (2026-08-09).** `ffi/close-guard.ts` — one implementation wrapping all
three backends. `close()` is idempotent; any symbol called afterwards throws an
Error naming it instead of segfaulting inside a library that is no longer
mapped. Wrappers preserve arity deliberately, since arity is part of the ABI
contract. The two things it does not enforce are documented at the top of the
module: `close()` does not call `EserAjanShutdown`, and Deno's nonblocking
symbols may still be on the FFI threadpool, so callers must settle promises and
close streams first. In-flight tracking was deliberately not implemented.

**What:** A `closed` flag on all three backends (throw a friendly error on
use-after-close / double-close), plus either an in-flight counter or a
documented "close only after all streams are closed and promises settled"
contract.

**Why:** All three backends (`backend-deno.ts:1398-1401`,
`backend-bun.ts:967-969`, `backend-node.ts:705-707`) call the runtime's
`close()`/`unload()` unguarded. Double-close is whatever the runtime does (Deno
throws `BadResource`; koffi `unload` of a Go c-shared library is undefined
behavior — a Go runtime cannot be dlclosed safely, which is exactly why
`pin_image_posix.go` exists). Any symbol call after `close()` is a UB/segfault
path. On Deno, `nonblocking: true` symbols may still be executing on the FFI
threadpool when `close()` runs — a crash window. Nothing tracks outstanding
stream/PTY/keypress handles at close time.

**Context:** In practice no TS consumer ever calls `lib.close()` (see the
Init/Shutdown note under P2 — Split `bridge.go`), so this is latent — but the
API is public.

**Effort:** S

## ~~P2~~ DONE — bridge.go handle hygiene: stream-close hang, model use-after-close, inconsistent semantics

**Done (2026-08-09).** Stream close now closes the body first, outside the read
mutex (`TestHttpStreamCloseDoesNotWaitForAStalledRead` blocks for 5s against the
old code). Models got the streams' proven acquire/release + delete-then-Wait
shape via a by-handle `sync.WaitGroup` side map — a state struct was not
possible because `bridge_ai_cancel_test.go` assigns models into the registry
directly. Close is now uniformly idempotent-success, the safe direction; read
sentinels were deliberately left alone and now carry a comment saying so.
Per-handle mutexes added for stream reads and tokenizer push.
`CloseIdleConnections` reaches the inner transport (see the status note — the
obvious form is a silent no-op). Negative config clamped via
`countOrDefault`/`durationOrDefault`. The hand-rolled `.git/HEAD` parser is gone
in favour of `codebasefx.GetCurrentBranch`.

**What:** Batch of related registry/handle fixes in `bridge.go`:

- `bridgeHttpStreamClose` waits on `entry.mu` (`bridge.go:1691`) which
  `bridgeHttpStreamRead` holds **across the blocking network read**
  (`bridge.go:1639-1657`) — closing a stalled SSE/long-poll stream blocks the
  FFI thread until the server sends bytes. `http.Response.Body.Close` is safe
  concurrent with `Read` and unblocks it: close the body first, outside the read
  mutex. Same pattern inherited by `closeAllHandles` (`bridge.go:546-555`).
- Model use-after-close: `bridgeAiGenerateText`/`StreamText` copy the model out
  under `RLock` (`bridge.go:631-633, 663-665`) and a concurrent
  `bridgeAiCloseModel` (743-776) can close it mid-generation. Streams got
  in-flight protection (`streamState.wg` — correctly ordered, keep it); models
  got none.
- Inconsistent unknown-handle / double-close semantics: stream reads return the
  completion sentinel `"null"` for a _missing_ handle
  (`bridge.go:712-714, 4566-4568, 4697-4699`) so use-after-free is
  indistinguishable from end-of-stream, while exec/PTY reads return an error
  JSON (5275-5277, 5412-5414); double-close errors for
  model/http/log/pty/exec/tokenizer/keypress but is silently idempotent for
  `aiFreeStream` (793-795), `cacheClose` (3220-3231), `postsClose` (3914-3918),
  and the walk/validate stream closes. Pick one contract.
- Per-handle operations without per-handle locks: concurrent
  `bridgeAiStreamRead` on one handle calls `iter.Next()` concurrently
  (`bridge.go:717`); concurrent `tokenizerPush` calls `tok.Push` concurrently
  (`bridge.go:4985`). httpStream got a per-entry mutex; these did not.
- Small ones: `bridgeHttpClose` (1483-1496) drops the client without
  `CloseIdleConnections` (pooled TCP lingers); negative numeric config becomes
  huge unsigned (`uint(req.FailureThreshold)` / `uint(req.MaxAttempts)`,
  bridge.go:1333, 1344; negative `TimeoutMs` unclamped).

**Effort:** S each; do alongside the P2 bridge.go split

## P2 — Bun/Node AI calls block the event loop and defeat cancellation (DOCUMENTED, NOT FIXED)

**Partially addressed (2026-08-09).** The LIMITATION comment that only the PTY
wrappers carried now also sits on the generate/stream/batch wrappers in both
backends, so the constraint is visible where it bites. **The behaviour is
unchanged** — under Bun and Node these calls still park the event loop and
`EserAjanAiCancelRequest` still cannot fire mid-call. Making them genuinely
async (bun:ffi `threadsafe`, koffi async, or a worker) is the remaining work.

**What:** Use Bun's `FFIFunction.threadsafe`/async support for the 9 long-
running symbols (AI generate/stream/batch, PTY read); for koffi, either its
async call mode or a worker. At minimum, extend the LIMITATION comment that the
PTY wrappers already carry to the AI wrappers, and note it where
`types.ts:41-56` promises cancellability.

**Why:** Under Bun and Node all AI calls are synchronous-blocking
(`backend-bun.ts:485-550`, `backend-node.ts:403-444`) — a minutes-long
`generateText` parks the entire event loop, and `EserAjanAiCancelRequest` can
never fire mid-call because the abort listener cannot run. Only Deno marks these
`nonblocking: true` (`backend-deno.ts:51-65`). Only the PTY-read wrappers
document the limitation (bun 935-940, node 682-688); the same caveat applies to
generate/stream/batch.

**Effort:** S (document) / M (actually async)

## ~~P3~~ DONE — TS backend small fixes (leaks on decode-throw, stale messages, doc bugs)

**Done (2026-08-09).** `try/finally` around the free in all three decode
helpers. koffi version message corrected to the pinned range; the stale symbol
count rephrased so it cannot go stale again. The `backends` option was
implemented (see the loader entry above) rather than removed from the docs.
`Commit.body` no longer claims to be a required `string` when Go emits it
`omitempty`.

**What:** Batch of small, independent items in `pkg/@eserstack/ajan/ffi/`:

- `try/finally { free(ptr) }` in all three decode helpers — an exception during
  decode leaks the Go allocation: Bun `readAndFree` (`backend-bun.ts:451-458`),
  Node `takeString` (`backend-node.ts:77-86`), Deno `readCString`+`freePtr`
  (`backend-deno.ts:457-479`). Happy paths are leak-free (audited); these are
  exceptional-path one-offs.
- `backend-node.ts:56-61` error message claims koffi "^2.15.0" while
  package.json pins `^3.1.4` — misdirects anyone debugging a version mismatch.
  Also `backend-node.ts:68` says "96 symbols"; it's 97 malloc'd returns.
- `ffi/mod.ts:34` advertises `loadEserAjan({ backends: ["deno"] })` but
  `LoadOptions` (mod.ts:62-67) has no `backends` field — silently ignored.
  `selectBackend`'s doc comment (mod.ts:170-197) describes parameters and
  flag-checking it doesn't have.
- `codebase/git.ts:16-23` types `Commit.body` as required `string` while Go
  emits `body,omitempty` (`bridge.go:3966-3970`) — empty-body commits yield
  `body: undefined` behind a `string` type.

**Effort:** XS each

## P3 — Untested FFI surface (test-gap inventory) (PARTIALLY DONE)

**Partially done (2026-08-09).** The two tests called out below as highest-value
both exist now: `bridge_handle_safety_test.go` carries a `-race` log
configure/write test and a validator-names assertion, each verified to fail
against the unfixed code. Also added: `panic_guard_test.go`, idempotent-close
and unknown-handle coverage across 10 close entry points, the stalled-read and
in-flight-generation tests, `ffi/mod_test.ts`, `ffi/resolve.test.ts`,
`logger.test.ts`, `update.test.ts`, `client_ip_test.go`, expanded
`cors_middleware_test.go`, and the ABI parity guard.

**Still untested:** AI batch, cache/cs/kit/posts/collector/noskills bridges,
shell exec/pty/tui (still nothing at all), the workspace checks, and the
`main_wasi.go` dispatch including `extractStringArg`.

**What:** Add coverage for the surface the bridge tests skip entirely. Well
covered today: AI cancel registry (incl. concurrency), AI wire mapping,
codebase/http/parsing stream leak gates, HTTP error/retry mapping, log
lifecycle, workflow shell steps, lifecycle smoke. **Untested:** all AI batch
functions; format encode/decode/document (Go side — the TS `.ffi.test.ts` covers
the TS client); cache, crypto, cs, kit, posts, collector, noskills bridges;
shell exec/pty/tui (nothing at all); non-stream `codebaseValidateFiles` (one
assertion on result names would have caught the P1 mislabeling); the workspace
checks; the entire `main_wasi.go` dispatch (`extractStringArg` included); and no
`-race` stress on any registry except the cancel table — which is exactly why
the log-handle race survived.

**Why:** The FFI seam's safety net is currently the consumer-side `.ffi.test.ts`
suites (Deno backend only) plus CI's `ajan version` smoke on three runtimes.
Everything else listed above ships on trust.

**Effort:** S per subsystem; prioritize a `-race` log configure/write test and
the validateFiles names assertion (both would have caught this review's P1 bugs)
