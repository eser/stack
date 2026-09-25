<!-- Generated from the security audit run stack-run-1 against ref f73949533a0450622fa1ceda9e61f552ca157aaa. <repo> is this repository; <audit-run> is the audit output directory kept outside the repository, where the agents/*/artifacts paths cited below live. Fix work is tracked in backlog/ under the security label. -->

# Security audit report: eser/stack (run stack-run-1)

## 1. Run summary

Profile: standard. Scope: the whole repository (.). Budget: none set. Source
ref: `f73949533a0450622fa1ceda9e61f552ca157aaa` (the worktree carried 33
modified markdown files (documentation prose pass), no source code changes
uncommitted). Execution policy: sandboxed-source-and-local-only. Every
target-controlled check ran inside the Apple `container` Linux VM sandbox with
no network, a read-only target mount, an empty allowlisted environment, a memory
limit and a wall-clock limit. No Go or Deno toolchain image was available
locally and fetching one is prohibited, so every check that needed `go test` or
`deno test` is recorded as a needs_validation blocker with the exact command an
owner can run; only Node-runnable checks produced local evidence. Two records
also cite the Deno binary on the host printing its own built-in type
declarations (`deno types`), which runs no target code.

No prior run exists for this repository, so every ledger unit started as new
work and nothing was carried over or excluded. Agents spent: 4 reconnaissance,
33 hunters over 10 waves, 12 coverage critics, 40 candidate verifiers and 37
final-record verifiers. Deferred units: 0. Out-of-scope units: 0. This is a
complete standard-profile pass over the ledger below, not a proof that the
target has no other defects.

The audit reads source and writes nothing into the repository. One unrelated
working-tree change made during the same session (a retry loop in the
upload-assets job of `.github/workflows/build.yml`) is not part of the audited
ref; line numbers in records refer to the committed ref where they say so.

## 2. Security posture

The most serious finding is in the laroux SSR server. Its public POST /_rsc
route resolves a visitor-supplied RSC-Action header into a file path with no
containment check and imports it, so an unauthenticated visitor can run the
top-level code of any existing .js file on the host and call its exports with
chosen arguments. The same server keys every client to one shared rate-limit
bucket unless they send a forwarded header, and any client can exempt itself
with a forged loopback address. It also leaks error stacks to the client and
misses two script-context escaping cases.

The daemon (noskills-server) has a coherent single-secret model: bcrypt PIN,
random bearer tokens, per-address login throttling, symlink-safe root
containment for agent file access, a journalled permission ledger, and slug
validation before DataDir joins. The weak spots are where that model is not
carried through. Request-path values other than the slug are joined into
filesystem paths without validation. The noskills git guard is a text classifier
that its own README presents as enforcement.

The posts CLI handles long-lived social-network credentials with less care than
the Go siblings in the same repository. It writes access and refresh tokens to a
world-readable file. It lets a .env in the working directory choose where the
app password and stored tokens are sent. Its OAuth callback receiver accepts the
first request from any peer and never checks state. It prints remote post text
to the terminal with control sequences intact; that last defect lives in the
shared @eserstack/streams renderer, so the renderer fix covers every consumer.

The release pipeline uses OIDC trusted publishing and per-job permissions, but
one job holding a write token installs from the registry without a lockfile.

## 3. Confirmed findings

| Severity | Title                                                                                                                                                                                                             | Affected boundary                                                                                                                                                                                                                                                                                                                                                                                                                                     | Observed result                                                                                                                                                                                                    |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| high     | Unauthenticated RSC-Action header triggers arbitrary local .js module import outside distDir in laroux SSR server                                                                                                 | pkg/@eserstack/laroux-server/runtime/server.ts#RSC-Action module path resolution and distDir/public containment guards                                                                                                                                                                                                                                                                                                                                | Independently reproduced by verifier v31.                                                                                                                                                                          |
| medium   | Release-notes job installs the CLI and its floating npm dependencies from the registry without a lockfile and runs them in a contents: write job                                                                  | action pinning, mise/setup versions, lockfile enforcement                                                                                                                                                                                                                                                                                                                                                                                             | lockfile before install: absent;                                                                                                                                                                                   |
| medium   | laroux rate limiter charges every direct client to one shared "unknown" bucket while any client can exempt itself with a forged X-Forwarded-For                                                                   | pkg/@eserstack/http/middlewares/rate-limiter.ts#getClientIp trustProxy default, skipIps exemption and store key derivation                                                                                                                                                                                                                                                                                                                            | identity: no_headers="unknown", xff_loopback="127.0.0.1", xff_v6_loopback="::1", xff_client_first_then_proxy="203.0.113.9", x_real_ip="198.51.100.7", xff_garbage="unknown", trust_proxy_false_with_xff="unknown"; |
| medium   | Inline RSC emitter interpolates chunk JSON into an executing <script> without </script escaping                                                                                                                   | HTML escaping and </script escaping; <!-- and U+2028 handling                                                                                                                                                                                                                                                                                                                                                                                         | SINK: <script>self.**RSC_CHUNK**({"type":"J","id":5,"value":"</script><img src=x onerror=alert(1)>"})</script> with two </script occurrences (first at index 55, intended closer at 95);                           |
| medium   | laroux RSC error chunks ship the server Error.stack to unauthenticated visitors in /rsc and the SSR payload                                                                                                       | pkg/@eserstack/laroux-server/adapters/react/rsc-flight-renderer.ts#error chunk construction                                                                                                                                                                                                                                                                                                                                                           | Verifier run (exit 0, Node 26, empty env, no network, target read-only).                                                                                                                                           |
| medium   | noskills joins unvalidated session ids into .eser/.state/sessions paths, so a committed session file makes gc delete an arbitrary *.json outside the project                                                      | pkg/@eserstack/noskills/state/persistence.ts#session id in the .eser/.state/sessions file path                                                                                                                                                                                                                                                                                                                                                        | plain `git add -A` stages the session file: false;                                                                                                                                                                 |
| medium   | A .env in the working directory redirects the posts CLI's credentials and token store                                                                                                                             | pkg/@eserstack/posts/adapters/cli/wiring.ts#createAppContext passing those values unvalidated into FileTokenStore(cfg.tokenStorePath), TwitterClient({baseUrl}) and BlueskyClient({serviceUrl}), with pkg/@eserstack/config/dotenv/loader.ts#load baseDir '.' and no key allowlist as the only upstream filter                                                                                                                                        | Run 1: the real createAppContext produced cfg.bluesky.pdsHost=http://127.0.0.1:18081/evil-pds, cfg.twitter.apiBaseUrl=http://127.0.0.1:18081/evil-x and cfg.tokenStorePath=./leaked/tokens.json.                   |
| medium   | eser posts stores Twitter and Bluesky OAuth access and refresh tokens in a world-readable tokens.json                                                                                                             | pkg/@eserstack/posts/adapters/token-store/file-token-store.ts#writeStore (84-89) ensureDir plus writeTextFile with no file mode, no chmod and no umask handling, and resolveTokenPath (28-36) home-directory derivation                                                                                                                                                                                                                               | umask: 22 uid: 0;                                                                                                                                                                                                  |
| low      | PreToolUse git guard classifies `git config --local                                                                                                                                                               | --global                                                                                                                                                                                                                                                                                                                                                                                                                                              | --system <key> <value>` as a read, so configuration writes are not denied                                                                                                                                          |
| low      | Token-bearing noskills-web dashboard executes cdnjs-hosted xterm scripts without integrity or CSP                                                                                                                 | pkg/@eserstack/noskills-web/templates/layout.ts#script tag integrity and origin policy                                                                                                                                                                                                                                                                                                                                                                | Exit 0 on Node v26.7.0 (env keys: HOME, NODE_OPTIONS, NODE_VERSION, PATH, PWD, TMPDIR).                                                                                                                            |
| low      | PreToolUse git guard decides on the literal spelling of the Bash text and misses git writes that reach the binary through case variants, shell quoting, stdin scripts, script files, task runners or interpreters | pkg/@eserstack/noskills/commands/invoke-hook.ts#phase gate and tool/file-path matching producing permissionDecision                                                                                                                                                                                                                                                                                                                                   | Controls: DENY:write, DENY:write, DENY:bypass, DENY:write, ALLOW.                                                                                                                                                  |
| low      | posts TUI OAuth callback receiver accepts the first request carrying ?code= from any reachable peer and never compares state, so a peer can terminate the operator's pending Twitter login                        | pkg/@eserstack/posts/adapters/tui/callback-server.ts#listener bind address and first-request-wins acceptance (Deno.serve at 64-66 with port only and no hostname; http server.listen(port) at 136 on the node/bun path), together with pkg/@eserstack/posts/adapters/twitter/auth-provider.ts#state generated at line 80 and placed in the authorization URL at 88 but never returned by getAuthorizationUrl (76-96) and never compared by any caller | node v26.7.0.                                                                                                                                                                                                      |
| low      | Remote social post text reaches the operator's terminal with ESC/CSI/OSC and control bytes intact in `eser posts` timeline, search, bookmarks and the TUI feed                                                    | pkg/@eserstack/streams/renderers/ansi.ts#ansi().render span serialization, which concatenates raw text with no ESC/CSI/OSC or control-character filtering (only a trailing RESET when the output already contains ESC, lines 160-167)                                                                                                                                                                                                                 | Exit 0.                                                                                                                                                                                                            |

### Unauthenticated RSC-Action header triggers arbitrary local .js module import outside distDir in laroux SSR server

Fingerprint:
`laroux-server/runtime/server/rsc-action-import-no-distdir-containment`.
Severity: high (likelihood high, impact high). Confidence: high.

The laroux SSR server dispatches React 19 server actions on POST /_rsc by
reading the visitor-supplied RSC-Action header, splitting it on '#' into
modulePath and exportName, resolving modulePath against config.distDir/server
with runtime.path.resolve, and dynamically importing the resulting file:// URL.
Unlike the two sibling static-file handlers in the same file (serveStatic:208,
servePublicAsset:265), the RSC-Action path performs no containment check on the
resolved path and consults no action whitelist. An unauthenticated visitor can
therefore supply a modulePath containing '../' sequences to escape
distDir/server and cause import() of any existing .js file on the host
filesystem; importing runs the module's top-level code, after which the server
invokes the named (or default) export with attacker-controlled JSON arguments
(args = await req.json()) spread into actionFn(...args). The .js suffix appended
by the handler limits the primitive to importing files that already end in .js,
so it is arbitrary-module execution rather than arbitrary-content injection
unless a writable or gadget .js exists.

Lower-trust principal and source location: actionId =
req.headers.get('RSC-Action'); no authentication gate precedes this route
(laroux SSR server has no auth middleware; rate limiter default 100/min does not
block a single request; middleware proxies and apiHandler do not intercept
/_rsc). (`pkg/@eserstack/laroux-server/runtime/server.ts:374`). Sink:
`pkg/@eserstack/laroux-server/runtime/server.ts:415`.

Root cause: server.ts:406-415 resolves an attacker-controlled header value into
a filesystem path and passes it to dynamic import() with no post-resolution
startsWith(distDir/server) containment check and no whitelist of registered
action ids. The deprecated action-registry (domain/action-registry.ts,
@deprecated at line 6, invokeAction/registerAction) is never referenced by this
route. runtime.path.resolve is bound to Deno @std/path resolve
(adapters/deno.ts:330), which normalizes '..', so '../' in the header escapes
the intended directory. The identical, guard-free logic is present in the
published bundle (dist/chunks/server-*.js).

Conditions:

- authentication_level: None. /_rsc has no auth middleware; it is the public
  server-action endpoint of the SSR site.
- network_routing: Attacker can send a POST request to /_rsc reachable on the
  laroux server.
- data_state: A .js file must already exist at the traversed path for import()
  to succeed (the handler appends '.js'); the host filesystem contains
  importable .js (the app's own dist/server bundle, node_modules). Escalation to
  arbitrary command execution additionally requires either an attacker-writable
  .js path or an existing gadget module whose exported function performs a
  dangerous action with the supplied args.
- environmental_dependency: Production runtime is Deno with runtime.path bound
  to @std/path (resolve normalizes '..') and Deno compile --allow-all (import of
  any file path permitted). The bounded confirmation used Node 26, whose
  path.resolve '..'-normalization and ESM top-level-execution semantics match
  Deno @std/path + Deno import() for an absolute base path.

Bounded reproduction: In the parent-approved Apple container sandbox
(node:26-bookworm, --network none, target read-only, /scratch rw, -m 512M -c 1,
ulimits fsize=52428800/nofile=256/nproc=64, empty --env-file, timeout 120),
create /scratch/distDir/server/legit.js (baseline, inside distDir) and an
out-of-tree /scratch/outside/evil.js that prints a marker at top level and
exports pwn(...args) and default(...args). Run an independent harness
replicating server.ts:393-432: split RSC-Action on '#', actionModulePath =
path.resolve(DISTDIR,'server',`${modulePath}.js`) with NO containment check,
import(pathToFileURL(actionModulePath)), then invoke the resolved export with
attacker args. Call with modulePath='legit' (baseline) and
modulePath='../../outside/evil' (attack) for both '#pwn' and '#default', passing
attacker args ["a","b",{"x":1}]. Command: container run --rm -m 512M -c 1
--network none --ulimit fsize=52428800 --ulimit nofile=256 --ulimit nproc=64
--env-file .../tools/sbx-env --mount
type=bind,source=<repo>,target=/target,readonly --volume .../scratch:/scratch -w
/target node:26-bookworm timeout 120 sh -c 'DISTDIR=/scratch/distDir node
/scratch/harness.mjs' (scratch output: v31-traversal-poc.txt).

Actual result: Independently reproduced by verifier v31.
serverDir=/scratch/distDir/server. BASELINE 'legit#pwn' resolved to
/scratch/distDir/server/legit.js (insideServerDir: true) and returned
{"from":"legit","args":["a","b",{"x":1}]}. ATTACK '../../outside/evil#pwn'
resolved to /scratch/outside/evil.js (insideServerDir: FALSE); the out-of-tree
module's top-level statement executed (printed
TOPLEVEL_SIDE_EFFECT_EXECUTED_FROM_OUTSIDE_DISTDIR) and its exported pwn
returned {"pwned":true,"receivedArgs":["a","b",{"x":1}]}. ATTACK
'../../outside/evil#default' likewise executed and returned
{"pwned":true,"viaDefault":true,"receivedArgs":["a","b",{"x":1}]}. This proves
the distDir containment escape plus arbitrary-existing-.js module top-level
execution and verbatim attacker-arg delivery, matching the source at
server.ts:406-415/432. Note: Node reproduction is faithful to production because
config.distDir is an absolute path (resolved in startServer, main.ts) and
@std/path resolve matches Node path.resolve for an absolute base; the shipped
dist/chunks/server-*.js contains the same guard-free code.

Impact and priority: An arbitrary existing local .js module is imported
(top-level code executes) and any of its exports is invoked with
attacker-controlled arguments; deterministic escalation to arbitrary command
execution additionally requires a writable or gadget .js on the host (the '.js'
suffix prevents importing arbitrary-content files), so impact is high rather
than critical on source alone. Likelihood: Unauthenticated, single crafted
header on a public SSR endpoint; no user interaction; no auth middleware, rate
limiter default does not block one request, and no whitelist is consulted.

Smallest fix: After resolving actionModulePath, enforce a path-separator-aware
containment check against the resolved distDir/server directory and reject
anything outside it, and constrain the action id to a server-built registry of
known action modules (the actions-manifest.json already enumerates valid action
files). Optionally reject header values containing path separators/'..' before
resolution as defense in depth.

### Release-notes job installs the CLI and its floating npm dependencies from the registry without a lockfile and runs them in a contents: write job

Fingerprint: `build.yml/release-notes/unlocked-npm-install-with-write-token`.
Severity: medium (likelihood low, impact high). Confidence: high.

On every tag release the `release-notes` job (`permissions: contents: write`,
build.yml:856) creates an empty scratch project with a one-line package.json
(:883) and runs `npm install --no-audit --no-fund "eser@$VERSION"` (:885) with
no lockfile, no overrides and no `--ignore-scripts`. The published `eser`
manifest written by npm-build.ts:240-245 declares caret ranges for
@tailwindcss/oxide, koffi, lightningcss and tailwindcss, so npm resolves the
newest matching version of each and of every transitive package at release time
and runs their lifecycle scripts. The job then executes the installed tree
twice: `eser version` (:896) and
`eser codebase gh release-notes --tag v$VERSION --create-if-missing` with
`GH_TOKEN: ${{ github.token }}` (:910-912). A lifecycle script therefore runs on
the release runner where the same token is persisted in the checkout's
.git/config (actions/checkout@v7 at :861-865 without
`persist-credentials: false`) and where it can rewrite node_modules/eser before
the GH_TOKEN-bearing step runs it; the runtime path additionally loads the
resolved koffi in-process (gh.ts:57 -> release-notes.ts:230,284-307 ->
shell.exec -> command.ts:338 -> backend-node.ts:49). A malicious or compromised
release of any package inside those ranges, published before the tag run, thus
executes with a token that can create and edit releases and upload assets of
eser/stack (the authority upload-assets itself uses at :1252/:1266) and push to
any unprotected branch; installers, the self-updater, Homebrew and Nix take
release assets plus same-release SHA256SUMS.txt as their trust root. Every other
job installs with `pnpm install --frozen-lockfile`; the only other lockfile-free
consumer, npm-no-deno-test (:458), runs with `contents: read` (:406). A
lower-differential variant is `"lock": false` in deno.json letting
`jsr:@std/path@^1.1.4` float inside update-nix-hashes. Local sandbox
reproduction with a loopback dummy registry showed npm 11.19.0 (Node 26.7.0) in
this exact consumer shape resolving a caret transitive dependency to the newest
offered version, warning about its install script but running it, the script
reading a dummy persisted checkout credential, and the installed bin loading the
resolved version.

Lower-trust principal and source location:
`npm install --no-audit --no-fund "eser@$VERSION"` runs in a scratch project
created two lines earlier with a one-line package.json and no lockfile;
resolution happens against the live registry at release time, install scripts
are enabled (ignore-scripts=false), and the loop retries up to 12 times.
(`.github/workflows/build.yml:885`). Sink: `.github/workflows/build.yml:910`.

Root cause: build.yml:883-885 resolves `eser@$VERSION` and its dependency graph
from the npm registry into a fresh directory with no package-lock.json and
without --ignore-scripts, and npm-build.ts:240-245 publishes the CLI manifest
with caret ranges instead of exact, lockfile-derived versions; the job doing
this holds `contents: write` (build.yml:856), leaves the token persisted in the
checkout (:861-865), and executes the resolved tree with GH_TOKEN (:910-912).

Conditions:

- third_party_dependency: A malicious or compromised version of
  @tailwindcss/oxide, koffi, lightningcss, tailwindcss, or any transitive
  dependency that satisfies the published ranges must be the newest matching
  version on the npm registry at the time of the tag run.
- timing_dependency: The package must be published before the release-notes job
  resolves; the job runs on every tag push and on post-publish resumes, so the
  window recurs with every release.
- system_configuration: npm on the runner (actions/setup-node node-version "26",
  bundled npm) runs dependency lifecycle scripts by default: npm 11.19.0
  observed locally reports `ignore-scripts=false`, prints an
  `install-scripts ... not yet covered by allowScripts` warning and still
  executes the script. Should a future bundled npm make allowScripts blocking by
  default, the install-script vector closes but the runtime load of the resolved
  modules (koffi via the FFI client) remains.

Bounded reproduction: Create the fixture packages, registry.js, the dummy
workspace/.git/config and check.sh above under the agent scratch directory (the
loopback registry stands in for npmjs.org; no external network is used). Run:
container run --rm -m 512M -c 1 --network none --ulimit fsize=52428800 --ulimit
nofile=256 --ulimit nproc=64 --env-file <audit-run>/tools/sbx-env --mount
type=bind,source=<repo>,target=/target,readonly --volume
<audit-run>/agents/v17-unlocked-npm-install-with-wr/scratch:/scratch -w /target
node:26-bookworm timeout 120 sh /scratch/check.sh Confirm the output shows no
lockfile before the install, fixture-dep resolved to 1.0.5 (newest in range, not
the also-offered 1.0.0), the postinstall marker including the dummy credential
text from .git/config, a lockfile created only by the install itself, and the
installed bin loading fixture-dep 1.0.5.

Actual result: lockfile before install: absent; ignore-scripts config: false;
`npm warn install-scripts 1 package has install scripts not yet covered by allowScripts: fixture-dep@1.0.5 (postinstall: node postinstall.js)`
then the script executed; lockfile after install: present; resolved fixture-dep:
1.0.5; marker: `postinstall executed for fixture-dep@1.0.5`,
`cwd=/scratch/consumer/node_modules/fixture-dep`, `GH_TOKEN in env: no`,
`checkout .git/config: [http "https://github.com/"] | extraheader = AUTHORIZATION: basic DUMMY-CREDENTIAL-MARKER-v17`;
`./node_modules/.bin/fixture-cli` printed
`fixture-cli loaded dep: fixture-dep 1.0.5`; npm 11.19.0, node v26.7.0. Wall
time under 120 s, memory 512M, network none. Not exercised: the hosted runner's
actual npm version and branch-protection state.

Impact and priority: Arbitrary code runs on the release runner with a contents:
write GITHUB_TOKEN (readable from the persisted checkout during install,
exported as GH_TOKEN afterwards): it can create or replace release assets and
SHA256SUMS.txt that install.sh, install.ps1, the self-updater, Homebrew and Nix
accept by same-release TOFU, edit release notes, and push to any unprotected
branch. Likelihood: Requires a malicious or compromised release of one of four
direct npm packages or of a transitive dependency inside the accepted ranges,
timed before a tag run; registry-side compromises of popular front-end and
native-binding packages have occurred but are not routine, and the window recurs
only per release.

Smallest fix: Stop resolving mutable registry content inside the write-token
job. Download the in-run `npm-eser` artifact (already validated by
npm-no-deno-test) and install it with `--ignore-scripts` against a committed
lockfile for the runner consumer, and set `persist-credentials: false` on the
release-notes checkout (only CHANGELOG.md and VERSION are read) so no token
exists on disk during the install. Simpler still: run `gh release create/edit`
from the workflow with notes extracted by a dependency-free
`node --experimental-strip-types` call into the pure parseChangelogText in
release-notes.ts, so no npm package is executed at all. Independently, have
npm-build.ts emit exact versions taken from pnpm-lock.yaml instead of caret
ranges so consumers and CI run the same dependency set. Regression: a workflow
lint (actionlint custom rule or a codebase validator) that fails any `run:` in a
job with write or id-token permissions containing `npm install`/`npx`/`pnpm add`
without a lockfile and `--ignore-scripts`.

### laroux rate limiter charges every direct client to one shared "unknown" bucket while any client can exempt itself with a forged X-Forwarded-For

Fingerprint: `http/rate-limiter/client-identity-headers-only`. Severity: medium
(likelihood high, impact medium). Confidence: high.

The rate limiter that laroux applies to every route except /hmr derives client
identity solely from the X-Forwarded-For and X-Real-IP request headers (trusted
by default) and never from the accepted connection. A client that sends no
forwarded header is keyed as the constant "unknown", so all direct clients of a
laroux server share one 100-requests-per-60 s budget per path. One
unauthenticated client that sends 101 plain requests to a path causes every
other direct client to receive 429 on that path for the rest of the window,
repeatable indefinitely at about two requests per second per path (other paths
stay open, so the denial is per path). The same client removes the limiter from
its own traffic by sending X-Forwarded-For: 127.0.0.1 or ::1 (matching the
default skipIps loopback exemption) or by rotating any syntactically valid
address per request, which also creates one store entry per forged value.
Flipping trustProxy alone would not help: with trustProxy false every client
still collapses into the single "unknown" key, because the socket peer is never
an input. The laroux application cannot correct any of this: startServer never
sets rateLimitConfig and ServerOptions has no field for it, so
createRateLimiter({}) with all defaults runs in every `laroux serve` and
`laroux dev` process, and Deno.serve is given no hostname so the server listens
on all interfaces rather than the configured "localhost".

Lower-trust principal and source location: The handler passed to Deno.serve
(line 780) is declared as (req: Request) only; the second ServeHandlerInfo
argument carrying remoteAddr is never bound, so nothing downstream can see the
accepted connection's address (no remoteAddr or ServeHandlerInfo reference
exists anywhere in laroux-server or http).
(`pkg/@eserstack/laroux-server/runtime/server.ts:306`). Sink:
`pkg/@eserstack/http/middlewares/rate-limiter.ts:257`.

Root cause: getClientIp in pkg/@eserstack/http/middlewares/rate-limiter.ts has
no socket-address input; it trusts client-supplied forwarded headers by default
(trustProxy = true) and otherwise returns a single shared constant "unknown".
pkg/@eserstack/laroux-server/runtime/server.ts registers the handler as (req)
only, discarding the Deno.serve ServeHandlerInfo that carries remoteAddr, and
builds the limiter from an empty config, so the store key is
`${headerIpOrUnknown}:${pathname}` and the skipIps loopback exemption is
evaluated against a requester-chosen string.

Conditions:

- authentication_level: No authentication; any client that can open a TCP
  connection to the laroux port.
- network_routing: Shared-bucket denial affects clients whose requests reach
  laroux without an X-Forwarded-For or X-Real-IP header (direct clients, or a
  proxy that does not add one). Behind a proxy that appends X-Forwarded-For,
  victims are keyed by their own address but the self-exemption still holds
  because the first entry is client-supplied. Reachability from other hosts is
  the default because Deno.serve is not given a hostname and binds all
  interfaces.
- system_configuration: Applies to every `laroux serve` and `laroux dev`
  process; the application has no option to change trustProxy, skipIps or the
  key generator, and changing trustProxy alone would still leave one shared
  "unknown" bucket.

Bounded reproduction: Inside the network-less read-only container
(node:26-bookworm, -m 512M, -c 1, ulimits, empty env, timeout 120), import
createRateLimiter and getClientIp from
file:///target/pkg/@eserstack/http/middlewares/rate-limiter.ts and call
createRateLimiter({}) exactly as laroux-server/runtime/server.ts:303 does. Call
getClientIp on Requests with no headers, X-Forwarded-For: 127.0.0.1,
X-Forwarded-For: ::1, X-Forwarded-For: "203.0.113.9, 10.0.0.1", X-Real-IP:
198.51.100.7, a non-IP X-Forwarded-For, and X-Forwarded-For with
trustProxy=false; record each value. Call check(new
Request('http://laroux.local/'), '/') 101 times with no headers; record each
result's status. Call check with a new header-less Request on '/' once more and
record status and Retry-After; read getHeaders('unknown', '/'); call check on
'/other' to confirm per-path scope. Call check 500 times in the same window with
X-Forwarded-For: 127.0.0.1 and count 429 results. Call check 1000 times with
1000 distinct X-Forwarded-For values, count 429 results and compare
getStoreSize() before and after. As a control, call createRateLimiter({
trustProxy: false }) and check 101 times with 101 distinct X-Forwarded-For
values; count 429 results and read getStoreSize(). Call stop() on both instances
and exit.

Actual result: identity: no_headers="unknown", xff_loopback="127.0.0.1",
xff_v6_loopback="::1", xff_client_first_then_proxy="203.0.113.9",
x_real_ip="198.51.100.7", xff_garbage="unknown",
trust_proxy_false_with_xff="unknown"; attacker_first_100_all_pass=true,
attacker_101st=429; victim header-less first request on "/": status=429,
Retry-After="60", getHeaders("unknown","/") X-RateLimit-Remaining="0"; same
victim on "/other": 200 (per-path scope); spoofed_loopback_429s_in_500=0;
rotating_xff_429s_in_1000=0 and store_entries_added_by_1000_distinct_xff=1000;
control trustProxy=false with 101 distinct XFF values: 1 response of 429 and
store size 1. Process exited 0 in under 2 s inside the sandbox; no server
started, no network.

Impact and priority: Cross-user denial of service: all direct clients of an
affected path receive 429 for up to 60 s per attacker burst, sustainable
indefinitely; scope is per path and per laroux instance (other paths stay open,
as reproduced), there is no persistence, and recovery is automatic when the
attacker stops. The self-exemption additionally removes the only bound in front
of per-request SSR and /rsc rendering work, but that downstream cost is not
quantified here. Likelihood: Unauthenticated, no special network position
required, attacker cost is 101 plain requests per path per minute, and the
behaviour is the default in every laroux serve/dev process with no
application-level switch to change it.

Smallest fix: Make the accepted connection the identity source. In
laroux-server, bind the Deno.serve ServeHandlerInfo and pass info.remoteAddr
into the limiter; also pass config.server.host as hostname so the configured
bind address is honoured. In the limiter, accept a connection address, default
trustProxy to false, and when trustProxy is enabled honour forwarded headers
only if the socket peer is in a trustedProxies allowlist (taking the right-most
untrusted hop, as pkg/ajan/httpfx/client_ip.go does). Never fold unidentified
clients into one shared constant; if no address is available and no key
generator is set, use a per-request key that cannot be shared (or reject).
Evaluate skipIps against the socket address only. Expose the limiter
configuration through ServerOptions so an application can set trusted proxies.
Add regression tests: (a) two Requests with no headers and different remoteAddr
never share a bucket; (b) X-Forwarded-For: 127.0.0.1 from a non-trusted peer is
not exempt; (c) with trustProxy false, X-Forwarded-For does not change the key;
(d) laroux passes remoteAddr into check. Fix the README default to match the
code.

### Inline RSC emitter interpolates chunk JSON into an executing <script> without </script escaping

Fingerprint:
`laroux-server/adapters/react/inline-rsc-emitter/unescaped-json-in-executing-script`.
Severity: medium (likelihood low, impact high). Confidence: medium.

chunkToInlineScript in
pkg/@eserstack/laroux-server/adapters/react/inline-rsc-emitter.ts wraps
JSON.stringify(chunk) directly in <script>self.**RSC_CHUNK**(...)</script>.
JSON.stringify leaves < and / untouched, so any RSC chunk whose value contains
</script closes the script element early and the remainder of the value is
parsed as HTML in the consuming page's origin. Server-component text and string
props become J chunk values verbatim (verified end to end: createInlineRSCStream
on a <div title={s}>{s}</div> tree emits both copies of s raw inside the
executing script), so a page that renders a request- or store-derived string
through createInlineRSCStream emits attacker markup. The helpers are part of the
package's public ./adapters/react export and the shipped client
(laroux-react/client.ts:1581) installs the matching **RSC_CHUNK** consumer, but
no HTTP handler inside laroux-server calls them, so the path is reachable only
for consumers of that API.

Lower-trust principal and source location: A consumer imports
createInlineRSCStream / createInlineTransformStream / chunkToInlineScript and
streams a React tree whose server components render strings taken from the
request or a data store.
(`pkg/@eserstack/laroux-server/adapters/react/mod.ts:57`). Sink:
`pkg/@eserstack/laroux-server/adapters/react/inline-rsc-emitter.ts:44`.

Root cause: inline-rsc-emitter.ts builds an executable script body from JSON
without the script-context escaping (< to \u003c, U+2028/U+2029) that
JSON-in-script embedding requires; the other embedding sites in the package
(ssr-renderer.ts:750, runtime/server.ts:105) at least replace </script, this one
replaces nothing.

Conditions:

- system_configuration: The consuming application must use the exported
  createInlineRSCStream / createInlineTransformStream / chunkToInlineScript API
  to stream RSC chunks into its HTML; laroux-server's own runtime handlers do
  not call it.
- data_state: A server component reached through that stream must render a
  string (text child or string prop) containing </script that an attacker
  controls (route parameter, stored content or similar).
- user_interaction: A victim loads the page that embeds the affected chunk.

Bounded reproduction: Place the harness v11-inline-emitter-check.mjs (promoted
artifact
agents/v11-unescaped-json-in-executing-/artifacts/v11-inline-emitter-check.mjs)
in the agent scratch directory; it dynamically imports
/target/pkg/@eserstack/laroux-server/adapters/react/inline-rsc-emitter.ts, calls
chunkToInlineScript with the payload line, pushes the same line as bytes through
createInlineTransformStream, renders React.createElement('div', {title:
payload}, payload) through createInlineRSCStream, and runs
generateRSCPayloadScript on the same value as a control. Run: container run --rm
-m 512M -c 1 --network none --ulimit fsize=52428800 --ulimit nofile=256 --ulimit
nproc=64 --env-file <audit-run>/tools/sbx-env --mount
type=bind,source=<repo>,target=/target,readonly --volume
<audit-run>/agents/v11-unescaped-json-in-executing-/scratch:/scratch -w /target
node:26-bookworm timeout 120 node --experimental-strip-types
/scratch/v11-inline-emitter-check.mjs Read /scratch/v11-inline-emitter-check.txt
(promoted as
agents/v11-unescaped-json-in-executing-/artifacts/v11-inline-emitter-check.txt)
and inspect the SINK, TRANSFORM, FULL and CONTROL lines.

Actual result: SINK:

<script>self.**RSC_CHUNK**({"type":"J","id":5,"value":"</script><img src=x onerror=alert(1)>"})</script>

with two </script occurrences (first at index 55, intended closer at 95); the
text after the early close is <img src=x onerror=alert(1)>"}). TRANSFORM:
identical output from createInlineTransformStream. FULL: createInlineRSCStream
on a div with the payload as title prop and child emitted

<script>self.**RSC_CHUNK**({"type":"J","id":1,"value":{"title":"</script><img src=x onerror=alert(1)>","children":"</script><img src=x onerror=alert(1)>"}})</script>

followed by the element chunk, two raw </script><img occurrences. CONTROL:
generateRSCPayloadScript emitted <\/script><img ... with exactly one </script.
Node v26.7.0, exit 0, environment limited to HOME, NODE_OPTIONS, NODE_VERSION,
PATH, PWD, TMPDIR.

Impact and priority: Where reached, the result is arbitrary markup and script
execution in the consuming application's origin for every viewer of the affected
page (stored or reflected XSS). Likelihood: No request handler in the repository
reaches the emitter; exploitation needs a consumer that adopts the exported
inline streaming API (whose documented purpose is embedding in the HTML stream,
and whose client counterpart ships in laroux-react) and renders
attacker-controlled strings through it.

Smallest fix: Escape the JSON for script context before interpolation (replace <

> & with \u003c \u003e \u0026 and U+2028/U+2029 with their escapes); the result
> is still a valid JS object literal, so the client's **RSC_CHUNK** handler is
> unchanged. Escaping < also neutralizes <!-- inside the value. Add a regression
> test asserting chunkToInlineScript('J5:"</script><b>"') contains exactly one
> </script sequence (its own closing tag) and that createInlineRSCStream on an
> element with a </script string child produces the same property.

### laroux RSC error chunks ship the server Error.stack to unauthenticated visitors in /rsc and the SSR payload

Fingerprint: `laroux-server/react/error-chunk-stack-to-client`. Severity: medium
(likelihood medium, impact medium). Confidence: high.

When any server component (function, async, or forwardRef) throws or rejects
during render, the laroux React adapter emits an RSC 'E' chunk whose value is
{message: error.message, stack: error.stack}. The chunk is streamed verbatim to
the requester of GET /rsc?pathname=... (registered unconditionally in every
mode, with Access-Control-Allow-Origin: *) and, under the default ssr config
(mode 'always', streamMode 'streaming-optimal'), embedded in the page's

<script id="__RSC_PAYLOAD__"> block. The stack discloses absolute server
filesystem paths, the framework's file names and line numbers, internal call
frames and the raw exception message to anyone who can make a page or /rsc
request. The server's top-level catch deliberately returns a fixed 'Internal
Server Error' body ('Don't expose error details to client'), and the two outer
render catches send message only; the per-component chunk path bypasses all of
them.

Lower-trust principal and source location: Unauthenticated GET /rsc, registered
without any mode or auth gate; pathname and locale are taken from the query
string (lines 465-467) and passed to getApp, which resolves the page component
and dynamic params for the visitor-chosen route (main.ts:182-214, unmatched
routes map to NotFound). (`pkg/@eserstack/laroux-server/runtime/server.ts:461`).
Sink: `pkg/@eserstack/laroux-server/adapters/react/rsc-handler.ts:118`.

Root cause: rsc-flight-renderer.ts (lines 188-192 forwardRef, 231-235 async
rejection, 249-253 sync throw) and ssr-renderer.ts (lines 331-339 forwardRef,
430-438 server component) copy error.stack into the E chunk value
unconditionally. serializeChunk (protocol.ts:66-69),
serializeRSCPayload/generateRSCPayloadScript (ssr-renderer.ts:737-752) and the
inline embedding in createStreamingOptimalResponse (runtime/server.ts:88-108)
are plain JSON.stringify with only a __rsc_pending filter; no mode, environment,
redaction or generic-message substitution exists between the catch and the HTTP
response.

Conditions:

- authentication_level: None. GET /rsc and page routes are served to any client
  that can reach the laroux HTTP server; /rsc additionally sends
  Access-Control-Allow-Origin: *.
- data_state: A server component (layout, page, forwardRef, or async component)
  must throw or reject while rendering the visitor's request. Visitor-controlled
  pathname, dynamic route params, cookies, host header and locale reach the
  component, so a route that fails on unexpected input is enough.
- system_configuration: Default laroux config (ssr.mode 'always',
  streaming-optimal) exposes the stack in the HTML page; /rsc exposes it in
  every configuration including serve mode, with no dev-only gate.

Bounded reproduction: Place the harness v21-error-chunk-check.mjs (promoted
artifact) in the agent scratch directory. Run inside the parent-approved
sandbox: container run --rm -m 512M -c 1 --network none --ulimit fsize=52428800
--ulimit nofile=256 --ulimit nproc=64 --env-file <audit-run>/tools/sbx-env
--mount type=bind,source=<repo>,target=/target,readonly --volume
<audit-run>/agents/v21-error-chunk-stack-to-client/scratch:/scratch -w /target
node:26-bookworm timeout 120 node --experimental-strip-types
/scratch/v21-error-chunk-check.mjs Read /scratch/v21-error-chunk-check.txt:
every E line in the flight wire output and the **RSC_PAYLOAD** block should
contain a "stack" field with absolute file:///scratch/ and file:///target/
paths.

Actual result: Verifier run (exit 0, Node 26, empty env, no network, target
read-only). FLIGHT: wireBytes=2430, 3 E lines. E2 (sync throw):
stackPresent=true, 11 lines, 'at BoomSync
(file:///scratch/v21-error-chunk-check.mjs:15:29)', 'at renderElement
(file:///target/pkg/@eserstack/laroux-server/adapters/react/rsc-flight-renderer.ts:211:24)'.
E4 (forwardRef): stackPresent=true, 11 lines, 'at renderElement
(file:///target/pkg/@eserstack/laroux-server/adapters/react/rsc-flight-renderer.ts:183:29)'.
E3 (async rejection): stackPresent=true, 2 lines, harness path. SSR
(streaming-classic, as createStreamingOptimalResponse calls it): html
'<main></main>', 3 chunks, 1 E chunk with a 7-line stack including 'at
preprocessTree
(file:///target/pkg/@eserstack/laroux-server/adapters/react/ssr-renderer.ts:363:24)';
the reconstructed **RSC_PAYLOAD** block has payloadBlockHasStackKey=true,
payloadBlockHasScratchPath=true, payloadBlockHasTargetPath=true and begins
'<script id="__RSC_PAYLOAD__" type="application/json">[{"type":"J","id":0,"value":"$2"},{"type":"E","id":1,"value":{"message":"v21
dummy failure: ...","stack":"Error: v21 dummy failure: ...\n at BoomSync
(file:///scratch/v21-error-c'. This independently matches the hunter's
observation
(agents/w2-laroux-disclosure/artifacts/rsc-error-chunk-stack-check.txt).
Execution stopped at this minimum observation.

Impact and priority: Information disclosure only: absolute server filesystem
paths, dist/server module layout, framework file names with line numbers,
internal frames, and the raw exception message (which can carry hostnames or
connection detail from downstream libraries). It aids further attacks and
contradicts the server's stated policy but does not by itself grant access or
execution. Likelihood: No authentication and no special configuration are
needed; the visitor chooses the route and supplies params, cookies, host and
locale that reach the server component, and any uncaught exception in that
render (a common condition in production apps) triggers the disclosure. /rsc is
registered in serve mode and the default ssr config embeds the same chunks in
every page. It still requires a component that actually fails on visitor input,
which the attacker cannot guarantee.

Smallest fix: Stop copying error.stack into E chunk values; keep the full error
in the existing server-side logger calls. Route all five catch sites through one
helper that returns a client-safe value (message only, or a generic message with
a correlation id when not in dev mode). This matches the two outer catches that
already send message only and requires no protocol change because stack is
optional in RSCChunk. Add a regression test that renders a throwing server
component and asserts the wire output and rscPayload contain no "stack" key and
no file:// path.

### noskills joins unvalidated session ids into .eser/.state/sessions paths, so a committed session file makes gc delete an arbitrary *.json outside the project

Fingerprint: `noskills/persistence/session-id-path-join`. Severity: medium
(likelihood low, impact medium). Confidence: high.

pkg/@eserstack/noskills/state/persistence.ts builds every session file path as
`${root}/.eser/.state/sessions/${sessionId}.json` with no check on the id.
listSessions returns the `id` field parsed from each `*.json` in that directory
rather than the file name, and gcStaleSessions deletes stale entries by that
embedded id. A repository that adopts noskills commits `.eser/` (manifest,
gitignore); an author of such a repository can also commit
`.eser/.state/sessions/<any>.json` containing `"id": "../../../../victim"` and
an old `lastActiveAt` (the scaffolded `.eser/.gitignore` only stops a plain
`git add -A`; `git add -f` commits it and every clone checks it out with the
.gitignore intact). When an operator runs `noskills manager` in that checkout
and quits (commands/manager.ts:300) or runs `noskills session gc`
(commands/session.ts:287), the CLI removes
`<four levels above the project>/victim.json`. Because gc deletes by the
embedded id, the malicious file itself is never removed and fires on every
subsequent gc. The same join serves readSession and updateSessionPhase, so a
traversing NOSKILLS_SESSION value reads and rewrites any parseable JSON file
(adding `phase` and `lastActiveAt`); that entry is reachable only by principals
that already own the process environment (the bearer-token holder can set
pane.meta.sessionId, but can also open a `$SHELL` pane), so the boundary
crossing is the repository-content one. Verified by an independent sandboxed run
against the unmodified module.

Lower-trust principal and source location: Reads every `*.json` under
`<root>/.eser/.state/sessions/` and JSON-parses it as a Session (push at line
858); the `id` field comes from repository content, which a cloned third-party
project can carry as a tracked file regardless of the scaffolded
.eser/.gitignore. (`pkg/@eserstack/noskills/state/persistence.ts:845`). Sink:
`pkg/@eserstack/noskills/state/persistence.ts:876`.

Root cause: persistence.ts has no session-id validation and no binding between a
session file's name and its `id`: createSession:826, readSession:837,
deleteSession:876 and updateSessionPhase:897 interpolate the id straight into
the path, listSessions:858 pushes the parsed file content as the Session, and
gcStaleSessions:912 deletes by the `id` taken from repository-controlled file
content rather than by the file it read. The Go twin
(pkg/ajan/noskillsfx/session.go:188-207 with persistence.go:106
`filepath.Join(p.SessionsDir, sessionID+".json")`) shares the pattern but has no
caller today.

Conditions:

- data_state: The project checkout contains `.eser/` (so root resolution selects
  it) and `.eser/.state/sessions/<name>.json` whose `id` holds `..` segments and
  whose lastActiveAt is more than two hours old; a repository author commits
  this file with `git add -f` (or without the scaffolded .eser/.gitignore), and
  it is checked out in every clone.
- user_interaction: The operator runs `noskills manager` (and quits) or
  `noskills session gc` with that checkout as the project root; for the rewrite
  variant, a process in that checkout runs `noskills next` with a crafted
  NOSKILLS_SESSION, which only a principal that already controls the environment
  can set.
- environmental_dependency: The target file must end in `.json` and be deletable
  (for the rewrite variant, parseable as JSON and writable) by the operator; the
  path is relative to `<root>/.eser/.state/sessions/`, so the attacker must
  guess the checkout's depth relative to the target (for example four levels up
  reaches the parent of `~/projects/<org>/<repo>` layouts).

Bounded reproduction: In the sandbox scratch mount, build an author repository
`/scratch/v29/author` with the scaffolded `.eser/.gitignore` (`.state/`),
`.eser/manifest.yml`, and `.eser/.state/sessions/evil.json` holding the payload
above; `git add -f` the session file and commit; `git clone` it by local path to
`/scratch/v29/clone`; create the decoy `/scratch/v29/victim.json`
(`{"keep":true}`), which is where
`clone/.eser/.state/sessions/../../../../victim.json` resolves. Run, with no
network and the repository mounted read-only:
`container run --rm -m 512M -c 1 --network none --ulimit fsize=52428800 --ulimit nofile=256 --ulimit nproc=64 --env-file tools/sbx-env --mount type=bind,source=<repo>,target=/target,readonly --volume <scratch>:/scratch -w /target node:26-bookworm timeout 120 node --experimental-strip-types /scratch/v29-session-gc.mjs`;
the harness imports `/target/pkg/@eserstack/noskills/state/persistence.ts`
unmodified and calls `gcStaleSessions('/scratch/v29/clone')`, then
`readSession(clone,'../../../../victim2')` and
`updateSessionPhase(clone,'../../../../victim2','EXECUTING')` against a second
decoy. Owner equivalent without the container: clone a throwaway repository that
tracks the same session file, run `noskills session gc` (or `noskills manager`
and quit) inside the clone, and observe the file four levels above the sessions
directory named `victim.json` disappear while `.eser/.state/sessions/evil.json`
remains.

Actual result: plain `git add -A` stages the session file: false; author tracked
files: .eser/.gitignore, .eser/.state/sessions/evil.json, .eser/manifest.yml;
clone has .eser/.state/sessions/evil.json: true with `.state/` still in the
clone's .eser/.gitignore; traversing id resolves to /scratch/v29/victim.json
(outside clone: true); before gc: victim exists=true; gcStaleSessions(clone)
removed=["../../../../victim"]; after gc: victim exists=false ; evil.json still
present=true; readSession(clone,'../../../../victim2') -> {"keep":true}; victim2
after updateSessionPhase: { "keep": true, "phase": "EXECUTING", "lastActiveAt":
"2026-09-19T07:16:43.947Z" }; generateSessionId sample=db912b5c. Container
exit 0.

Impact and priority: Deletes any `*.json` the operator can delete, chosen by
relative traversal from the project root (for example `~/.claude.json` or a
sibling project's package.json), silently, without a trust prompt, and
repeatedly because the crafted file survives gc; the same join lets a crafted
NOSKILLS_SESSION rewrite JSON files, but only for a principal that already
controls the environment. No code execution and no read of secrets beyond JSON
files the process can already read. Likelihood: Needs the operator to open a
repository that ships a crafted, force-committed `.eser/.state/sessions/*.json`
and then quit the noskills TUI manager or run `noskills session gc` there; no
authentication or network step is involved and no prompt intervenes, but the
trigger is an ordinary local workflow on untrusted repository content and the
attacker must guess the checkout depth relative to the target.

Smallest fix: Validate the session id once, in persistence.ts, before it becomes
a path component, and make garbage collection delete the file it read rather
than a path named inside it. Reject anything outside a short safe alphabet; the
ids the code generates are 8 hex characters, and the daemon sid also passes
through here, so `^[A-Za-z0-9_-]{1,64}$` keeps both working while excluding `/`,
`\`, `.` and NUL. In listSessions derive the id from the file name and skip
files whose embedded id disagrees. Mirror the same check in pkg/ajan/noskillsfx
(SessionFile at persistence.go:106 and GcStaleSessions at session.go:188-207),
which shares the pattern even though nothing calls it yet.

### A .env in the working directory redirects the posts CLI's credentials and token store

Fingerprint: `posts/config/cwd-dotenv-endpoint-and-token-path`. Severity: medium
(likelihood low, impact high). Confidence: high.

`eser posts` loads configuration from `.env`, `.env.<env>`, `.env.local` and
`.env.<env>.local` in the process working directory, with no key allowlist. The
values TWITTER_API_BASE_URL, BLUESKY_PDS_HOST and POSTS_TOKEN_STORE_PATH go
unvalidated into the Twitter and Bluesky HTTP clients and the FileTokenStore. As
a result, the content of whatever directory the operator runs `eser posts` in
chooses three things: (a) the host that receives the operator's Bluesky handle
and app password on `login`; (b) the host that receives the Twitter and Bluesky
bearer tokens the operator stored in <home>/.eser/posts/tokens.json, sent on
every token-bearing subcommand (`timeline`, `compose`, ...); (c) where new
access and refresh tokens are written, including a relative path inside the
checkout. Plain http:// and loopback hosts are accepted. Nothing reports which
.env files were loaded and nothing asks for confirmation. The shipped `eser`
binary runs with --allow-all, so no Deno permission prompt intervenes either.
The trust boundary crossed: the stored tokens belong to the operator's home
directory and are valid for any working directory, but a file in the working
directory, which is repository content, decides where they are sent.

Lower-trust principal and source location: baseDir defaults to '.', the process
working directory. Lines 151-173 read .env, .env.<envName>, .env.local (skipped
only for envName 'test') and .env.<envName>.local from it. envImport (144-148)
copies every parsed key with no allowlist. Process env is imported last
(175-177), so it overrides only the keys the operator has actually set.
(`pkg/@eserstack/config/dotenv/loader.ts:127`). Sink:
`pkg/@eserstack/posts/adapters/token-store/file-token-store.ts:87`.

Root cause: pkg/@eserstack/config/dotenv/loader.ts load() defaults baseDir to
'.' and imports every key from the cwd-local .env files.
pkg/@eserstack/posts/config.ts loadPostsConfig() calls dotenv.configure() with
no options and reads TWITTER_API_BASE_URL, BLUESKY_PDS_HOST and
POSTS_TOKEN_STORE_PATH as raw strings.
pkg/@eserstack/posts/adapters/cli/wiring.ts createAppContext() passes them
without validation into TwitterClient({baseUrl}), BlueskyClient({serviceUrl})
and FileTokenStore(tokenPath). httpclient resolveUrl only concatenates base and
path.

Conditions:

- user_interaction: The operator, or an agent acting as the operator, runs an
  `eser posts` subcommand (or the posts TUI) with the working directory set to a
  directory whose .env / .env.development / .env.local / .env.development.local
  an attacker controls, for example a cloned third-party repository.
- system_configuration: The operator has not set TWITTER_API_BASE_URL,
  BLUESKY_PDS_HOST or POSTS_TOKEN_STORE_PATH in the process environment. Process
  env overrides file values, but a normal installation sets none of them.
- data_state: Bearer-token disclosure requires that the operator has logged in
  before, so <home>/.eser/posts/tokens.json holds tokens, and that the hostile
  .env leaves POSTS_TOKEN_STORE_PATH unset so the home store is read.
  App-password disclosure requires that the operator runs Bluesky login
  (`eser posts login --platform=bluesky ...` or the TUI login).

Bounded reproduction: Inside the approved sandbox (container run --rm -m 512M -c
1 --network none --ulimit fsize=52428800 --ulimit nofile=256 --ulimit nproc=64
--env-file .../tools/sbx-env, target bind-mounted read-only at /target, only
agents/v39-posts-cwd-dotenv/scratch mounted at /scratch, node:26-bookworm,
timeout 120), run
`node --no-warnings --import /scratch/register.mjs /scratch/v39.mjs`.
register.mjs/hooks.mjs is only a resolve hook that falls back to
/target/node_modules/.pnpm/node_modules for bare @eserstack/@std specifiers.
v39.mjs starts a loopback-only fixture on 127.0.0.1:18081, writes the first
payload into /scratch/work/repo/.env and .env.local, and chdirs there. It then
imports the REAL composition root
/target/pkg/@eserstack/posts/adapters/cli/wiring.ts, calls createAppContext(),
calls ctx.auths.get('bluesky').loginWithCredentials with dummy credentials, and
saves the result through ctx.tokenStore.save, the same sequence as
login.ts:74-79. Run
`node --no-warnings --import /scratch/register.mjs /scratch/v39b.mjs`. It seeds
dummy tokens at the default home token store
(/scratch/home/.eser/posts/tokens.json, HOME=/scratch/home), writes the second
payload into /scratch/work/repo2/.env, chdirs there, and runs the real
`task.runTask(ctx.cliTriggers.getTimeline({platform}))` for twitter and bluesky,
the path used by `eser posts timeline` (timeline.ts:40). Inspect the fixture's
recorded requests and the token file.

Actual result: Run 1: the real createAppContext produced
cfg.bluesky.pdsHost=http://127.0.0.1:18081/evil-pds,
cfg.twitter.apiBaseUrl=http://127.0.0.1:18081/evil-x and
cfg.tokenStorePath=./leaked/tokens.json. The fixture received POST
/evil-pds/xrpc/com.atproto.server.createSession with body
{"identifier":"v39.example","password":"V39-DUMMY-APP-PASSWORD"}.
/scratch/work/repo/leaked/tokens.json was created with accessToken
V39-DUMMY-ACCESS and refreshToken V39-DUMMY-REFRESH. Run 2: with
cfg.tokenStorePath undefined (home store), the timeline triggers sent GET
/evil-x/users/me?... with `Authorization: Bearer V39-HOME-X-ACCESS` and GET
/evil-pds/xrpc/app.bsky.feed.getTimeline?limit=5 with
`Authorization: Bearer V39-HOME-BSKY-ACCESS`, so the home-stored tokens reached
the host named in the cwd .env.

Impact and priority: Reproduced through the real composition root: the Bluesky
app password (a full-account credential), and the Twitter and Bluesky access
tokens stored in the operator's home, are sent in plaintext to a host chosen by
repository content, over http if requested. Newly issued access and refresh
tokens can be written into the checkout, where they can be committed or read by
tooling that scans the tree. Likelihood: The attacker cannot trigger this. The
operator has to run the social-posting subcommand while their cwd is inside an
attacker-controlled tree, and posts has no project-scoped reason to be run
inside a checkout. Mitigating that: `eser` is a global CLI whose sibling
commands are run in checkouts, agents may run it there, .env files are rarely
inspected, and there is no loaded-file notice, trust prompt or permission
prompt. Process env overrides only keys the operator has set explicitly.
Operator choice of cwd does not remove the boundary. The tokens are home-scoped
secrets, and comparable tools refuse this pattern (git ignores repo-local
credential routing, npm binds auth tokens to the registry host). But the
precondition makes exploitation uncommon.

Smallest fix: Stop reading credential-routing keys from the working directory.
Load the posts .env files from the operator's config directory
(<home>/.eser/posts/) instead of '.', or keep cwd loading only for non-sensitive
keys. Separately, validate the three values at the composition root: require an
absolute https:// URL for TWITTER_API_BASE_URL and BLUESKY_PDS_HOST (allow
http/loopback only behind an explicit developer flag from the process env), and
require POSTS_TOKEN_STORE_PATH to be absolute after '~~/' expansion. Print which
.env files were loaded and the resolved token path. Fix the committed
pkg/@eserstack/posts/.env, which relies on '~~' expansion that does not exist.

### eser posts stores Twitter and Bluesky OAuth access and refresh tokens in a world-readable tokens.json

Fingerprint: `posts/file-token-store/world-readable-mode`. Severity: medium
(likelihood low, impact high). Confidence: high.

FileTokenStore.save writes <home>/.eser/posts/tokens.json with the runtime
default file mode (0o666 masked by umask) and creates .eser and .eser/posts with
the default directory mode (0o777 masked by umask). Under the common umask 022
the file is 0644 and the directories 0755, so any other local OS account or
other-uid process on the same host that can traverse the user's home directory
can read the plaintext Twitter OAuth 2.0 access and refresh tokens (scopes
tweet.read, tweet.write, users.read, bookmark.write, offline.access) and the
Bluesky session and refresh JWTs obtained from the account app password. The
daemon's auth.json and the Go postsfx token store in the same repository write
the equivalent secrets with 0700 directories and 0600 files, so this store is
the one credential writer without the owner-only policy. Independently
reproduced in the sandbox: the real store under Node 26 with umask 022 produced
755/755/644 and a uid 65534 process read both dummy token pairs.

Lower-trust principal and source location: After auth.loginWithCredentials
returns the platform session (Bluesky accessJwt and refreshJwt, or Twitter
access and refresh tokens from the TUI OAuth flow at adapters/tui/menu.ts:351
and the refresh path at application/with-fresh-tokens.ts:83), the command calls
tokenStore.save(p, tokens).
(`pkg/@eserstack/posts/adapters/cli/commands/login.ts:79`). Sink:
`pkg/@eserstack/posts/adapters/token-store/file-token-store.ts:87`.

Root cause: writeStore in
pkg/@eserstack/posts/adapters/token-store/file-token-store.ts (lines 79-91)
calls runtime.fs.ensureDir(dir) and runtime.fs.writeTextFile(tokenPath, json)
with no mode option, never chmods the result, and does not write through a temp
file plus rename. Both cross-runtime adapters forward mode: undefined to Node
fs.promises.writeFile (node-shared.ts:113) and Deno.writeTextFile (deno.ts:120),
and ensureDir is a bare recursive mkdir in both (node-shared.ts:153,
deno.ts:171), so the OS default permissions apply.

Conditions:

- authentication_level: Attacker is any other local OS account, or any process
  running under a different uid (service accounts, sandboxed helpers), on the
  same host as the logged-in user; no eser credential or privilege is needed.
- system_configuration: POSIX host where the process umask is the common 022 and
  the user's home directory is traversable by the attacker's uid. On the audited
  macOS 27 host the home is drwxr-x--- owner:staff (750) with umask 022: every
  local user account is in staff, so other local accounts can traverse and read
  the 644 file, while non-staff service uids cannot. Older macOS and many Linux
  distributions create 755 homes (fully exposed); several newer Linux
  distributions create 750 or 700 homes, which blocks the read.
- data_state: The user has run eser posts login or the TUI login flow at least
  once so tokens.json exists; POSTS_TOKEN_STORE_PATH unset or pointing at an
  equally exposed location.
- environmental_dependency: On Windows the mode option is ignored by both
  runtimes and the file inherits the profile ACL, so the finding is
  POSIX-specific; the Deno runtime path was established from source only
  (deno.ts:120, 171), not executed, because no Deno image exists in the sandbox.

Bounded reproduction: Place v36-check-mode.mjs in the agent scratch directory
(contents described in payloads; no target file is modified; the store's
@eserstack/standards import resolves through the existing
pkg/@eserstack/posts/node_modules workspace symlink, no install). container run
--rm -m 512M -c 1 --network none --ulimit fsize=52428800 --ulimit nofile=256
--ulimit nproc=64 --env-file <audit-run>/tools/sbx-env --mount
type=bind,source=<repo>,target=/target,readonly --volume
<audit-run>/agents/v36-posts-token-store-mode/scratch:/scratch -w /target
node:26-bookworm timeout 120 sh -c 'umask 022; node --experimental-strip-types
/scratch/v36-check-mode.mjs 2>&1 | tee /scratch/v36-check-mode.txt; rm -rf
/scratch/.eser' Environment inside the sandbox is only the env-file allowlist:
PATH=/usr/local/bin:/usr/bin:/bin, HOME=/scratch, TMPDIR=/scratch,
NODE_OPTIONS=--max-old-space-size=256. Read the file modes and the output of the
nobody-uid read from v36-check-mode.txt; the dummy .eser tree under scratch was
removed in the same command.

Actual result: umask: 22 uid: 0; /scratch/.eser mode 755 uid 0;
/scratch/.eser/posts mode 755 uid 0; /scratch/.eser/posts/tokens.json mode 644
uid 0; su as nobody exited 0 and printed 65534 followed by the complete JSON
containing DUMMY-ACCESS-TOKEN-V36, DUMMY-REFRESH-TOKEN-V36,
DUMMY-BSKY-ACCESS-V36 and DUMMY-BSKY-REFRESH-V36. This independently matches the
hunter's promoted artifact agents/w9-posts-token-store/artifacts/check-mode.txt
(755/755/644, uid 65534 read succeeded).

Impact and priority: Plaintext long-lived refresh credentials (Twitter
offline.access with tweet.write and bookmark.write; Bluesky refresh JWT for the
whole account) let the reader post and act as the victim until revoked.
Likelihood: Requires a second uid on the same host that can traverse the
victim's home directory; single-user machines with a 700 home are not exposed,
but shared workstations, CI or dev boxes, Linux hosts with 755 homes, and macOS
hosts (home 750 with group staff, which every local account belongs to) are.

Smallest fix: Create the token directory 0700 and the token file 0600
independent of umask, chmod the existing directory and file so already-created
0755/0644 stores are repaired on the next save, and write through a temp file
plus rename so a crash cannot leave a truncated or partially written store. All
primitives (mkdir with mode, chmod, rename, writeTextFile with mode) already
exist on the cross-runtime fs interface. Regression test (deno test or node):
after save() with umask 022, stat(dir).mode & 0o777 === 0o700 and
stat(file).mode & 0o777 === 0o600, and a pre-existing 0644 file becomes 0600
after save(). Consider the same owner-only treatment for clear(), which rewrites
the file through writeStore.

### PreToolUse git guard classifies `git config --local|--global|--system <key> <value>` as a read, so configuration writes are not denied

Fingerprint: `agents/guards/git/config-scope-flags-allowlisted`. Severity: low
(likelihood low, impact low). Confidence: high.

The noskills PreToolUse hook is the mechanical layer of the documented rule that
git is read-only for agents (README: git write operations are the CLI's
responsibility, never the agent's; enforced by behavioral rules, AGENTS.md and
the PreToolUse hook). Its `git config` allowlist accepts the invocation whenever
the token right after `config` is `--get`, `--get-all`, `--get-regexp`,
`--list`, `-l`, `--global`, `--local` or `--system`. The last three are scope
selectors, not read actions, so `git config --local core.hooksPath .githooks`,
`git config --global user.email ...`,
`git config --local remote.origin.url ...`,
`git config --global credential.helper ...`,
`git config --system core.sshCommand ...`, `git config --local --add ...` and
`git config --global --unset ...` all return isGitAllowed=true, checkGitGuard
returns null, and the hook exits without a `permissionDecision: deny`.
`git config user.email x` without a scope flag is denied, so the gap is specific
to the scope-flag spelling. Boundary assessment: the hook protects the operator
(execution identity: the operator's account running the vendor CLI) from the
agent turn, whose command text is model output that repository content can
steer. It is a deterministic check and counts as a control, but it is not a
containment boundary: it only filters git CLI spellings, it allows every non-git
Bash command (invoke-hook.ts:294-295), and nothing in the target prevents the
agent from editing `.git/config`, `.git/hooks/*` or `~/.gitconfig` directly with
Write/Edit or `sed`. The vendor's own Bash permission is the outer layer;
`noskills run` passes no permission flags (run.ts:280-289), so an operator who
runs the unattended loop must pre-allow Bash in vendor settings, and in that
configuration the hook is the only deterministic git control the product
provides. The defect therefore breaks the guard's stated contract for
scope-flagged config writes without granting the agent authority it did not
already hold through the same hook.

Lower-trust principal and source location: Reads the Claude Code PreToolUse hook
JSON from stdin; tool_input.command is the Bash text emitted by the model turn
(lower-trust: model output, steerable by repository content).
(`pkg/@eserstack/noskills/commands/invoke-hook.ts:162`). Sink:
`pkg/@eserstack/noskills/commands/invoke-hook.ts:295`.

Root cause: pkg/@eserstack/agents/guards/git.ts:61-73 lists the scope flags
`--global` (69), `--local` (70) and `--system` (71) in the GIT_CONDITIONAL_READS
entry for `config`; isGitAllowed (git.ts:165-171) inspects only the single token
following the subcommand, so any `--local|--global|--system <key> <value>` (or
`--add`/`--unset` after the scope flag) is accepted as a read.
hook-decisions.ts:34-41 re-exports these predicates and invoke-hook.ts:132-155
relies on them for the deny decision.

Conditions:

- system_configuration: noskills hooks synced into the project's
  .claude/settings.json (sync/hooks.ts:27-40, matcher Write|Edit|MultiEdit|Bash)
  and manifest allowGit left at its default false.
- user_interaction: The vendor CLI must permit the Bash tool call: an
  interactive approval, a permissions.allow rule such as Bash(git:_) or Bash(_),
  or a bypass mode. `noskills run` (claude --print) passes no permission flags,
  so unattended use requires the operator to have pre-allowed Bash, and the hook
  is then the product's only deterministic git control.
- data_state: The config write itself lands immediately in .git/config,
  ~/.gitconfig or the system gitconfig; downstream effects (hooksPath,
  credential.helper, core.sshCommand, remote.origin.url, user.*) surface on the
  operator's next git operation that consults the key.

Bounded reproduction: Inside the parent-approved sandbox run: container run --rm
-m 512M -c 1 --network none --ulimit fsize=52428800 --ulimit nofile=256 --ulimit
nproc=64 --env-file <audit-run>/tools/sbx-env --mount
type=bind,source=<repo>,target=/target,readonly --volume <scratch>:/scratch -w
/target node:26-bookworm timeout 120 sh -c 'node --experimental-strip-types
/scratch/v25-guard-check.mjs | tee /scratch/v25-guard-check.txt' The harness
imports /target/pkg/@eserstack/agents/guards/git.ts unmodified and replays
checkGitGuard from invoke-hook.ts:132-155 with allowGit=false over the payloads
plus controls `git push origin main`, `git commit -m x`,
`git config user.email a@b.c`, `git config --get user.email` and
`git config --list`. Expected: the first three controls print DENY:write, the
two genuine reads print ALLOW, and every payload prints ALLOW(no deny emitted).
No git process is executed; the check stops at the hook decision.

Actual result: Controls `git push origin main`, `git commit -m x` and
`git config user.email a@b.c` print DENY:write; `git config --get user.email`
and `git config --list` print ALLOW(no deny emitted). All eight scope-flagged
payloads print ALLOW(no deny emitted). isGitAllowed("git config --local
core.hooksPath .githooks") = true; hasGitWrite("git config --local
core.hooksPath .githooks") = false. node v26.7.0, mismatches=0, process exit 0.
Output retained as v25-guard-check.txt; the hunter's guard-check.txt shows the
same result for its five A-cases.

Impact and priority: Demonstrated result is the absence of the documented deny:
the agent can durably rewrite local, global or system git configuration
(identity, remote URL, hooksPath, credential.helper, core.sshCommand) under the
operator's identity without the hook objecting. It is not an authority
escalation: the same hook already passes every non-git Bash command and does not
contain direct edits of .git/config, .git/hooks or ~/.gitconfig, and the
vendor's Bash permission remains the outer layer. The concrete loss is the
guard's contract, which the operator relies on when broadly allowing Bash in the
unattended loop. Likelihood: Needs noskills hooks synced, allowGit unset, the
vendor's Bash permission already granted (interactive approval, an allow rule,
or the unattended loop with pre-allowed Bash), and a model turn that spells the
write with a leading scope flag; the unscoped `git config user.email x` form is
denied, and the behavioral rules plus AGENTS.md instruct the agent not to write
git, so the hook is reached only when the model disregards them or is steered by
injected content.

Smallest fix: Decide `git config` by action, not by scope: treat the invocation
as a read only when a read action flag is present and no mutating flag or
key/value pair follows; remove the scope flags from the read set; add regression
tests for every scope flag with a value and for the legitimate scoped reads.

### Token-bearing noskills-web dashboard executes cdnjs-hosted xterm scripts without integrity or CSP

Fingerprint: `noskills-web/layout/third-party-xterm-no-sri`. Severity: low
(likelihood low, impact high). Confidence: high.

The dashboard page rendered by pkg/@eserstack/noskills-web/templates/layout.ts
embeds the per-process mux token in a <meta name="noskills-token"> tag and, in
the same document, loads three scripts and one stylesheet from
https://cdnjs.cloudflare.com by bare URL: no integrity digest, no crossorigin
attribute, no nonce, and the server sets no Content-Security-Policy header or
meta. The version in the URL pins a name, not content, and the browser executes
whatever that host returns. Whoever controls the response for those URLs toward
the operator's browser (the CDN operator, a compromise of it or of its
publishing pipeline, or an on-path party able to intercept TLS to it) runs code
with the page's full same-origin authority: it can read the token exactly as
client.js does, open the /mux WebSocket and send writeInput frames that are
keystrokes into the operator's coding-agent PTY, or POST /api/tab to spawn a new
agent process as the operator. The independent sandboxed render reproduces the
document structure through both layout() and the real renderDashboard() entry;
the consequence chain is the first-party client's own code path and is
source-established, not locally executed.

Lower-trust principal and source location:
<script src="https://cdnjs.cloudflare.com/ajax/libs/xterm/5.3.0/xterm.min.js">
emitted with no integrity, crossorigin or nonce attribute (lines 27-28 do the
same for the fit and web-links addons, line 25 for xterm.min.css); the browser
executes whatever that host returns.
(`pkg/@eserstack/noskills-web/templates/layout.ts:26`). Sink:
`pkg/@eserstack/noskills-web/server.ts:127`.

Root cause: layout.ts:23-29 builds the terminal assets as plain <link>/<script>
tags pointing at cdnjs (lines 25-28) with no Subresource Integrity attribute,
and nothing in noskills-web emits a Content-Security-Policy: pages.ts:32-34
sends only content-type, server.ts adds no headers and does not use the CSP
middleware that exists elsewhere in the monorepo, and layout.ts has no CSP meta.
The third-party content is therefore an unbound input executed inside the one
page (dashboard.ts:45, served at server.ts:180 with guard.token) that carries
the token.

Conditions:

- third_party_dependency: The content served at cdnjs.cloudflare.com for the
  pinned xterm 5.3.0 URLs must be substituted toward the operator's browser: a
  compromise of the CDN or of its publishing pipeline, or TLS interception of
  that host. The repository does nothing to detect or reject a substitution;
  this is the attacker's precondition, not a control the repository or the CDN
  could enforce client-side once integrity is omitted.
- user_interaction: The operator runs `noskills web` and opens the dashboard
  (GET /) in a browser; the spec-detail page does not include the terminal
  scripts or the token.
- system_configuration: noskills-web listens on 127.0.0.1 (server.ts:214); the
  substituted script acts from inside the operator's browser on the dashboard
  origin, so loopback binding and the Origin allowlist do not apply.

Bounded reproduction: Write the harness to the agent scratch directory as
check-layout-v22.mjs (pure Node ES module, no DOM, no network, no dependencies
beyond the two target template files). Run: container run --rm -m 512M -c 1
--network none --ulimit fsize=52428800 --ulimit nofile=256 --ulimit nproc=64
--env-file <audit-run>/tools/sbx-env --mount
type=bind,source=<repo>,target=/target,readonly --volume
<audit-run>/agents/v22-third-party-xterm-no-sri/scratch:/scratch -w /target
node:26-bookworm timeout 120 node /scratch/check-layout-v22.mjs Read the JSON
printed to stdout and written to /scratch/layout-sri-check-v22.json.

Actual result: Exit 0 on Node v26.7.0 (env keys: HOME, NODE_OPTIONS,
NODE_VERSION, PATH, PWD, TMPDIR). dashboardViaLayout and
dashboardViaRenderDashboard both report: externalScripts = [xterm.min.js,
xterm-addon-fit.min.js, xterm-addon-web-links.min.js from
https://cdnjs.cloudflare.com/ajax/libs/xterm/5.3.0/] each with integrity=null,
crossorigin=null, nonce=null; externalStylesheets = [xterm.min.css] with
integrity=null; cspMeta=[]; sameOriginScripts=[/static/mux-render.js,
/static/client.js]; inlineScriptCount=1; tokenMetaPresent=true;
tokenMetaMatchesEscapedDummy=true; tokenAppearsRawAnywhere=false.
specDetailViaLayout: externalScripts=[], externalStylesheets=[],
tokenMetaPresent=false.

Impact and priority: A substituted script executes on the origin that holds the
mux token, which gates keystroke injection into the operator's coding-agent PTY
and spawning of new agent processes in the project root, so the consequence is
command execution as the operator on the local machine. Likelihood: Requires
substitution of content on a major public CDN, a compromise of its publishing
pipeline, or TLS interception toward it at the moment the operator loads the
dashboard; the repository cannot influence that event but also does nothing to
detect or reject it, and the dashboard reloads the scripts on every visit.

Smallest fix: Remove the unbound third-party input from the token-bearing page.
Preferred: vendor the pinned xterm 5.3.0 files (xterm.min.js,
xterm-addon-web-links.min.js, xterm.min.css) under static/vendor/, drop the
unused fit addon, serve them same-origin, move the inline service-worker
bootstrap (layout.ts:50-63) into static/sw-register.js, and send a
Content-Security-Policy on HTML responses (default-src 'self'; script-src
'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' ws: wss:;
object-src 'none'; base-uri 'none'), for example via the existing
pkg/@eserstack/http/middlewares/csp.ts. Minimal alternative if the CDN is kept:
add integrity="sha384-<digest>" crossorigin="anonymous" to each script and link
tag, with digests computed offline from the exact 5.3.0 release files.
Regression: a template test asserting every <script src> and stylesheet
<link href> in layout(..., { includeTerminal: true }) is same-origin or carries
an integrity attribute, and that the dashboard response carries a
Content-Security-Policy header.

### PreToolUse git guard decides on the literal spelling of the Bash text and misses git writes that reach the binary through case variants, shell quoting, stdin scripts, script files, task runners or interpreters

Fingerprint: `noskills/invoke-hook/git-guard-literal-substring-precheck`.
Severity: low (likelihood high, impact low). Confidence: high.

checkGitGuard returns early when the flag-stripped command does not contain the
case-sensitive substring `git` (invoke-hook.ts:137), and the predicates it
guards compare the first whitespace token of each segment against `git` without
shell-quote handling (git.ts:155-156) while the bypass detector models only *sh
-c, eval, pipe segments and
$()/backtick fragments (git.ts:216-253). A Bash tool call that reaches git any other way is never denied. Independently reproduced against the unmodified guard module in the sandbox: `g''it push origin main`, `printf 'g%sit push origin main' '' > r.sh; sh r.sh`, `bash run.sh`, `GIT=$(which
g?t); $GIT push`,`python3 -c "import
subprocess;subprocess.run(['g'+'it','push'])"`,`GIT push origin
main`, and also`"git" push origin main`,`'git' push origin main`,`sh <<< 'git
push origin main'`and`echo 'git push origin main' |
sh`(the last four contain the literal`git`and still pass) all produce no`permissionDecision:
deny`, while`git push origin main`,`git commit -m x`,`bash -c "git
push"`and`\git push origin
main`are denied. The precheck is a defect in its own right, not only an inherent classifier limit:`GIT
push origin main`,`Git commit -m x`and`/usr/bin/GIT
push`are denied by the predicates (hasGitWrite=true, because isGitProgram lowercases the basename at git.ts:140) but allowed by the hook, because the case-sensitive`includes("git")`returns first. The design does not present the guard as best-effort: README.md:160-163 calls hooks the difference between "please don't" and "you can't", README.md:403-406 says read-only git is enforced by the PreToolUse hook, and the fallback comment at invoke-hook.ts:148-149 shows smuggled writes are meant to be denied. The repo's own CLI runs`git
commit`/`git
push`(codebase/release.ts:181-193, codebase/git.ts:275-347), so an agent invoking a task runner crosses the guard without any adversarial spelling. Attacker: a model turn, or repository content injected into the model's context. Affected principal: the operator. Execution identity: the operator's user with the operator's git credentials. Resource: the local repository history and its remotes. Action: a git write the manifest (allowGit=false) says the agent may not perform. The vendor's Bash permission is the remaining outer layer; with an approval, an`--allowedTools`
Bash rule (ai/adapters/claude-code.ts:269-273) or a permissive mode, this hook
is the only deterministic control.

Lower-trust principal and source location: Hook JSON read from stdin;
tool_input.command is model-chosen Bash text, an untrusted input under the AI
domain rules. (`pkg/@eserstack/noskills/commands/invoke-hook.ts:162`). Sink:
`pkg/@eserstack/noskills/commands/invoke-hook.ts:295`.

Root cause: pkg/@eserstack/noskills/commands/invoke-hook.ts:137
(`if (!commandToScan.includes("git")) return null;`) returns before the
predicates run, and the predicates themselves classify text rather than the
program that will execute: git.ts:155-156 splits each segment on whitespace and
compares the raw first token to `git`/`git.exe` (a quoted or quote-split program
name never matches), git.ts:195 skips phrases without the literal `git`, and
containsGitWriteBypass (git.ts:216-253) enumerates only *sh -c, eval, pipe
segments and $()/backtick fragments, so scripts read from stdin or files, task
runners and interpreters are never modelled. The sibling candidate
agents/guards/git/config-scope-flags-allowlisted is a different root cause (an
allowlist-data error at git.ts:69-71 inside isGitAllowed, where the classifier
sees the command and misjudges it); it is co-located in the same guard but has a
separate mechanism and fix.

Conditions:

- system_configuration: noskills hooks synced into .claude/settings.json
  (sync/hooks.ts) and manifest allowGit false, the default (invoke-hook.ts:286).
- user_interaction: The vendor CLI must permit the Bash call: an approval, an
  `--allowedTools` Bash rule passed by the adapter
  (ai/adapters/claude-code.ts:269-273), or a permissive mode. With a broad allow
  rule this hook is the only deterministic layer.
- environmental_dependency: The `GIT push` / `Git commit` variants need a
  case-insensitive filesystem; verified on the audited host that
  `command -v GIT` resolves to /usr/bin/GIT on APFS. The quoting, stdin-script,
  script-file, task-runner and interpreter shapes are shell-portable.
- data_state: The script-file and task-runner shapes need a script or CLI on
  disk that performs the git write; the agent may write scripts during EXECUTING
  under the file-edit gate, and the repo's own `eser codebase release` path
  already does.

Bounded reproduction: Write a harness that imports
/target/pkg/@eserstack/agents/guards/git.ts unchanged and copies checkGitGuard
from invoke-hook.ts:132-155 verbatim with allowGit=false (stripFlagValues,
`includes("git")` precheck, extractGitInvocations/isGitAllowed loop,
containsGitWriteBypass fallback); null means no deny is emitted. Run it only in
the sandbox: container run --rm -m 512M -c 1 --network none --ulimit
fsize=52428800 --ulimit nofile=256 --ulimit nproc=64 --env-file
<audit-run>/tools/sbx-env --mount
type=bind,source=<repo>,target=/target,readonly --volume <scratch>:/scratch -w
/target node:26-bookworm timeout 120 node --experimental-strip-types
/scratch/v26-guard-check.mjs Print the decision for the controls
`git push origin main`, `git commit -m x`, `bash -c "git push"`,
`\git push origin main`, `git status` and for each payload; then run the
differential harness /scratch/v26-precheck-diff.mjs printing hook decision next
to hasGitWrite and isGitAllowed for `GIT push origin main`, `Git commit -m x`,
`/usr/bin/GIT push`.

Actual result: Controls: DENY:write, DENY:write, DENY:bypass, DENY:write, ALLOW.
All eleven payloads: ALLOW(no deny emitted). hasGitWrite("g''it push origin
main")=false; hasGitWrite('"git" push origin main')=false. Differential:
`GIT push origin main`, `Git commit -m x`, `/usr/bin/GIT push` each
hook=ALLOW(precheck) with hasGitWrite=true and isGitAllowed=false, while
`git push origin main` is hook=DENY:write. node v26.7.0, both runs exit 0;
outputs retained as v26-guard-check.txt and v26-precheck-diff.txt.

Impact and priority: The result is a git write (commit, push, reset) under the
operator's own identity in a repository the agent already edits; it is the same
outcome class as an approved git write. The vendor's Bash permission remains the
outer layer by default, the Stop hook snapshots git state, and no credential or
cross-project authority is gained. The observed local result is the missing
deny, not a demonstrated push. Likelihood: No adversarial intent is needed: the
repo's own CLI performs git commit/push (codebase/release.ts, codebase/git.ts),
so an agent invoking a task runner or a script crosses the guard in ordinary
use, and the deliberate shapes are one keystroke (`Git commit`) or a pair of
quotes away. Prompt-injected repository content can drive the same shapes.

Smallest fix: Stop treating the text guard as the enforcement point and say so
in the README and synced CLAUDE.md. Immediate source fixes that are cheap and
close the demonstrated classes: remove the `includes("git")` short-circuit so
the predicates see every command (this alone closes the case-variant class,
which the predicates already handle); normalise shell quoting before tokenising
(strip empty `''`/`""` pairs, unwrap a quoted program token) so `g''it`, `"git"`
and `'git'` resolve to git; treat any command that feeds a shell from stdin or a
file (`sh <<<`, `| sh`, `sh file`, `bash file`) as a git write when the guard is
active, because its content cannot be inspected. Script files, task runners and
interpreters cannot be decided from text, so add an execution-level control for
agent sessions: a `git` wrapper placed first on PATH (or GIT_CONFIG-driven
`core.hooksPath` pre-push/pre-commit hooks) that refuses write subcommands
unless allowGit is set, plus remote branch protection. Add regression tests for
every shape in the payload list.

### posts TUI OAuth callback receiver accepts the first request carrying ?code= from any reachable peer and never compares state, so a peer can terminate the operator's pending Twitter login

Fingerprint: `posts/tui/callback-server/unauthenticated-first-request-wins`.
Severity: low (likelihood low, impact low). Confidence: high.

waitForOAuthCallback in pkg/@eserstack/posts/adapters/tui/callback-server.ts is
the one-shot HTTP receiver for the Twitter OAuth 2.0 PKCE browser login started
from TuiMenu.browserLoginFlow (menu.ts:260-299). The Deno branch (the one
`deno task tui` in deno.extra.json:4 runs through adapters/tui/app.ts:13-16)
calls Deno.serve({ port, signal, onListen }) with no hostname, whose documented
default in the Deno 2.9.6 declarations for ServeTcpOptions is "0.0.0.0"; the
node/bun branch calls server.listen(port) with no host, which the sandbox
re-check shows binding [::] (all interfaces, dual-stack). Both handlers decide
acceptance solely on the presence of a `code` query parameter: request path,
Host, Origin and `state` are never checked (state is read with a default of ""
and passed through). The first request carrying a code receives the
"Authorization successful!" page, the promise resolves with that foreign code,
and the listener is closed (server.close() on node, ac.abort() in finally on
Deno). TwitterAuthProvider.getAuthorizationUrl generates a random state and
sends it to the authorization server but returns only { url, codeVerifier }; the
AuthProvider port has no state field, and menu.ts reads only result.code from
both waitForOAuthCallback and manualCodeEntry, so no comparison exists anywhere
in the package (verified by grep of `state` across pkg/@eserstack/posts). Any
principal that can open a TCP connection to the predictable callback port (8080
by default, 3000 in the committed sample .env) during the up-to-120 s wait can
send one GET with any `code`, after which the TUI forwards that junk code with
the operator's PKCE verifier to the token endpoint, the exchange fails with
"Login failed", and the operator's genuine redirect arrives at a closed port
(ECONNREFUSED observed). PKCE (fresh S256 verifier per attempt, sent on
exchange) means a code from a different authorization request cannot be
exchanged, so no token, code or verifier reaches the attacker and the login
cannot be steered into another account; the demonstrated effect is termination
of the operator's flow, repeatable for as long as the peer keeps sending.

Lower-trust principal and source location: server.listen(port) with no host
argument: the receiver binds the unspecified address. Re-verified in the v37
sandbox run: /proc/net/tcp6 shows local=00000000000000000000000000000000:BC35
([::]:48181) in LISTEN, reachable over 127.0.0.1 and ::1.
(`pkg/@eserstack/posts/adapters/tui/callback-server.ts:137`). Sink:
`pkg/@eserstack/posts/adapters/tui/menu.ts:286`.

Root cause: The receiver treats the presence of a `code` query parameter as
proof that a request is the authorization server's redirect for this flow. It
binds no listener address (unspecified address on both branches), checks no
request path, no Host and, decisively, no `state`: the state is generated inside
getAuthorizationUrl (auth-provider.ts:80) and placed in the authorization URL
(:88) but dropped from the return value (:93-96) and absent from the
AuthProvider port (application/auth-provider.ts:25), so the callback cannot be
correlated with the request that was issued. The first request wins and the
listener is torn down.

Conditions:

- user_interaction: The operator must be inside the TUI browser login for
  Twitter (TuiMenu.browserLoginFlow), which is the only code path that starts
  the receiver; the CLI `eser posts login` path (login.ts:50-65) prints the URL
  and never listens, and the `login-callback` command it names is not
  registered.
- timing_dependency: The foreign request must arrive after the receiver starts
  and before the operator's browser completes the redirect, within the 120 s
  TIMEOUT_MS_DEFAULT window; a persistent sender can repeat this on every
  attempt.
- network_routing: The attacker must reach the port: any process or user on the
  same host over 127.0.0.1 or ::1 (observed); a LAN peer because the node/bun
  socket is bound to [::] (observed) and the Deno branch defaults to 0.0.0.0 per
  its declarations (not executed locally; a host firewall may block); a
  cross-site page in the operator's browser only where the browser's
  local-network access policy permits a GET to a loopback port.
- system_configuration: The port is the one in TWITTER_REDIRECT_URI: 8080 by
  default, 3000 in the committed sample .env, so it is predictable without
  reconnaissance.
- third_party_dependency: Impact stays at flow termination only because the
  authorization server enforces PKCE S256 on the code exchange; the client
  itself never rejects a foreign code and forwards it with the operator's
  verifier.

Bounded reproduction: Inside the approved sandbox (Apple container, --network
none, target read-only at /target, scratch rw at /scratch, node:26-bookworm, -m
512M -c 1, ulimits fsize=52428800 nofile=256 nproc=64, env from tools/sbx-env,
timeout 120), run: node --experimental-strip-types /scratch/v37-harness.mjs. The
harness imports the real
/target/pkg/@eserstack/posts/adapters/tui/callback-server.ts (cross-runtime
detects node, so awaitCallbackNode runs), calls waitForOAuthCallback(48181,
5000), and lists LISTEN sockets on that port from /proc/net/tcp and
/proc/net/tcp6. Control: it sends GET /callback?state=only (no code) over a raw
socket to 127.0.0.1 and confirms 400 with the receiver still pending and still
listening. It sends the first payload over 127.0.0.1 on a fresh raw connection,
races the returned promise against a 1 s timer, then sends the operator's
genuine GET /callback?code=GENUINE&state=ISSUED with Host 127.0.0.1:48181 on a
new connection. It starts a second instance and sends the second payload over
::1 to show IPv6 reachability and state pass-through, then writes the log to
/scratch/v37-node-callback-recheck.txt. Compare with the hunter's independent
run in
agents/w9-posts-oauth-callback/artifacts/node-callback-first-request-wins.txt
(port 48080, same outcome).

Actual result: node v26.7.0. A: LISTEN socket /proc/net/tcp6
local=00000000000000000000000000000000:BC35 ([::]:48181). B (control, no code):
HTTP/1.1 400 Bad Request "Missing authorization code"; receiver PENDING and
still listening. C (foreign, wrong path, Host attacker.invalid, wrong state):
HTTP/1.1 200 OK with the "Authorization successful!" HTML; waitForOAuthCallback
resolved with {"code":"FOREIGN","state":"WRONG-STATE"}; LISTEN sockets
afterwards: []. D (operator's genuine redirect on a new connection):
ECONNREFUSED. E (second instance via ::1): HTTP/1.1 200 OK, resolved with
{"code":"V6","state":"ANY"}. No provider was contacted; the exchange failure
after the sink is established from source (menu.ts:286 ->
auth-provider.ts:103-112 posts the junk code to the token endpoint). The Deno
branch was not executed (no Deno image in the sandbox); its handler is
source-identical and its bind default is taken from Deno's own declarations.

Impact and priority: Only availability of one interactive login is affected: the
operator's pending authorization is aborted and must be restarted, and a
persistent sender can keep it from completing. No token, code or verifier is
disclosed to the attacker and PKCE prevents steering the login into another
account. The attacker-chosen code is forwarded only to the legitimate token
endpoint. Likelihood: Requires a peer that can reach the predictable port (8080
or 3000) during a 120 s interactive window that only opens while the operator
runs the TUI login. Same-host reach is unconditional; LAN reach depends on the
all-interfaces bind and host firewall; cross-site reach depends on the browser's
local-network policy.

Smallest fix: Return the issued state from getAuthorizationUrl (and add it to
the AuthProvider port), bind the receiver to the loopback host named in the
redirect URI, and make the receiver answer 400 and keep waiting for any request
whose state does not match the issued value (constant-time compare) or whose
path does not match the redirect path, so only the genuine redirect can resolve
or close the listener. Apply the same state comparison to the manualCodeEntry
result before exchanging the code. Regression: a deno test on 127.0.0.1 with a
free port that (a) asserts the bound hostname from onListen is 127.0.0.1, (b)
sends GET /callback?code=x&state=wrong and asserts 400 with the promise still
pending, then (c) sends the right state and asserts it resolves with that code;
and the same three assertions on the node branch via node
--experimental-strip-types.

### Remote social post text reaches the operator's terminal with ESC/CSI/OSC and control bytes intact in `eser posts` timeline, search, bookmarks and the TUI feed

Fingerprint: `streams/renderers/ansi/text-span-control-passthrough`. Severity:
low (likelihood medium, impact low). Confidence: high.

A Bluesky or X post that appears in the operator's timeline, in
`eser posts search` results or in their bookmarks can carry terminal control
sequences in its text. `eser posts timeline|search|bookmarks` and the
interactive `eser posts` TUI timeline/search/bookmarks views write that text to
stdout through @eserstack/streams' ansi renderer. The renderer copies text spans
byte-for-byte and only appends an SGR reset. The operator's terminal then
interprets the attacker's sequences: CSI cursor movement and erase (rewriting or
hiding earlier feed lines, such as a fake system message in place of the
previous post header), OSC 8 hyperlinks whose visible label differs from their
target, OSC 52 clipboard writes on emulators that allow them, DCS strings, BEL
and CR overwrites. Two independent bounded renders of dummy posts through the
real output()+ansi() pipeline, in the CLI and TUI span shapes, reproduced the
bytes unchanged.

Lower-trust principal and source location: `text: raw.record.text` copies a
remote author's post body verbatim into Post.text. twitter/mappers.ts:56 does
the same with `raw.text`. There is no character filtering.
(`pkg/@eserstack/posts/adapters/bluesky/mappers.ts:26`). Sink:
`pkg/@eserstack/streams/sinks/stdout.ts:25`.

Root cause: pkg/@eserstack/streams/renderers/ansi.ts:49-50 returns `span.value`
verbatim for text spans, and ansi.ts:70-73 does the same for each code-block
line. span.ts:109-116 and output.ts:137-141 never inspect string content, and
sinks/stdout.ts:20-25 encodes and writes whatever it receives, with no TTY
check. The only defensive code is ansi.ts:163-165. It appends ESC[0m when the
output contains ESC[, which does not neutralise cursor, erase, OSC, DCS or C0/C1
controls, and attacker bytes trigger it too. posts/adapters/cli/output.ts:43 and
posts/adapters/tui/menu.ts:579/1029/1069 pass remote Post.text into that
renderer. Post.text is copied unfiltered from the provider response at
bluesky/mappers.ts:26 and twitter/mappers.ts:56.

Conditions:

- authentication_level: The attacker needs only an ordinary Bluesky or X
  account. The operator must be logged in via `eser posts login` so a feed,
  search or bookmark list can be fetched.
- user_interaction: The operator runs `eser posts timeline`,
  `eser posts search <query>` or `eser posts bookmarks`, or opens the TUI
  timeline/search/bookmarks view, in a terminal. For search, any public post
  matching the query is enough. For timeline, the attacker must be followed or
  reposted into the feed. For bookmarks, the operator must have bookmarked the
  post.
- third_party_dependency: The provider must deliver the control bytes in the
  post text. Bluesky record text and X tweet text arrive as JSON strings and the
  client does not filter them; whether a given provider strips C0/ESC
  server-side is not visible in source and was not tested against live services.
- environmental_dependency: The effect depends on the terminal emulator. Every
  ANSI terminal honours CSI cursor movement, erase and SGR. Most modern
  emulators honour OSC 8. OSC 52 clipboard writes work only where enabled (xterm
  allowWindowOps, kitty/foot/WezTerm/tmux settings). 8-bit C1 bytes arrive UTF-8
  encoded, and most UTF-8 terminals ignore them. Output must go to a TTY.

Bounded reproduction: Write scratch/verify.ts. It imports
/target/pkg/@eserstack/streams/output.ts, renderers/ansi.ts, span.ts and
sinks/buffer.ts and builds a dummy Post {platform:'bluesky',
id:'at://did:plc:dummy/app.bsky.feed.post/v38', text:<payload>, createdAt:new
Date(0)}. On output({renderer: ansi(), sink: buffer()}) it repeats
outputPosts()'s four writeln calls (cli/output.ts:38-45), then the TUI line
writeln(span.text(`${post.text}`)) (tui/menu.ts:579). It writes the rendered
bytes to /scratch/v38-render.bin and an escaped dump plus presence checks to
/scratch/v38-render.txt, and prints only the checks JSON. Run it inside the
approved sandbox: container run --rm -m 512M -c 1 --network none --ulimit
fsize=52428800 --ulimit nofile=256 --ulimit nproc=64 --env-file
<audit-run>/tools/sbx-env --mount
type=bind,source=<repo>,target=/target,readonly --volume
<audit-run>/agents/v38-streams-ansi-passthrough/scratch:/scratch -w /target
node:26-bookworm timeout 120 node --experimental-strip-types /scratch/verify.ts
Inspect v38-render.txt (control bytes escaped as <hh>) and v38-render.bin (with
xxd) without writing them to a terminal. Confirm that the CLI post line equals
payload + ESC[0m and the TUI line equals two spaces + payload + ESC[0m.

Actual result: Exit 0. stdout:
{"cli_line_verbatim":true,"tui_line_verbatim":true,"csi_cursor_up_2":true,"csi_erase_display":true,"osc52":true,"osc8":true,"dcs":true,"c1_csi_0x9b":true,"cr":true,"bel":true,"total_bytes":321}.
Escaped CLI post line:
`v38 <1b>[2A<1b>[J<1b>]52;c;djM4LWR1bW15<07><1b>]8;;https://attacker.invalid<1b>\docs.example<1b>]8;;<1b>\<1b>P+q<1b>\<9b>31m<0d>FAKE<07><1b>[0m`.
The TUI line is identical after a two-space prefix. The renderer added only the
trailing ESC[0m. This matches the hunter's independent artifact (render.bin, 277
bytes, OSC 52/CSI 1A/CSI 2K at 0x50-0x73).

Impact and priority: The demonstrated effect is on the operator's terminal
display only. The attacker can rewrite or hide previously printed feed lines
(spoofed instructions or fake tool output), add OSC 8 links whose label hides
the target, and add bells and CR overwrites. On emulators that allow OSC 52, the
attacker can also set the clipboard. Nothing executes without a further
deliberate operator action such as pasting or running spoofed instructions.
Tokens, the filesystem and the daemon are not reached. Terminal query-response
injection into the TUI's stdin was not demonstrated and is not claimed.
Likelihood: Any public post matching an operator's `eser posts search` query,
and any post from a followed or reposted account in the timeline, is rendered
with no content filter and no TTY check. Beyond running the normal feed commands
in a terminal, no operator interaction is needed. The attacker still has to get
content in front of a specific operator who uses this niche CLI, and delivery
depends on the provider passing control bytes through.

Smallest fix: Treat text spans as untrusted data in the renderer. In both the
ansi and plain renderers, strip ESC-introduced sequences (CSI, OSC,
DCS/SOS/PM/APC, two-byte ESC), C0 controls other than \n and \t, DEL and C1
controls before concatenating span.value and code-block lines. This covers every
consumer of @eserstack/streams at once. As defence in depth,
posts/adapters/cli/output.ts can also sanitise post.text and post.id, and choose
the plain renderer when stdout is not a TTY. Add regression tests in
pkg/@eserstack/streams/span.test.ts.

## 4. Needs validation

These are source-grounded leads whose decisive fact is outside the repository or
needs a toolchain the sandbox lacks. They carry no severity and are not
confirmed vulnerabilities.

| Title                                                                                                                                                                                                                                                                                                                          | Repository trace                                                                                             | Exact blocker                                                                                                                                                                                                                                                        | Bounded local next step                                                                                                                                                                                  | Owner-observed deployment check                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default in-process claude-code shim runs the vendor CLI headless with no permission bridge, so the daemon's journalled per-tool approval never gates what the agent executes as the operator                                                                                                                                   | `pkg/ajan/noskillsserverfx/wt_attach.go:198` to `pkg/ajan/acpfx/shim/vendor.go:60`                           | Vendor CLI headless permission semantics are decisive and not source-visible: whether `claude --print --input-format stream-json --output-format stream-json --verbose` executes Write/Edit/Bash tool calls without a prompt when allowed by user-scope or project-s | Two non-destructive Go tests, run by the owner with `go test ./pkg/ajan/acpfx/shim/ ./pkg/ajan/noskillsserverfx/ -run 'TestClaudeCodeHeadlessNeverRequestsPermission\|TestACPWorkerDefaultShimNeverEmits | Owner-observed, in a throwaway directory registered as a project, with a throwaway HOME so the operator's real ~/.claude allow rules do not leak into the result, and with the daemon bound to loopback. |
| Headless Claude Code turn runs inside a third-party repository with that repository's .claude/settings.json hooks and permission allow rules honoured and no daemon-side restriction                                                                                                                                           | `pkg/ajan/noskillsserverfx/projects.go:443` to `pkg/ajan/acpfx/shim/vendor.go:60`                            | Vendor semantics are not source-visible and decisive: whether the `claude` binary found on the operator's PATH, in `--print` mode with `--input-format stream-json`, loads `.claude/settings.json` and `.claude/settings.local.json` from cwd, executes project-scop | Step 1 (regression test, Go, run by the owner): add TestClaudeCodeRestrictsSettingSources to pkg/ajan/acpfx/shim/shim_test.go using the same fake-CLI harness as TestShimSendsPromptOnStdinNotArgv (shim | On the operator's own workstation (not a probe of any live daemon): record `claude --version`, then run `claude --print --setting-sources user --output-format json </dev/null` with ANTHROPIC_API_KEY s |
| External ACP agent named by NOSKILLS_ACP_COMMAND is started at first attach with its process cwd inside the untrusted repository and the daemon's full environment, so repository content can steer agent start-up configuration outside the permission ledger, and a relative command value is resolved inside the repository | `pkg/ajan/noskillsserverfx/projects.go:443` to `pkg/ajan/shellfx/exec/exec.go:68`                            | Agent-side semantics are not source-visible and are decisive for the configuration half: whether the operator's installed `gemini --acp`, `claude-agent-acp` or `codex-acp` build loads workspace configuration from its process cwd or from the session/new cwd (`. | Step 1 (relative command, Go, owner-run): in pkg/ajan/acpfx/spawn_test.go add TestSpawnRelativeCommandIsResolvedAgainstCwd using the existing fake-agent harness (spawn_test.go:36-100,153-158). repo := | Owner-observed, on the owner's own machine with a throwaway --data-dir and no real project: with NOSKILLS_ACP_COMMAND pointing at the agent actually used (gemini, claude-agent-acp or codex-acp) and th |
| Model output is written to the operator's terminal without filtering ESC/OSC/CSI sequences or lone carriage returns                                                                                                                                                                                                            | `pkg/@eserstack/codebase/commitmsg.ts:49` to `pkg/@eserstack/streams/renderers/ansi.ts:50`                   | Whether a production model emits raw ESC/BEL/CR characters in its answer when steered by diff content is a model behaviour fact not observable locally; this run forbids calling any model provider or agent CLI.                                                    | Re-run the promoted harness: container run --rm -m 512M -c 1 --network none --ulimit fsize=52428800 --ulimit nofile=256 --ulimit nproc=64 --env-file <audit-run>/tools/                                  | none                                                                                                                                                                                                     |
| Native bridge library is resolved from working-directory-derived paths and loaded on an existence check alone                                                                                                                                                                                                                  | `pkg/@eserstack/shell/exec/command.ts:164` to `pkg/@eserstack/ajan/ffi/backend-deno.ts:1200`                 | sandbox lacks Go/Deno toolchain image; local plan requires owner to run `deno test --allow-read --allow-write --allow-env pkg/@eserstack/ajan/ffi/resolve.test.ts` with the added cwd-planting case and `deno run --allow-read --allow-env --allow-ffi <T>/check.ts` | From the repository root with Deno 2.9. (1) Add to pkg/@eserstack/ajan/ffi/resolve.test.ts: Deno.test("resolveLibraryPath: cwd fallback picks a library planted in the working directory", async () =>   | Owner-observed, no live target: in a fresh temp directory create node_modules/@eserstack/ajan-<slug>/libeser_ajan.<ext>, dist/<target>/libeser_ajan.<ext> and ./libeser_ajan.<ext> each containing the b |
| Release chain jobs holding repository secrets, OIDC and contents:write are bound to no environment, so any write-access principal runs them from a workflow file of their own choosing (dispatch resume or plain branch push)                                                                                                  | `.github/workflows/build.yml:29` to `.github/workflows/build.yml:1396`                                       | Repository-host fact (decisive): whether any principal other than the owner holds write (push or workflow_dispatch) access to eser/stack, directly or through an organization team. With a single writer there is no lower-trust actor and the record is hardening o | Source-only, no execution needed: from the repository root run `git show HEAD:.github/workflows/build.yml \| grep -c 'environment:'` and confirm the count is 0; run `git show HEAD:.github/workflows/bu | Owner checks only, nothing is triggered or modified: (1) eser/stack Settings -> Collaborators and teams: list every user or team with Write, Maintain or Admin; if only the owner appears, close as hard |
| Fork pull_request code and the jobs that build the npm release bundles or hold App tokens share the same third-party runner labels and the same actions cache key space                                                                                                                                                        | `.github/workflows/build.yml:16` to `.github/workflows/build.yml:804`                                        | Runner identity fact (decisive): whether every job on the ubicloud-standard-2-arm/4-arm labels runs in a newly provisioned VM destroyed at job end with no persistent disk, tool cache or network-attached volume shared across jobs, events or repositories in the  | Nothing executable applies; the decisive facts are hosted. Source verification already done read-only: build.yml:16, :72, :83, :91-99, :125, :316, :335-343, :356-364, :379-395, :725, :779-794, :804-82 | Owner, non-destructive, no change to eser/stack releases: (1) In the Ubicloud console, GitHub Runners > the project bound to the eser org, record the runner model for ubicloud-standard-2-arm/4-arm (VM |
| commitmsg feeds an untrusted git diff to a headless Claude Code agent spawned with the operator's full tool surface, on both the Go bridge and the TypeScript fallback path, with no default capability restriction                                                                                                            | `pkg/@eserstack/codebase/commitmsg.ts:49` to `pkg/ajan/acpfx/shim/vendor.go:60`                              | Claude Code CLI headless permission semantics are not source-visible: whether, under `--print --input-format stream-json --output-format stream-json --verbose` (Go bridge path) or `--output-format json` with the prompt on stdin (TS fallback path), the CLI exec | Phase 1 (argv and stdin, no real model): in a throwaway git repository with Deno and the built eser CLI available, (1) create shim/claude as an executable that appends "$@" to argv.log, copies stdin t | none                                                                                                                                                                                                     |
| RouteRaw runs the raw handler even when a middleware denied the request                                                                                                                                                                                                                                                        | `pkg/ajan/httpfx/router.go:272` to `pkg/ajan/httpfx/router.go:298`                                           | sandbox lacks Go/Deno toolchain image; local plan requires owner to run `go test ./pkg/ajan/httpfx/middlewares/ -run TestRouteRawHonoursMiddlewareDenial -count=1`                                                                                                   | From the repository root (module github.com/eser/stack) add pkg/ajan/httpfx/middlewares/route_raw_deny_test.go with `package middlewares_test` (the convention every existing test in that directory use | Owner-observed, non-destructive: (a) enumerate external importers of github.com/eser/stack/pkg/ajan/httpfx that call Router.RouteRaw and list which middlewares each registers via Router.Use; the findi |
| Native kit path discovers the recipe registry by an unowned ancestor-directory walk and runs its post-install commands without opt-in or skip                                                                                                                                                                                  | `pkg/@eserstack/kit/commands/add.ts:85` to `pkg/ajan/kitfx/applier.go:201`                                   | sandbox lacks Go/Deno toolchain image; local plan requires owner to run go test ./pkg/ajan/kitfx/ -run TestFetchRegistry_AncestorWalk -v                                                                                                                             | Create pkg/ajan/kitfx/ancestor_walk_test.go with: package kitfx_test; import ("os"; "path/filepath"; "testing"; "github.com/eser/stack/pkg/ajan/kitfx"). func TestFetchRegistry_AncestorWalk(t *testing. | On a multi-user host the owner controls, as a second unprivileged user run: mkdir -p /tmp/.eser && printf '%s' '{"name":"planted","description":"d","author":"other","registryUrl":"","recipes":[{"name" |
| laroux-server evaluates a fresh cache-busted layout/not-found module on every unauthenticated /rsc and SSR page request, and the only rate limiter in front of it is bypassable by header, so module-map cardinality grows with request count                                                                                  | `pkg/@eserstack/laroux-server/runtime/server.ts:461` to `pkg/@eserstack/laroux-server/main.ts:192`           | sandbox lacks Go/Deno toolchain image; local plan requires owner to run deno test -A --v8-flags=--expose-gc pkg/@eserstack/laroux-server/main.module-map.test.ts                                                                                                     | Owner runs in the repo (Deno 2.9): create pkg/@eserstack/laroux-server/main.module-map.test.ts that (1) writes a temp dir with a 30-40 KiB `layout.js` exporting `Layout` and a small `not-found.js` exp | On a deployed `laroux serve` instance, the owner records process RSS/heap at two points separated by a known number of served page or /rsc requests (from access logs) and checks whether memory returns |
| RSC payload data block escapes </script but not <!--<script>, so a rendered string can swallow the client entry script                                                                                                                                                                                                         | `pkg/@eserstack/laroux-server/runtime/server.ts:686` to `pkg/@eserstack/laroux-server/runtime/server.ts:105` | The script-data double-escaped tokenizer transition is renderer behavior outside source: the sandbox has no browser image and no HTML parser (node_modules/.pnpm contains no parse5, jsdom, linkedom, happy-dom or htmlparser2), and target-produced HTML may not be | Browser check (owner, no network needed): copy agents/v12-script-double-escape-sequenc/artifacts/v12-double-escape-fixture.html and v12-double-escape-fixture-fixed.html into an empty directory togethe | none                                                                                                                                                                                                     |
| laroux dev/serve never passes the configured server.host (default "localhost") to Deno.serve, so the unauthenticated dev listener binds Deno's 0.0.0.0 default while the console prints 'Local: http://localhost'                                                                                                              | `pkg/@eserstack/laroux-server/commands/dev.ts:29` to `pkg/@eserstack/laroux-server/runtime/server.ts:780`    | sandbox lacks Go/Deno toolchain image; local plan requires owner to run `deno test --allow-net --allow-read --allow-env --allow-sys pkg/@eserstack/laroux-server/runtime/bind-address.test.ts` (fixture in validation_plan.local) so the actual bound interface is o | Owner runs outside this audit's sandbox on a trusted network (no external network needed; the fixture connects only to the machine's own interface and sends no request bytes). Create pkg/@eserstack/la | Owner-observed, without probing the process over the network: run `deno task cli laroux dev` (or `laroux dev`) in any laroux app, then in another terminal run `lsof -nP -iTCP:8000 -sTCP:LISTEN` on mac |
| serveStatic containment uses startsWith(config.distDir) with no trailing separator; a '//'-prefixed request target makes relativePath absolute, so any readable file whose absolute path begins with the distDir string is served to an unauthenticated visitor                                                                | `pkg/@eserstack/laroux-server/runtime/server.ts:307` to `pkg/@eserstack/laroux-server/runtime/server.ts:208` | Sandbox lacks a Deno toolchain image (only node:26-bookworm, debian:trixie-slim and alpine are available and fetching one is prohibited), so the end-to-end step that Deno.serve delivers a '//'-containing request target unchanged in req.url: so that new URL(re  | Owner, with Deno 2.9 available, in a temp directory <tmp>: create <tmp>/app/dist/ok.txt, <tmp>/app/dist-secret/flag.txt containing DIST_SIBLING_FLAG, and <tmp>/app/public/. Write a script that imports | Owner inspects the deployed laroux install read-only: list the parent directory of distDir and look for any entry whose name begins with the distDir basename but is not the real dist directory (for ex |
| Concern promptFile path traversal reads arbitrary daemon-readable files from repository content                                                                                                                                                                                                                                | `pkg/ajan/noskillsfx/concerns.go:52` to `pkg/ajan/noskillsfx/concerns.go:60`                                 | sandbox lacks Go/Deno toolchain image; local plan requires owner to run go test ./pkg/ajan/noskillsfx/ -run TestLoadConcernsPromptFileTraversal                                                                                                                      | Create pkg/ajan/noskillsfx/concerns_traversal_test.go in package noskillsfx: func TestLoadConcernsPromptFileTraversal(t *testing.T) { tmp := t.TempDir(); concerns := filepath.Join(tmp, "concerns"); os | On a disposable daemon host with a dummy PIN, register a throwaway git repository (POST /api/projects with {"git": ...}) that contains .eser/manifest.yml listing concern id x and .eser/concerns/x.json |
| Unvalidated session id is joined into the JSONL ledger path: first attach creates, appends to and replays a token-holder-chosen *.jsonl outside DataDir/sessions                                                                                                                                                               | `pkg/ajan/noskillsserverfx/wt_attach.go:27` to `pkg/ajan/noskillsserverfx/ledger.go:122`                     | sandbox lacks Go/Deno toolchain image; local plan requires owner to run go test ./pkg/ajan/noskillsserverfx/ -run TestLedgerSidEscapesSessionsDir -count=1 -v                                                                                                        | Add pkg/ajan/noskillsserverfx/ledger_sid_test.go in package noskillsserverfx (internal test, so ledgerPath, openLedger, readForkMeta and replayWithForkAwareness are reachable) with TestLedgerSidEscape | Owner-observed only, on the owner's own machine with a throwaway --data-dir and dummy files, never against a daemon holding real project state: start noskills-server with --data-dir /tmp/ns-audit/data |
| Failed PIN logins hold the AuthManager mutex through bcrypt, stalling every request that passes PinAuthMiddleware                                                                                                                                                                                                              | `pkg/ajan/noskillsserverfx/auth_handlers.go:52` to `pkg/ajan/noskillsserverfx/auth.go:244`                   | sandbox lacks Go/Deno toolchain image; local plan requires owner to run go test ./pkg/ajan/noskillsserverfx/ -run TestLoginBlocksTokenValidation -count=1 -v                                                                                                         | Add pkg/ajan/noskillsserverfx/auth_mutex_test.go in package noskillsserverfx (testify is already a dependency, go.mod:32):                                                                               |                                                                                                                                                                                                          |

func TestLoginBlocksTokenValidation(t *testing.T) { am, err := NewAuthManag |
Owner checks with `ss -ulnp \| grep 4433` (Linux) or `lsof -nP -iUDP:4433`
(macOS) whether noskills-server is bound to 0.0.0.0/:: rather than 127.0.0.1,
and whether a host firewall or network ACL limi | | Six-digit PIN protected only
by per-source-address limits can be exhausted from many addresses |
`pkg/ajan/noskillsserverfx/auth_handlers.go:52` to
`pkg/ajan/noskillsserverfx/auth.go:228` | sandbox lacks Go/Deno toolchain image;
local plan requires owner to run go test ./pkg/ajan/noskillsserverfx/ -run
TestLoginBudgetIsPerAddressOnly -count=1 -v | In package noskillsserverfx add
auth_budget_test.go (imports: fmt, testing, github.com/stretchr/testify/require,
already in go.mod): func TestLoginBudgetIsPerAddressOnly(t *testing.T) { am, err
:= New | Owner records the daemon's bind address (default :4433 on all
interfaces), the firewall rules for UDP 4433, and whether the host has a
routable IPv6 prefix or is reachable from any untrusted network. | |
noskills-server pin does not revoke tokens in the running daemon and its reset
is overwritten by the daemon's next save | `cmd/noskills-server/main.go:272` to
`pkg/ajan/noskillsserverfx/auth.go:283` | sandbox lacks Go/Deno toolchain image;
local plan requires owner to run go test ./pkg/ajan/noskillsserverfx/ -run
TestPinResetDoesNotReachRunningManager -count=1 -v | Add
pkg/ajan/noskillsserverfx/auth_reset_test.go (package noskillsserverfx, testify
is already in go.mod): func TestPinResetDoesNotReachRunningManager(t _testing.T)
{ t.Parallel(); dir := t.TempDir(); | On a disposable machine with a dummy data
dir: start the daemon, log in once to obtain token T, run `noskills-server pin`
and note the printed PIN P2. Then GET /api/projects with
`Authorization: Beare |
| Corrupt or unreadable auth.json makes the daemon load its credential store from the shared temp directory, where another local OS user can pre-plant it |`pkg/ajan/noskillsserverfx/auth.go:332`to`pkg/ajan/noskillsserverfx/auth.go:255`| sandbox lacks Go/Deno toolchain image; local plan requires owner to run go test ./pkg/ajan/noskillsserverfx/ -run TestCorruptAuthJSONFallbackTrustsTempDir -count=1 -v | Add pkg/ajan/noskillsserverfx/auth_fallback_test.go in package noskillsserverfx_test (the package's existing tests use the external package, so only exported API is used): import os, path/filepath, te | Non-destructive checks by the owner on each Linux host running the systemd user unit:`systemctl
--user show noskills-server -p
PrivateTmp`(PrivateTmp=no means shared /tmp),`systemctl --user show-en | | Spec
{name} path parameter is joined into ledger/summary/state file paths with no
validation; Go 1.26 ServeMux passes %2F-encoded traversal through PathValue |
`pkg/ajan/noskillsserverfx/specs.go:136` to
`pkg/ajan/noskillsfx/persistence.go:426` | sandbox lacks Go/Deno toolchain
image; local plan requires owner to run go test ./pkg/ajan/noskillsserverfx/
-run 'SpecNameTraversal' -count=1 -v | Owner runs, in a Go 1.26 checkout, a
table-driven internal test at pkg/ajan/noskillsserverfx/specs_traversal_test.go
(package noskillsserverfx). Part A (mux fact): mux := http.NewServeMux(); var
got s | Owner-observed only, against the owner's own daemon on loopback with a
throwaway project and a dummy token, never a shared instance: register a scratch
project (or reuse a disposable one), then curl - | | Revoked or expired bearer
token keeps full authority over already-attached WebTransport sessions |
`pkg/ajan/httpfx/middlewares/pin_auth_middleware.go:37` to
`pkg/ajan/noskillsserverfx/wt_attach.go:198` | sandbox lacks Go/Deno toolchain
image; local plan requires owner to run go test ./pkg/ajan/noskillsserverfx -run
TestRevokedTokenEndsAttachedSession -count=1 -race | Add an in-package test
(package noskillsserverfx, so it can reach srv.sessions) to
pkg/ajan/noskillsserverfx, modelled on server_test.go TestServer_Health_HTTP3
(lines 31-88) for the server bootstrap | On an owner-controlled noskills-server
with a dummy project and a dummy session: attach a CLI/TUI client with token T,
from a second terminal run POST /auth/logout with Authorization: Bearer T and
con | | Every release consumer trusts whatever bytes currently sit under the
GitHub release tag: the checksum list comes from the same location and the
cosign bundles the pipeline produces are never verified |
`pkg/@eserstack/codebase/cli-system/handlers/version-check.ts:151` to
`pkg/@eserstack/codebase/cli-system/handlers/update.ts:314` | Not
source-visible: whether eser/stack has GitHub's 'immutable releases' setting or
tag protection rulesets enabled, which would make published assets unreplaceable
(and a tag unmovable) and reduce this to hardening. | Already observed offline
under Node 26 (see evidence update.ts:150). Owner equivalent with the project
toolchain: add to pkg/@eserstack/codebase/cli-system/handlers/update.test.ts a
case that builds a | Owner checks repository Settings -> General -> Releases for
'Immutable releases', Settings -> Rules/Tags for tag protection on v_, and the
collaborator and installed-App list with contents:write; then |

Full traces, blockers and plans are in NEEDS-VALIDATION.md.

## 5. Hardening notes and positive patterns

Positive patterns the hunters recorded: slug validation with an explicit DataDir
exclusion and inode comparison (`projects.go`), symlink-resolved root
containment and regular-file checks in the ACP host, fail-closed permission
decisions with fsync before write-class tools, constant-time token comparison,
TLS 1.3 minimum with leaf pinning that also covers resumption, argv-array
spawning everywhere except the documented manifest shell steps, CSRF and CORS
middlewares that never reflect an unlisted origin, and a release pipeline that
keeps publishing on GitHub-hosted runners with OIDC.

Hardening notes (not findings; no affected principal or no crossed boundary):

- pkg/ajan/noskillsserverfx/wt_attach.go:136: the WebTransport client-message
  scanner uses bufio.NewScanner with no scanner.Buffer() sizing, unlike every
  sibling scanner (worker.go:305, ledger.go:134, fork.go:205,284 all set 1MB). A
  client message over the 64KB bufio default silently ends the scan and tears
  down the attach; set an explicit, documented buffer bound for consistency and
  predictable behavior.
- pkg/ajan/noskillsserverfx/session_handlers.go:77 and wt_attach.go:27:
  req.ResumeFrom and the {sid} path value are used unvalidated as the session
  id, flowing into ledgerPath = filepath.Join(sessionDir, sid+".jsonl")
  (ledger.go:176) where openLedger does MkdirAll+O_CREATE|O_APPEND, an
  out-of-tree file create/append primitive. It is same-principal (a bearer token
  already grants operator authority), but validating the sid to a ULID/hex shape
  would fail-close this cleanly and match the {slug} treatment.
- pkg/ajan/httpfx/request_limits.go: the 50 MB default body cap applies
  uniformly, including to /auth/login and /auth/setup whose only field is a
  short PIN. Consider a much smaller per-route cap for the pre-auth auth
  endpoints so an unauthenticated caller cannot force a 50 MB allocation per
  request.
- pkg/ajan/noskillsserverfx/fork.go:132: replayWithForkAwareness buffers the
  entire ledger into memory (var lines [][]byte) on every attach; for a
  long-lived session with a large agent transcript this is repeated per
  reconnect. Consider streaming replay instead of full-buffer for large ledgers.
- Pin every `uses:` in .github/workflows/_.yml to a full commit SHA with a
  version comment (actions/checkout@v7, denoland/setup-deno@v2,
  pnpm/action-setup@v6, actions/setup-node@v7, actions/setup-go@v7,
  actions/cache@v6, codecov/codecov-action@v7, oven-sh/setup-bun@v2,
  sigstore/cosign-installer@v3, actions/create-github-app-token@v3,
  actions/upload-artifact@v7, actions/download-artifact@v8, actions/labeler@v7,
  EndBug/label-sync@v2, github/codeql-action/_@v4); dependabot.yml already
  tracks github-actions so SHA pins stay maintainable. The highest-value pins
  are the jobs holding id-token or App tokens (publish, publish-ajan,
  upload-assets, update-homebrew, update-nix-hashes).
- deno.json sets `"lock": false` and no deno.lock exists: `jsr:@std/path@^1.1.4`
  in etc/scripts/update-nix-hashes.ts:3 resolves unpinned inside a job that
  pushes to main with an App token, and `deno publish` / gen-jsr-manifests
  resolve unpinned in the publish job. Enable the lockfile (or vendor the two
  release scripts' imports) so Deno-side inputs get the same integrity pin
  pnpm-lock.yaml gives npm inputs.
- `node-version: "latest"` in validate, preflight, smoke-test, publish,
  build-ajan-darwin, compile-binaries and publish-ajan floats Node and its
  bundled npm/pnpm behaviour between runs; pin a major (as npm-no-deno-test and
  release-notes do with "26") or a .node-version file.
- actions/cache paths include ~/.deno (the interpreter install directory) and
  node_modules with prefix restore-keys deno-<arch>-; a default-branch cache
  would silently replace the Deno binary setup-deno just installed in publish
  and compile-binaries. Cache only ~/.cache/deno and rely on
  `pnpm install --frozen-lockfile` plus the setup-node pnpm store cache for
  node_modules.
- update-nix-hashes.ts and update-homebrew-formula.ts re-download release assets
  / SHA256SUMS.txt by mutable URL after upload; SHA256SUMS.txt is not covered by
  the cosign bundles. Compute hashes from the in-run binary-bundle artifact (or
  verify the downloaded bytes against it) and sign SHA256SUMS.txt so followers
  and installers share an attested digest.
- release-gate verifies VERSION and the CHANGELOG heading but not that the
  tagged commit is reachable from main (`git merge-base --is-ancestor`), so a v*
  tag on any unreviewed commit releases; add the ancestry check and require
  `github.ref == 'refs/heads/main'` for dispatch resumes.
- build.yml:272 (`TAG="${{ steps.mode.outputs.tag }}"`), :587 and :593
  (`${{ matrix.runtime }}`) interpolate expressions into shell; the values are
  ref-name or file-literal controlled by repository writers, so no privilege is
  gained, but pass them via `env:` as the neighbouring INPUT_TAG/INPUT_STAGE
  step already does.
- The published `eser` manifest pins koffi ^2.15.0 (npm-build.ts:242) while the
  workspace lockfile tests koffi ^3.3.0 (pkg/@eserstack/ajan/package.json);
  consumers and CI's frozen-lockfile tests therefore run different FFI bindings.
  Emit exact, lockfile-derived versions in npm-build.ts (also the fix for the
  release-notes candidate).
- update-contributors.yml declares `contents: write` at workflow level and
  pushes to main directly with GITHUB_TOKEN via gh-contributors.ts:222-226; move
  the permission to the job and consider opening a PR instead of pushing so
  branch protection applies.
- publish-ajan.yml runs `pnpm install --no-frozen-lockfile` in a job with
  id-token: write (bootstrap by design); keep it dispatch-only and consider
  `--ignore-scripts` plus SHA-pinned actions since it can publish
  @eserstack/ajan-* with provenance.
- pnpm-workspace.yaml `minimumReleaseAge: 0` and deno.json
  `minimumDependencyAge: 0` disable both age gates repo-wide to accommodate
  self-published platform packages; scope the exclusion to @eserstack/* (pnpm
  `minimumReleaseAgeExclude`) once the cited pnpm bug is fixed, so third-party
  updates keep the delay.
- compile-binaries installs cross-compilers with `sudo apt-get install`
  (distro-signed but unpinned) in the job whose output is signed and shipped;
  pin package versions or use a container image with a digest.
- JSR: only the five laroux-family packages have a publish.include; the other 40
  publishable workspace members ship every tracked file, including *.test.ts,
  scripts/ and the pkg/@eserstack/posts/.env template. Add a publish.include per
  package or a workspace-level publish.exclude for `**/*.test.ts`, `scripts/**`
  and `.env*`, and have the preflight dry-run print the file list so a stray
  fixture is visible before a tag.
- npm bundles: the generated eser, noskills and laroux manifests carry caret
  ranges for in-process native modules (koffi, lightningcss, @tailwindcss/oxide,
  tailwindcss) and ship no npm-shrinkwrap.json, so consumer installs resolve
  natives at install time. Emit an npm-shrinkwrap.json from the smoke-test
  install, or pin those four to the versions in pnpm-lock.yaml when generating
  dist/package.json.
- npm bundles: pkg/@eserstack/cli/scripts/npm-build.ts:242 hard-codes koffi
  ^2.15.0 while the workspace depends on koffi ^3.3.0
  (pkg/@eserstack/ajan/package.json:13, locked at 3.3.0). Consumers run a koffi
  major the test suite never exercises; derive the range from ajan/package.json
  instead of hard-coding it.
- npm bundles: pkg/@eserstack/noskills/scripts/npm-build.ts generates a manifest
  with no dependencies although the bundle externalizes koffi, @eserstack/ajan-*
  and @eserstack/ajan-wasm; any noskills code path that reaches the FFI loader
  will fail on a consumer install. Either declare the same optionalDependencies
  as eser or prove no FFI path is reachable from the noskills entry.
- Nix flake: even before the candidate above is validated, dropping flake-utils
  for nixpkgs.lib.genAttrs removes a third-party Nix-code input entirely, and
  committing flake.lock gives the repository a reviewable diff for nixpkgs
  updates.
- etc/scripts/update-nix-hashes.ts:42-53 and
  etc/scripts/update-homebrew-formula.ts:253-258 derive distribution pins from
  the public release after upload; have both jobs `actions/download-artifact`
  the same run's `binary-bundle` and hash/parse from it so a pin can never bless
  a replaced asset.
- pkg/@eserstack/codebase/cli-system/handlers/update.ts:311-314 writes
  `${execPath}.new` with copyFile (truncates and follows an existing symlink)
  then chmod and rename; open the sibling with createNew/O_EXCL, lstat the
  extracted `newBinaryPath` and refuse anything but a regular file, and verify
  the extracted member list is exactly {binary, optional libeser_ajan.*} before
  copying.
- pkg/@eserstack/codebase/cli-system/handlers/update.ts:283-286 (Windows) passes
  a PowerShell script string through `-Command "..."`; @eserstack/shell's
  splitCommand (pkg/@eserstack/shell/exec/parser.ts:94-97) strips backslashes
  inside the double-quoted segment, so the path is mangled and the update always
  fails closed, and line 292 hardcodes eser.exe for noskills/laroux; use array
  interpolation
  `powershell -NoProfile -Command ${["Expand-Archive","-LiteralPath",archivePath,"-DestinationPath",tempDir]}`
  or Windows' built-in tar, and derive the exe name from app.command.
- flake.nix:4-7 has no committed flake.lock, so `nixpkgs-unstable` and
  `flake-utils` float; run `nix flake lock` and commit flake.lock so the
  toolchain that wraps the pinned binary is itself pinned.
- etc/scripts/update-homebrew-formula.ts:318-324 embeds GH_TOKEN in the clone
  URL and run() at :156-158 rethrows argv verbatim; pass the token via
  `git -c http.extraheader="AUTHORIZATION: basic ..."` from an env-provided
  value or GIT_ASKPASS, and redact argv in the error.
- JSR packages without deno.extra.json `publish.include` (all but the laroux
  family) publish every non-gitignored file including *_test.ts and *.test.ts
  fixtures such as pkg/@eserstack/codebase/validate-secrets.test.ts; add
  `publish.exclude` for test files or an include allowlist per package.
- etc/scripts/install.sh:59 uses `grep -q "${HOME}/.local/bin"` despite the
  header's no-grep rule; use the `case ":${PATH}:"` pattern from line 110-111 so
  an aliased grep cannot change the install directory decision.
- pkg/@eserstack/codebase/cli-system/handlers/update.ts:37-50 installs
  `jsr:@eserstack/cli` with `-A` for every app on the deno path; noskills and
  laroux runtime installs would be replaced by the eser CLI under their own
  name; select the package from app metadata.
- pkg/ajan/workflowfx/interpolate.go:86-109 concatenates embedded ${{ }} results
  (including changedFiles, i.e. working-tree file names) into option strings
  without shell quoting, and bridge.go:2963 then runs options["command"] under
  sh -c. A manifest step such as command: "lint
  ${{ join(changedFiles, ' ') }}" would let a file named "$(cmd).ts" execute
  cmd. Both file names and the manifest come from the same repository, so no
  trust boundary is crossed, but a shellQuote() expression helper or quoting of
  embedded values in the shell tool would remove the footgun. The TypeScript
  engine does not interpolate at all (engine.ts:163-174), so the same manifest
  behaves differently on the two paths.
- pkg/@eserstack/workflows/run.ts:250-266 never reaches the Go FFI branch from
  the CLI because module.ts:28 always passes { tools: [] }; the Go
  shellWorkflowTool also ignores fixCommand and workingDirectory that
  shell-tool.ts:45-64 honours, and run.ts does not forward --dry-run or
  positional args to Go. Either remove the FFI branch or align the option
  contract so a future re-enable does not silently change which command and
  directory a --fix run uses.
- pkg/@eserstack/noskills/manager/session-binding.ts:78 stamps
  pane.meta.sessionId into NOSKILLS_SESSION; sanitize.ts:56-60 deliberately
  keeps meta on remote newTab/newPane, and persistence.ts:832-898 builds
  `${root}/.noskills/sessions/${sessionId}.json` from that id when the agent's
  hooks call readSession/updateSessionPhase. The remote client is the
  authenticated token holder who already owns the agent pane, so this is
  same-principal, but validating the id against the generated hex format
  (persistence.ts:925-929) at the resolver would close the path-shaped env
  value.
- pkg/@eserstack/shell/exec/pty.ts:88-109 (script fallback when the native
  library is absent or ESERSTACK_PTY=script) single-quote-escapes args but
  concatenates the command name unescaped into sh -c. Every present caller
  passes a literal binary name, $SHELL or /bin/sh; quoting the command as well
  would make the fallback safe for any future caller that resolves the command
  from configuration.
- pkg/@eserstack/noskills/state/persistence.ts:494-509 readManifest returns
  noskills.command from the repository's .eser/manifest.yml unvalidated; it is
  interpolated into hook command strings (sync/hooks.ts:35-89,
  sync/adapters/kiro.ts:225-270, codex.ts:52-76, copilot-cli.ts:57-76 under bash
  -c), into a JS template literal in the generated OpenCode plugin
  (sync/adapters/opencode.ts:34) and into TOML without quoting
  (sync/adapters/codex.ts:164-172). All destinations are project-scoped files
  under the same repository, so this is same-principal today; validate command
  against a strict pattern (for example ^[A-Za-z0-9@._/ -]+$) and TOML/JS-escape
  it so a future adapter that writes outside the repository does not inherit an
  injection.
- pkg/@eserstack/codebase/commitmsg.ts:79 escapes ! as \! inside double quotes;
  bash keeps the backslash literally, so the printed `git commit -m` line
  commits a message containing a literal backslash when the model output
  contains !. Use single quotes with the '\'' idiom instead of the hand-rolled
  double-quote escaper.
- pkg/@eserstack/streams/renderers/ansi.ts:165 appends a reset only when the
  rendered string contains CSI (ESC[); OSC (ESC]) and other ESC-introduced
  sequences do not trigger it. If the renderer keeps passing raw text, at least
  strip C0/C1 controls other than LF and TAB in text spans.
- pkg/@eserstack/ai/adapters/claude-code.ts:235-285: consider a safe default for
  callers that pass no properties (for example --tools "" and
  --strict-mcp-config when the caller only needs text generation) so that
  text-only consumers such as commitmsg cannot accidentally launch a
  tool-capable agent in an untrusted checkout.
- pkg/@eserstack/ajan/ffi/resolve.ts: probe the directory of the running
  executable (Deno.execPath()/process.execPath) and the Homebrew/Nix lib
  prefixes before any cwd-derived candidate, drop the process.cwd() ancestor
  walk (keep only module-dir ancestors), and reject candidates not owned by the
  current user or writable by others; the release archive, Homebrew lib/ and Nix
  $out/lib copies are currently never consulted (Nix's
  LD_LIBRARY_PATH/DYLD_LIBRARY_PATH wrapper has no effect on a resolver that
  stats explicit paths).
- pkg/@eserstack/ajan/ffi/mod.ts: after open, call EserAjanVersion and refuse a
  library whose version does not match the package version, so a stale or
  substituted image fails closed instead of surfacing later as 'Cannot find
  function'.
- pkg/@eserstack/ajan/wasm/resolve.ts: same cwd-relative shape as the native
  resolver (cwd module-dir fallback, ${cwd}/pkg/@eserstack/ajan/dist/,
  ${cwd}/node_modules/@eserstack/ajan-wasm/); impact is confined by the WASI
  shim but the search order should mirror whatever fix lands for resolve.ts.
- pkg/@eserstack/ajan/bridge.go:4754,4870 and the shellfx/aifx reader
  goroutines: add a deferred recover() that converts a panic into an error item
  on the stream channel; today only the export thread is guarded, so a panic in
  a spawned goroutine aborts the Deno/Node/Bun host process.
- pkg/@eserstack/ajan/bridge.go:2963 shellWorkflowTool: accept an argv array
  form for workflow steps (or document that step commands are shell strings) so
  manifest authors are not forced through sh -c; runs only on explicit
  `eser workflows run`, same principal as manifest scripts.
- pkg/@eserstack/cli/scripts/compile.ts:131-135: fail the release compile when
  the Go library is missing for a target that needsNativeLib, so a binary that
  silently falls back to cwd/system probing cannot ship.
- pkg/@eserstack/cli/main.ts:97 uses `commandName in scripts`, which matches
  inherited Object.prototype keys; `eser constructor` or `eser toString` crashes
  with a TypeError from scripts.ts:133 instead of reporting an unknown
  subcommand. Use Object.hasOwn(scripts, commandName).
- pkg/@eserstack/cli/scripts.ts:125 and :152-153 splice the CLI exec path,
  main.ts path and the operator's extra argv unquoted into a `sh -c` string; a
  space or metacharacter in the install path or an argument breaks the command.
  Single-quote each spliced token (same principal, so robustness only).
- pkg/@eserstack/shell/exec/parser.ts: an interpolation placed inside literal
  quotes in the template (exec`cmd "${v}"`) is re-tokenized; the sandbox check
  shows `x" y` becomes two argv entries. Detect an interpolation landing inside
  an open literal quote and throw, or document that interpolations must be bare
  tokens.
- pkg/ajan/kitfx/applier.go:18-24 and
  pkg/@eserstack/kit/recipes/recipe-applier.ts:72-90 are lexical containment
  checks; a directory symlink already present in the target project is followed
  on write. Resolve each component with Lstat/EvalSymlinks (or open with
  O_NOFOLLOW) before writing.
- pkg/ajan/kitfx/types.go ApplyOptions lacks SkipPostInstall, so `eser kit add`
  and `eser kit update` cannot skip post-install at all and clone/new must
  bypass the native path to honour --no-post-install. Add the field, thread it
  through bridge.go, and forward `local`/`skipPostInstall`/`noInstall` from
  every handler.
- pkg/@eserstack/ajan/bridge.go:3703-3741 native clone fetches
  eser-registry.json and applies Recipes[0] while
  pkg/@eserstack/kit/recipes/handlers/clone-recipe.ts:110-127 evaluated
  eligibility against recipe.json; the recipe that runs can differ from the one
  checked. Make both paths read the same file.
- pkg/ajan/kitfx/fetcher.go:113 and
  pkg/@eserstack/kit/recipes/registry-fetcher.ts:168 accept plaintext http://
  registries; require https unless an explicit --allow-insecure-registry flag is
  given.
- pkg/ajan/kitfx/fetcher.go:169-171,346-353: the default (local) file provider
  reads any path, including absolute paths, from `source` relative to the
  process cwd rather than the manifest directory, so a remote manifest can copy
  arbitrary local files into the project. Resolve local sources relative to the
  manifest directory and contain them.
- pkg/@eserstack/kit/recipes/handlers/add-recipe.ts:138 maps the Go 'registry
  manifest not found' error to RecipeNotFound, so the native path never falls
  back to the default eser/stack registry; only an ancestor .eser/recipes.json
  or --registry works. Distinguish ErrRegistryNotFound from ErrRecipeNotFound
  and fall back to the documented default.
- pkg/@eserstack/shell/env/executable.ts:37 treats a null stat mode as
  executable; on a runtime that omits mode this is fail-open. Prefer an explicit
  access(X_OK) probe where available.
- pkg/@eserstack/laroux-server/adapters/react/html-shell.ts:78,111 interpolate
  lang into the <html> attribute without escapeHtml; no in-repo caller passes a
  request-derived value, but the port accepts arbitrary strings, so apply
  escapeHtml there.
- pkg/@eserstack/laroux-server/runtime/html-shell.ts:215-217 and
  runtime/server.ts:106-108 embed the chunk manifest in an executing <script>
  with no escaping at all; content is build output, but a </script or <!--
  inside a module id would break every page, so use the same \u003c encoding as
  the fix above.
- pkg/@eserstack/laroux-server/adapters/react/rsc-handler.ts:123 sets
  Access-Control-Allow-Origin: * on /rsc responses that are rendered with the
  request's cookie header (renderer.ts:106-125); browsers refuse credentialed
  reads with the wildcard so there is no cross-origin read today, but dropping
  the wildcard removes the dependency on that browser rule.
- pkg/@eserstack/noskills-web/server.ts:179-181 and templates/layout.ts:19-21
  hand the per-process token to any GET / without checking the Host header; a
  DNS-rebound hostile origin could read the token, and only the Origin allowlist
  (auth.ts:80-91) stops it from using /mux or the mutating routes. Validate Host
  against the same loopback set to remove the disclosure.
- pkg/@eserstack/noskills-web/auth.ts:86-88 treats an empty Origin header value
  like a missing one; browsers never send an empty value, so accept only a
  missing header.
- pkg/@eserstack/noskills-web/auth.ts:137-141 accepts NOSKILLS_WEB_TOKEN of any
  length and entropy; enforce a minimum length so an operator-supplied token
  cannot be trivially guessable.
- pkg/@eserstack/mux/engine/reducer.ts:370-395 applies a paneExited action from
  a remote client by removing the pane from state without killing its PTY
  (server.ts:122-126 only calls host.forget on a real exit), leaving an orphaned
  process until dispose; only the host emits paneExited, so drop it in
  sanitizeRemoteAction (engine/sanitize.ts) alongside the spawn fields.
- pkg/@eserstack/noskills-web/routes/api.ts:76-87 and routes/pages.ts:44-54
  build spec paths from the URL spec name with no validation; WHATWG URL
  normalization removes dot segments and %2F stays undecoded so traversal is not
  reachable, but a slug check like the daemon's validateSlug would make the
  guarantee explicit.
- The outer catches that send message only (rsc-handler.ts:96-100,
  ssr-renderer.ts:719-723) and the fixed E chunk values after remediation still
  forward the raw exception message; in serve mode prefer a generic message plus
  a correlation id (LarouxError already carries correlationId in
  error-formatting.ts) and keep the real message in the log.
- runtime/server.ts:461-484 registers GET /rsc with
  Access-Control-Allow-Origin: * (rsc-handler.ts:123) in every mode; any
  cross-origin page can read the flight payload, so whatever the payload
  contains (error detail, cookie-derived content rendered by server components)
  is readable cross-site. Review whether the wildcard is needed once the client
  is same-origin.
- pkg/@eserstack/laroux-server/adapters/react/ssr-renderer.ts:714-716
  interpolates error.message into the served HTML body without escaping, and
  adapters/react/html-shell.ts:88, runtime/html-shell.ts:323-326 and
  runtime/server.ts:82 splice that string raw into the document with a 200
  response. On laroux's own paths only React's `Invalid tag: ...` and
  `Objects are not valid as a React child (found: object with keys {...})`
  messages can carry caller-supplied strings there (locally observed: the raw
  `<img src=x onerror=...>` marker lands in the html for both), and both require
  the application to use a request-derived string as an element type or as a key
  of an object rendered as a child, so no visitor path exists in this
  repository. Smallest fix: stop putting the message in HTML at all, e.g.
  `html: '<div data-ssr-error="true">SSR Error</div>'` (details already go to
  ssrLogger and to the E chunk in rscPayload), or if the message must stay,
  escape it with the same escapeHtml used by adapters/react/html-shell.ts:33-40
  (export it or duplicate the five replacements) before interpolation.
  Regression case (deno test,
  pkg/@eserstack/laroux-server/adapters/react/ssr-renderer.test.ts):
  `const r = await renderSSR(createElement('<img src=x onerror=alert(1)>', null), {}, { streamMode: 'await-all' }); assert(!r.html.includes('<img'));`
  and the same assertion for
  `createElement('div', null, { '<img src=x onerror=alert(1)>': 1 })`. Run with
  `deno test pkg/@eserstack/laroux-server/adapters/react/ssr-renderer.test.ts`
  (Deno is unavailable in this audit sandbox; the Node harness in
  agents/w3-laroux-ssr-html/artifacts/ssr-fallback-check.mjs reproduces the
  current behaviour).
- pkg/@eserstack/laroux-server/adapters/react/ssr-renderer.ts:495-533 rewrites
  every Suspense element to a Fragment before handing the tree to
  renderToReadableStream, so no Suspense boundary survives and any React
  render-time throw becomes a shell error that rejects the whole render and
  triggers the fallback div instead of a partial page; keeping the boundary (or
  wrapping the processed root in an error boundary equivalent) would confine
  render errors to their subtree.
- Smallest fix for pkg/@eserstack/laroux-server/main.ts: cache the imported
  layout and not-found modules keyed by resolved path and a build version
  counter (bump the counter in the watch callback next to
  hmrManager.notifyUpdate at main.ts:396 and in clearRoutesCache), and never
  append `?t=` in serve mode; this bounds module-map cardinality to (files x
  rebuilds), matching the moduleCache pattern already used by ApiRouteHandler
  and MiddlewareDispatcher.
- Regression case: a test that calls loadAppComponents (or getApp) N times
  without a rebuild and asserts that the same Layout function identity is
  returned every time and that no new module is evaluated (for example a
  module-level side-effect counter in a fixture layout.js stays at 1).
- The same `?t=${Date.now()}` pattern in loadRoutes (main.ts:127) and the
  actions-manifest loader (main.ts:336) is bounded (cached / once at startup)
  and is not a finding; keep it that way if the layout loader is refactored to
  share a helper.
- runtime/server.ts:323-331: add an aggregate cap before Deno.upgradeWebSocket
  (for example
  `if (hmrManager.getClientCount() >= HMR_MAX_CLIENTS) return new Response("Too many HMR clients", { status: 503 })`)
  and move the /hmr branch below the `rateLimiter.check` call so upgrade
  attempts share the per-path budget; the limiter alone would not bound held
  sockets, the cap does.
- runtime/server.ts:306,780-783: register the handler as `(req, info)` and pass
  `info.remoteAddr.hostname` into handleConnection so HMRManager can enforce a
  small per-peer limit; today no remote address reaches the handler, so no
  per-peer bound is implementable without this change.
- domain/hmr-manager.ts:45-48: on the error event call `socket.close()` in
  addition to deleting the Set entry, so handle release does not depend on the
  runtime also emitting close.
- domain/hmr-manager.ts:29-49 and runtime/server.ts:328: pass an explicit
  `idleTimeout` to Deno.upgradeWebSocket (or add an application-level heartbeat
  with a deadline) and document it; the class registers no timer, so idle
  reaping today rests entirely on the runtime's ping default, which a
  cooperative idle peer defeats by answering pongs.
- domain/hmr-manager.ts:105-110 has no caller: wire hmrManager.close() into
  server shutdown so live sockets are closed and the set is drained instead of
  relying on process exit.
- Inbound frames on /hmr sockets have no source-level size bound and no
  listener; whatever bound exists is the Deno WebSocket max message/fragment
  size (outside source). Cost is linear in attacker bytes and released on
  disconnect, so it stays hardening; the owner can confirm the runtime cap by
  sending one oversized fragmented message to a loopback fixture under
  `deno test` and observing the close code.
- server.ts:389 parses request args with `await req.json()` and spreads them
  directly into actionFn(...args) with no arity/type validation; even with
  correct module containment, restrict action arguments to a validated schema
  per action.
- The `.js` suffix is always appended (server.ts:409), so only .js targets are
  importable; still, add an allowlist of build-generated action modules so no
  filesystem path derived from a header is ever imported.
- Fix both static guards to use a trailing-separator-aware containment check (or
  path.relative not starting with '..') rather than raw startsWith, to close the
  sibling-directory prefix class in serveStatic and servePublicAsset.
- pkg/@eserstack/laroux-server/runtime/server.ts:782 replaces Deno's default
  onListen with a no-op; passing an onListen that receives the bound
  Deno.NetAddr and logging `${addr.hostname}:${addr.port}` would make the
  operator message truthful independently of the hostname fix.
- pkg/@eserstack/laroux-server/commands/dev.ts and serve.ts expose no `--host`
  flag; adding one (like Vite's `--host`) that maps onto config.server.host
  would give operators an explicit, visible way to expose or restrict the
  listener instead of relying on an undocumented default.
- pkg/@eserstack/laroux-server/README.md never mentions server.host or the bind
  address; once the fix lands, document that the default is localhost and that
  exposing to a network requires an explicit host.
- pkg/@eserstack/http/middlewares/rate-limiter.ts:222-238 - store cardinality is
  requester-chosen (one Map entry per distinct forged address and path) and
  entries are retained up to 2x windowMs; growth is linear in request count so
  it is not a finding on its own, but the store should have a hard cap with LRU
  eviction and the cleanup timer should be unref'd.
- pkg/@eserstack/http/middlewares/rate-limiter.ts:257 - pathname is part of the
  key without normalisation and laroux's fallback route renders SSR for any path
  (server.ts:574), so each distinct path (including /a, /b, //, /x?y) is a fresh
  100-request budget for the most expensive sink; consider keying by client
  only, or by route after middleware rewriting.
- pkg/@eserstack/laroux-server/runtime/server.ts:780-783 - Deno.serve is not
  given config.server.host (defaults.ts:28 says "localhost"), so laroux binds
  all interfaces regardless of the documented default; pass hostname through.
- pkg/@eserstack/http/README.md:219 - documents trustProxy default false while
  the code (rate-limiter.ts:92) defaults to true; align documentation and code
  (the code should change to false).
- pkg/@eserstack/laroux-server/options.ts - expose rateLimitConfig (or a laroux
  config section) so applications can set trustedProxies, limits and key
  generation for their deployment instead of silently receiving library
  defaults.
- pkg/ajan/noskillsserverfx/wt_attach.go:203-206 and
  pkg/ajan/acpfx/agent.go:329-332: set_permission_mode against the in-process
  shim is a silent no-op (ErrUnhandledMethod only logged). Emit a rejection
  event to the client, or hide the selector when session/new returns Modes nil
  (shim.go:137).
- pkg/ajan/acpfx/shim/claudecode.go:247-259: tool_call updates from the
  claude-code backend are emitted with status pending and never completed; map
  the vendor's tool_result/user events to a completed/failed status so a UI
  cannot present an executed tool as awaiting approval.
- pkg/ajan/noskillsserverfx/worker_acp.go:186-188: NOSKILLS_ACP_ARGS is the only
  place a permission-affecting flag (e.g. --dangerously-skip-permissions,
  --permission-mode) can enter the default path; document it as a
  security-relevant setting and log the effective vendor argv at session start.
- pkg/@eserstack/noskills/commands/invoke-hook.ts:302-306: the phase gate
  exempts any file_path containing `.eser/` or `.claude/` by substring
  (including traversal shapes such as `x/.claude/../src/a.ts` and the
  hook/permission configuration itself). The gate is workflow discipline rather
  than a security boundary (the agent may run `noskills approve` itself), but
  anchor the exemption to the resolved project root and exact directories.
- pkg/@eserstack/noskills/sync/hooks.ts:31: the PreToolUse matcher omits
  NotebookEdit, and Bash-based file writes never reach the phase gate; extend
  the matcher if the gate is meant to be exhaustive.
- pkg/@eserstack/noskills/commands/invoke-hook.ts:168,181: `allowGit` is read
  from the project's `.eser/manifest.yml`, so repository content can switch the
  git guard off for a cloned project; surface the effective value in
  `noskills status` and the synced CLAUDE.md.
- pkg/@eserstack/noskills/commands/invoke-hook.ts:65-69: a hook JSON that fails
  to parse yields {} and the hook exits without a deny; for the git guard, fail
  closed (deny) when tool_name is Bash-like but the payload cannot be parsed.
- pkg/@eserstack/shell/exec/pty.ts:88-92,100-110: quote `command` with the same
  `'...'` + `'\''` escaping used for args on both the darwin and linux branches.
  Today only the operator's PATH/SHELL and fixed adapter candidates reach it
  (remote frames lose command/args/cwd in mux/engine/sanitize.ts), so this is
  hygiene, but a resolved binary path containing a space or quote is currently
  spliced into `sh -c` and mis-parsed.
- pkg/@eserstack/shell/exec/pty.ts:109: the linux fallback passes the inner
  string to `script -qc`, which runs it through `$SHELL -c`; the single-quote
  escaping is only correct for POSIX sh. Set SHELL=/bin/sh in the child env for
  the wrapper, or run `script -qc 'sh -c ...'`, so quoting does not depend on
  the operator's login shell.
- pkg/@eserstack/noskills/manager/session-binding.ts:78: a remote
  `newTab`/`newPane` meta.sessionId overrides the daemon-supplied session id in
  the mux worker (`pane.meta?.sessionId ?? options.sessionId?.()`). With the
  persistence fix this only mislabels sessions, but the worker could prefer its
  own sid and ignore client meta for that key.
- pkg/@eserstack/mux/engine/sanitize.ts:59: `meta` is relayed verbatim from
  remote clients; consider allowlisting keys and constraining values to a short
  safe alphabet, since every consumer treats it as trusted data (env stamping
  today, possibly file names tomorrow).
- pkg/@eserstack/noskills/commands/session.ts:197-217 and next.ts:149-155: after
  the persistence fix, surface the invalid-id error to the user instead of
  silently returning null/false, so a mis-set NOSKILLS_SESSION is noticed.
- pkg/ajan/httpfx/modules/healthcheck/healthcheck.go:137-139 renders processfx
  WorkerStatus.LastError.Error() verbatim on the unauthenticated GET /health
  route, bypassing the httpfx WithSanitizedError / ExposeInternalErrors gate
  (pkg/ajan/httpfx/results.go:61-71). No shipped binary registers a supervisor,
  but any embedder who calls SetSupervisorRegistry will expose wrapped worker
  errors (connection strings, paths, panic values) to every network caller.
  Suggested change: gate the Error field on the same disclosure flag (for
  example `if status.LastError != nil && discloseErrors { ... }` via an exported
  httpfx.DiscloseErrors() accessor, or render only a fixed error class such as
  "worker_failed"), and add a healthcheck_test case asserting that a supervisor
  whose worker returns errors.New("dsn=postgres://u:p@h/db") yields an error
  field that does not contain the string when ExposeInternalErrors is false.
- pkg/ajan/httpfx/config.go:13 SkipAuthPaths is declared with a default of
  /health,/metrics,/docs,/openapi.json but is not read anywhere in pkg or cmd;
  either wire it into the auth middleware selection or remove it so operators do
  not believe it governs which routes are public.
- pkg/@eserstack/noskills-client/cert.ts:17-19,107-119 keys the IndexedDB pin
  under the constant "active" and getCertFingerprint ignores baseUrl on the
  cache hit, so a pin cached for one daemon is offered to every other daemon and
  is never refreshed after the daemon restarts (the daemon regenerates its
  self-signed leaf in memory on every Start,
  pkg/ajan/noskillsserverfx/server.go:392-393). Both effects fail closed, but a
  restarted daemon is unreachable from that browser profile until site data is
  cleared. Suggested change: key the record by baseUrl origin, and on a
  WebTransport handshake failure clear the record and retry once via
  fetchAndPinCertFingerprint; add a test asserting that
  getCertFingerprint("https://b:4433") does not return the record stored for
  "https://a:4433".
- pkg/@eserstack/noskills-client/attach.ts:187-188 passes only
  config.certHashes[0] to the WebTransport client although
  pkg/@eserstack/webtransport/client.ts:127-132 supports the full list; a caller
  supplying a rotation-overlap list [old,new] loses the second hash. Pass
  config.certHashes through unchanged.
- pkg/ajan/noskillsserverfx/doctor.go:289-300 reports on DataDir/tls/cert.pem,
  but buildCert (server.go:376-407) neither writes nor reads that file; the
  doctor check describes a persisted certificate that the runtime never
  produces. Either persist the generated leaf there (which would also make the
  client pin stable across restarts) or drop the check.
- pkg/@eserstack/noskills-client/cert.ts:125-133 hexToArrayBuffer does not
  validate that the fetched fingerprint is 64 hex characters; a malformed body
  yields a non-32-byte or partially-zero hash that the browser rejects at dial
  time. Validate /^[0-9a-f]{64}$/i after stripping separators and return null
  (or throw) otherwise so the failure is attributable.
- pkg/@eserstack/noskills-web/templates/components.ts:76 interpolates `t.phase`
  into the SSR tab label without escHtml; routes/pages.ts:26 currently always
  passes null, but the field is typed string | null, so wrap it in escHtml
  before a future caller supplies a phase.
- pkg/@eserstack/noskills-web/static/sw.js:4 says the worker is served by the
  daemon's HTTP/3 server, but only noskills-web serves /sw.js (server.ts:94) and
  the daemon has no static route; templates/layout.ts:53 fetches
  /api/cert-fingerprint from the noskills-web origin, which returns 404, so the
  store_cert_fingerprint message path is dead code there. Either remove the
  bootstrap from noskills-web or point it at the daemon origin explicitly.
- pkg/@eserstack/noskills-web/templates/layout.ts:27 loads xterm-addon-fit but
  nothing in client.js or mux-render.js references FitAddon; dropping it removes
  one unbound third-party script.
- pkg/@eserstack/noskills-web/static/mux-render.js:25-27 esc() omits the single
  quote that templates/escape.ts escapes; the sink only uses double-quoted
  attributes today, but aligning the two escapers removes a foot-gun if a
  single-quoted attribute is ever introduced.
- pkg/@eserstack/noskills-client/cert.ts:107-119 prefers the IndexedDB-cached
  fingerprint over a live fetch, so after a daemon certificate rotation the
  pinned WebTransport connection fails until the cache is refreshed; this is an
  availability nuisance rather than a trust weakening, since the cache is
  origin-scoped and written only by same-origin code.
- pkg/@eserstack/posts/adapters/cli/output.ts:14-19 always selects the ansi
  renderer and never checks whether stdout is a TTY; when piped, the output
  carries ANSI styling and remote control bytes into files and other tools. A
  `runtime` isatty check choosing renderers.plain() would reduce the piped blast
  radius but does not fix the class on its own because plain.ts:17 is also
  verbatim.
- pkg/@eserstack/posts/adapters/tui/menu.ts:575,1025,1065 print
  `@${post.authorHandle}` and output.ts:27,41 print post.id after only
  lowercase/at-stripping (handle.ts:18-22) or a pure cast (post-id.ts:22);
  provider-side character rules make these lower-risk carriers than post.text,
  but the same stripTerminalControls helper should be applied to them.
- pkg/@eserstack/shell/tui/log.ts routes tui.log.error(ctx,
  `Failed to load timeline: ${error.message}`) (menu.ts:588 and siblings)
  through the same ansi Output; provider error bodies echoed into error.message
  would be rendered unfiltered as well, so the renderer-level fix should be
  preferred over per-call-site stripping.
- pkg/@eserstack/streams/renderers/ansi.ts:165 appends ESC[0m whenever the
  output contains ESC; after control stripping this heuristic can be replaced by
  tracking whether the renderer itself opened a style.
- pkg/@eserstack/posts/.env (committed) sets
  POSTS_TOKEN_STORE_PATH=~~/.eser/posts/tokens and nothing expands '~~', so
  running eser posts login with cwd at pkg/@eserstack/posts writes live tokens
  to <cwd>/~~/.eser/posts/tokens inside the git working tree, which .gitignore
  does not cover; expand '~~' in config.ts or remove the line from the committed
  .env and add the tokens path to .gitignore.
- readStore/writeStore in file-token-store.ts stat-then-read and truncate by
  path, following symlinks; with the parent directory same-user-writable only
  this is not a boundary crossing, but the tmp+rename pattern in the remediation
  plus lstat/O_NOFOLLOW on read would match the daemon's auth.go handling and
  remove the window.
- writeStore truncates the store in place; a crash between truncate and write
  loses every platform's tokens. The daemon's auth.go uses tmp+rename for the
  same reason.
- The cross-runtime WriteFileOptions.mode is documented 'Unix only'; on Windows
  the token file inherits the profile ACL. Documenting that the store relies on
  the profile ACL there, or using a per-user protected location, would make the
  platform difference explicit.
- pkg/@eserstack/posts/adapters/cli/commands/login.ts:62 tells the operator to
  run `eser posts login-callback --platform=... --verifier=... --code=...`, but
  no `login-callback` command is registered in module.ts or
  adapters/cli/commands/mod.ts, so the non-interactive Twitter login cannot
  complete; it also prints the PKCE code_verifier to stdout, where shell history
  and terminal logs may retain it. Either register the command or remove the
  instruction, and avoid echoing the verifier.
- pkg/@eserstack/posts/adapters/tui/callback-server.ts:60-66: on the Deno branch
  the 120 s timer is armed before Deno.serve; if Deno.serve throws (for example
  AddrInUse when another local process already holds the port), the timer is
  never cleared and later rejects the orphaned callbackResult promise with no
  handler attached, which Deno treats as an unhandled rejection. Move the timer
  after a successful bind or clear it in a catch. Owner check (sandbox lacks
  Go/Deno toolchain image; local plan requires owner to run
  `deno test --allow-net` with a fixture that pre-binds the port with
  Deno.listen, calls waitForOAuthCallback on it with a short timeout, catches
  the rejection and waits past the timeout while listening for the
  unhandledrejection event).
- pkg/@eserstack/posts/adapters/tui/menu.ts:273-276 derives only the port from
  TWITTER_REDIRECT_URI and never the host; when the receiver is fixed to bind
  explicitly, derive the bind host from the redirect URI as well and map
  `localhost` (used by the committed pkg/@eserstack/posts/.env) to 127.0.0.1 so
  the bind and the redirect stay on the same loopback family. Using a random
  ephemeral port per attempt (as gh and gcloud do) and inserting it into
  redirect_uri would also remove the predictable-port precondition where the
  provider allows loopback ports to vary.
- pkg/@eserstack/posts/adapters/tui/callback-server.ts:110-126: on the node
  branch a keep-alive connection that is already open when server.close() runs
  can still deliver a later request, which then receives the success page while
  resolveCallback is a no-op; after the fix, respond 400 to any request once the
  flow has resolved and call server.closeAllConnections() before resolving.
- pkg/@eserstack/config/dotenv/loader.ts:81 runs decodeURIComponent over the
  entire .env text before parsing: a value such as `PASSWORD=100%` throws
  URIError and aborts every `eser posts` command run in that directory, and
  `%00` injects a NUL byte into path values; drop the decode or apply it per
  value with a try/catch.
- pkg/@eserstack/config/dotenv/loader.ts:139,156,170 use
  ENV/APP_ENV/DENO_ENV/NODE_ENV verbatim in the `.env.${envName}` file name with
  no character restriction (same-user environment, so hardening only): restrict
  to [A-Za-z0-9_-].
- pkg/@eserstack/posts/adapters/cli/wiring.ts never calls validateConfig
  (config-validation.ts) despite the module comment asking for it; wire it in
  and extend it with the URL/path checks.
- The posts CLI prints nothing about which .env files were loaded or which hosts
  it will contact; `eser posts status` could show the resolved token-store path
  and API base URLs so an operator can notice an override.
- TWITTER_REDIRECT_URI from a cwd .env is placed in the authorization URL
  (twitter/auth-provider.ts:86) and the token exchange (108); the provider's
  registered-redirect check bounds the harm, but the value should still be
  restricted to loopback http or https.
- pkg/ajan/acpfx/host_terminal.go:130-183: Host.CreateTerminal spawns
  req.Command/req.Args with no daemon-side gate; the permission ledger only
  records decisions for prompts the agent voluntarily raises via
  session/request_permission. The architecture summary's statement that
  terminal/create is 'gated by the permission ledger' is not true in source. If
  the daemon is meant to be the enforcement point, require an approved
  toolCallId whose rawInput matches the command before exec.
- pkg/ajan/acpfx/jsonrpc.go:383-384: deliverReply's `reply <- msg` can block the
  single read loop forever when a duplicate reply for the same id arrives after
  Call left its select on ctx.Done but before the deferred delete; use a
  non-blocking select with a default branch.
- pkg/ajan/acpfx/jsonrpc.go:278, pkg/ajan/acpfx/shim/claudecode.go:115,
  pkg/ajan/acpfx/shim/jsonl.go:79: no per-frame or per-line cap on decoded JSON;
  a runaway agent or vendor CLI event grows daemon memory for every session.
  Wrap the reader in a bounded frame reader (for example 64 MiB) and fail the
  connection or turn past it.
- pkg/ajan/acpfx/host.go:268-276: readSlice buffers an entire line via
  ReadString before comparing against MaxReadBytes, so a single very long line
  defeats the cap's memory intent; read with a limited reader or ReadLine.
- pkg/ajan/acpfx/host.go:316: WriteTextFile has no regular-file check; writing
  to a FIFO or device inside a root blocks the handler goroutine. Open with
  O_NOFOLLOW where available and stat before writing.
- pkg/ajan/noskillsserverfx/worker_acp_permission.go:88-92: the client decision
  `allow` falls back to the agent's allow_always option when no allow_once is
  offered, so a one-time approval can become a persistent grant; prefer cancel
  in that case or expose the agent's option ids to the client.
- pkg/ajan/noskillsserverfx/permissions.go:119-145 with wt_attach.go:257-270: a
  permission_response for an unknown or already-consumed request id is still
  journalled as a write-class decision, so two clients answering the same prompt
  produce two possibly contradictory permission_decision lines while only the
  first is enforced; reject and broadcast permission_response_rejected when
  take() returns no pending tool.
- pkg/ajan/noskillsserverfx/wt_attach.go:136: bufio.Scanner's default 64 KiB
  token limit ends the attach loop on a long client line and the client is told
  session_ended although the worker still runs; call scanner.Buffer with an
  explicit larger cap or read with bufio.Reader.
- pkg/ajan/acpfx/host.go:165: a session root of '/' produces the prefix '//' and
  denies every path except '/' itself; harmless but worth an explicit guard so a
  misconfigured root fails loudly.
- pkg/ajan/acpfx/shim/vendor.go:60-64 spawns the vendor with no Env, so
  exec.go:71-73 inherits the daemon's full environment (provider API keys read
  by aifx/config.go, NOSKILLS_* values). Pass an explicit allowlisted
  environment (PATH, HOME, the one provider key the backend needs, TERM) so a
  hook or tool run from the repository cannot read unrelated daemon secrets.
- Consider also passing `--strict-mcp-config` (and no `--mcp-config`) so a
  repository `.mcp.json` cannot register MCP servers into the headless run, and
  `--disallowedTools` for tools the daemon does not mediate; keep
  NOSKILLS_ACP_ARGS as an operator override rather than the only place such
  flags live.
- The Kiro (kiro.go:80-82) and OpenCode (opencode.go:69-71) backends have the
  same contract and read their own project-scope configuration from cwd; apply
  the equivalent restriction per vendor when the Claude Code fix lands so
  shimBackend's three paths stay equivalent.
- shim_test.go:289 asserts only the base stream-json flags; add an argv snapshot
  test per backend so a removed restriction flag fails CI.
- pkg/ajan/configfx/envparser/envparser.go:310-328: variable expansion has no
  output bound. Each `${NAME}` copies the full expanded value of NAME, and later
  lines can reference earlier ones, so a ~300-byte file with 8 references per
  line over 8 lines expands to 8^8 times the seed value before any caller cap
  applies (godotenv shares this). In-repo callers only parse operator-owned
  files; cap the expanded value length (or total map size) and error past it.
- pkg/ajan/configfx/envparser/envparser.go:342-355 with
  manager_resources.go:32-52: `${NAME}` never consults the process environment
  (FromSystemEnv is applied after the file), so `${HOME}` in .env expands to an
  empty string, unlike godotenv. Document it or resolve from os.LookupEnv as a
  last resort so operators do not silently get blank values.
- pkg/ajan/connfx/adapter_otlp.go:332-344: OTLP export defaults to plaintext
  (`insecure` true) unless `tls: true` or a typed `insecure: false` property is
  set; default to TLS and require an explicit opt-in for plaintext.
- pkg/ajan/connfx/config.go:30 `ca_file` (ConfigTarget.CAFile) is parsed but
  never applied by adapter_http.go or adapter_redis.go, so operators with a
  private CA are pushed toward `tls_skip_verify`; load it into
  tls.Config.RootCAs in both adapters.
- pkg/ajan/httpfx/middlewares/rate_limit_middleware.go:123-125: the loopback
  carve-out disables limiting for any key equal to 127.0.0.1/::1/localhost. With
  the default key function this is the ResolveAddress result; behind a trusted
  proxy that does not overwrite X-Forwarded-For, client_ip.go:141-149 returns
  the client-supplied hop (hops[0] when every hop is trusted), letting a remote
  client pick a loopback key. Remove the carve-out or make it opt-in and only
  for the socket peer. Also `globalRateLimiters` (197-206) is keyed by the
  config pointer, so instances are never shared, the map never shrinks, and each
  instance leaks a cleanup goroutine.
- pkg/ajan/httpfx/middlewares/auth_middleware.go:23-24: ErrJWTSecretNotSet is
  declared but never enforced; AuthMiddleware("") builds an HMAC verifier with
  an empty key and whether jwt v5.3.1 rejects zero-length HMAC keys is library
  behaviour, not a repo control. Panic or return an error for an empty secret at
  construction.
- pkg/ajan/httpfx/middlewares/csrf_middleware.go:72-75: the CSRF cookie defaults
  to Secure=false and SameSite=Lax; callers serving over TLS should pass
  WithCsrfSecure(true), and the default could follow the request scheme.
- pkg/ajan/lib/crypto.go:18-19,41: the generated self-signed daemon certificate
  is RSA-2048 with 365-day validity, while browser WebTransport
  serverCertificateHashes accept only ECDSA (P-256) certificates valid for at
  most 14 days. The browser pin path in noskills-client cert.ts therefore cannot
  work against the generated certificate, pushing operators to manual trust
  exceptions; generate an ECDSA P-256 cert with <=14-day validity and rotate.
- pkg/@eserstack/noskills-client/cert.ts:72-101: the pin is trust-on-first-use,
  fetched over the same origin it protects and cached in IndexedDB without an
  out-of-band confirmation; surface the fingerprint printed at daemon startup in
  the UI for comparison. The `cert_rotating` event (types.ts:260-263) is
  documented for clients but the daemon never emits it, so rotation currently
  means a stale pin and a hard failure.
- pkg/ajan/httpfx/uris/clean_path.go is dead code (no non-test caller); routing
  relies entirely on net/http ServeMux normalization. Either wire CleanPath into
  the router or delete it so nobody assumes it runs on requests.
- pkg/ajan/configfx/envparser/envparser.go:110-122: extractKeyName formats the
  whole remaining file with `src=%q`. One malformed statement puts every later
  `KEY=value` line into err.Error(), which manager_resources.go:25/39,
  csfx/build.go:20, bridge.go:2232/3481/3505 and
  config/adapters/ffi/loader.ts:44 all preserve verbatim. Fix: report position
  and the offending token only, e.g.
  `fmt.Errorf("%w (char=%q, offset=%d)", ErrUnexpectedChar, char, i)` and
  `fmt.Errorf("%w (line starts %q)", ErrKeyNameNotFound, firstLine(src))` where
  firstLine cuts at the first newline and caps at 32 bytes; apply the same cap
  to extractQuotedVarValue:224-228, which today prints the entire unterminated
  value. Also delete the unreachable ErrZeroLengthString branch at
  locateKeyName:140-146. Regression (owner runs, Go is unavailable in this
  audit): add to pkg/ajan/configfx/envparser/envparser_coverage_test.go a case
  that parses `BAD-KEY=x\nDB_PASSWORD=hunter2\n` with ParseBytes, requires
  errors.Is(err, ErrUnexpectedChar) and
  `!strings.Contains(err.Error(), "hunter2")`; plus `PW="open\nNEXT=secret2`
  requiring the ErrUnterminatedQuotedValue text not to contain `secret2`; run
  `go test ./pkg/ajan/configfx/envparser/ -run TestParse`.
- pkg/ajan/connfx/adapter_pgx.go:56-61 and 74-79, adapter_sql.go:47-53: drop the
  `dsn=%q` verb and argument. pgx already returns a password-redacted
  ParseConfigError (jackc/pgx/v5@v5.11.0 pgconn/errors.go:137-143), so the
  wrapper currently undoes the library's redaction; database/sql errors never
  include the DSN. If a hint is wanted, format a redacted form (net/url Parse,
  then u.User = url.User(u.User.Username())) or only the protocol and host.
  registry.go:179-185 then logs a clean message without change. Regression for
  the owner: in pkg/ajan/connfx a table test that calls
  NewPgxConnectionFactory("postgres").CreateConnection(ctx, &ConfigTarget{DSN:
  "postgres://u:hunter2@localhost/db?pool_max_conns=abc"}) and
  NewSQLConnectionFactory("nosuchdriver").CreateConnection(ctx,
  &ConfigTarget{DSN: "u:hunter2@tcp(127.0.0.1)/db"}), asserting the error is
  non-nil and `!strings.Contains(err.Error(), "hunter2")`; run
  `go test ./pkg/ajan/connfx/ -run TestCreateConnection_RedactsDSN`. Neither
  path opens a socket (the pgx case fails in ParseConfig; the sql case fails on
  the unknown driver).
- Cross-unit note for the same-principal boundary: the only way a lower-trust
  party reads either error text today is the ACP agent executing an `eser`
  command through terminal/create after the operator approves it (peer-owned
  permission ledger). That approval already covers reading the file, so it is
  not a separate invariant failure; the two fixes above close the leak
  regardless.
- pin_auth_middleware.go:55-63 accepts ?token= on every route, not only on the
  RouteRaw WebTransport CONNECT that needs it; gate the query fallback on
  ctx.IsRaw (or the /attach/ prefix) so REST tokens are never placed in URLs
  that proxies, shells or histories may record, and make handleLogout
  (auth_handlers.go:80-90) prefer the Authorization header.
- auth.go:288-297 never evicts attempts entries; add a sweep that drops records
  whose window is empty and lock expired, or cap the map and evict oldest, so a
  long-running daemon on an exposed port does not accumulate one record per
  distinct source address for its lifetime.
- auth.go:76-80 totalFails never decays: after ten lifetime failures an address
  is re-locked for five minutes on every single further failure until a success
  or restart, so a neighbour behind the same NAT can keep the operator's address
  permanently throttled; count failures within a window instead of for life.
- server.go:145 installs CorsMiddleware with the wildcard default; the daemon
  serves one known browser client, so configure WithAllowOrigin with that origin
  so cross-origin pages cannot read responses even when a token leaks into a
  page.
- pin_auth_middleware.go:27-29 passes every route when no PIN is set; that mode
  is dead for `noskills-server start` but live for embedders (server_test.go
  starts without a PIN). Restrict the pre-setup pass-through to POST /auth/setup
  so a library user cannot expose the whole API by forgetting to set a PIN.
- server.go:129 ignores the fallback constructor's error; if <tmp>/auth.json is
  also unparsable authManager is nil and main.go:124 panics on the first method
  call. Pair with the tempdir candidate: fail closed on a corrupt store rather
  than substituting a second store.
- auth.go:128 SetupPIN's comment refers to RevokeAllTokens, which does not
  exist; there is no HTTP or in-process revocation of tokens other than the
  per-token logout, and Logout (auth_handlers.go:77-101) lets any token holder
  remove any other token whose value they know rather than only their own.
- auth.go:214 runs bcrypt at cost 12 against an empty PINHash when a PIN has not
  been set (embedder pre-setup): CompareHashAndPassword returns quickly for a
  malformed hash, but the error text 'invalid PIN' hides that no PIN exists;
  return a distinct error so operators notice a daemon running without setup.
- Validate the spec {name} path parameter at the handler (reuse validateSlug or
  an equivalent [a-z0-9-] canonical-form check) in
  pkg/ajan/noskillsserverfx/specs.go before passing it to noskillsfx read/write
  helpers, so path containment does not depend solely on net/http.ServeMux
  canonicalization. The same guard should apply to the {sid} segment used in
  ledgerPath (sessions.go:168 / ledger.go:176).
- Add defense-in-depth containment in noskillsfx (ledger.go LedgerFile and
  persistence.go SpecStateFile): after filepath.Join, verify the result stays
  under the project's .eser/.state tree, rejecting '..' escapes regardless of
  caller.
- Consider a scheme allowlist in validateGitURL
  (pkg/ajan/noskillsserverfx/projects.go): file:// and internal http(s)/ssh
  targets are currently accepted; even though the caller is the single
  high-trust token-holder, restricting to https/ssh reduces accidental
  SSRF/local-file cloning.
- Keep Config.ExposeInternalErrors at its default false in any daemon
  deployment: enabling it makes git clone CombinedOutput (repo names, internal
  paths, host errors) reflect in the HTTP error body via WithSanitizedError
  (results.go:63-73).
- Validate the push subscription Endpoint URL in handleSubscribe
  (push.go:356-384) against internal/link-local ranges to blunt the
  webhook-as-SSRF vector should the single-token trust model ever be widened.
- worker.go SpawnWorker: accept-first-wins with no peer verification and no
  binding to the spawned child. Pass the channel via a socketpair on
  cmd.ExtraFiles (removing the filesystem socket entirely) or verify the
  accepted peer's uid/pid (SO_PEERCRED on Linux, LOCAL_PEERPID/LOCAL_PEERCRED on
  macOS) against cmd.Process.Pid. Same-user only today, so not a finding.
- worker.go:182-183: os.MkdirAll(runtimeDir, 0o700) does not repair a
  pre-existing weaker mode; only doctor.go:246-279 chmods it. Have SpawnWorker
  Stat and Chmod the runtime dir to 0700 and chmod the socket to 0600 after
  Listen, so a stale 0755 runtime dir plus a permissive umask cannot expose the
  socket to other local users.
- worker.go:205-208: the mux worker inherits the daemon's full environment
  (provider API keys included) because cmd.Env is unset, and the worker then
  spawns a PTY for the client. Pass a minimal environment (PATH, HOME, TERM, the
  NOSKILLS_* it needs).
- service_install.go:90-95 applyServiceVars substitutes {{BIN}} and {{HOME}}
  with no XML escaping for the plist and no quoting for systemd ExecStart, so a
  binary or home path containing &, <, spaces or % produces a malformed or
  misparsed unit. Escape for XML and wrap ExecStart in double quotes;
  operator-controlled input, so not a finding.
- worker.go:177-178 resolves mux-worker.ts from filepath.Dir(os.Executable())
  without EvalSymlinks (BinPath does resolve), so under a Homebrew symlink the
  daemon looks for the script in the link directory rather than beside the real
  binary; document the expected shipping location or resolve the symlink
  consistently.
- The NOSKILLS_MUX_WORKER_PATH, NOSKILLS_WORKER_RUNTIME, NOSKILLS_ACP_COMMAND
  and NOSKILLS_ACP_ARGS overrides are honoured from the daemon's environment
  under launchd/systemd --user with no unit-level pinning; document that only
  the same user's session environment can set them, or add explicit
  EnvironmentVariables/Environment= entries so the installed service ignores
  ambient overrides.
- Apply the existing isSafeSessionID guard (worker_acp_session.go) inside
  ledgerPath (or at the wt_attach/fork/lineage handlers) exactly as
  acpResumePath does, so every (root, sid)->path join is uniformly rejected for
  non-[A-Za-z0-9_-] sids; the smallest fix is to have ledgerPath return "" / an
  error for unsafe sid and have openLedger, readForkMeta, replayLedgerFile and
  buildLineage treat that as not-found.
- Correct the misleading nolint comment at ledger.go:47 ('path from ledgerPath
  helper, not user input'): sid originates from the request path and is
  attacker-influenced, as the sibling worker_acp_session.go comment already
  documents.
- Consider wiring httpfx/uris CleanPath (already present, currently unused) into
  the daemon middleware chain, or validate {sid} centrally, so no future
  sid-consuming sink silently inherits the same unguarded join.
- worker_acp.go acpAgentCommand: resolve NOSKILLS_ACP_COMMAND once at daemon
  start with exec.LookPath and reject or filepath.Abs a relative value
  containing a separator, and log the resolved absolute path; today the spawn
  (Dir-relative), the diagnostic at worker_acp_connect.go:51
  (daemon-cwd/PATH-relative) and doctor.go:157-165 (doctor-cwd/PATH-relative)
  use three different resolution rules for the same string.
- worker_acp_connect.go: spawn the external agent with a neutral process cwd
  (for example DataDir/runtime) and rely on ACP session/new Cwd for the
  repository root; spawn.go:37-39 already separates the two concepts and no
  agent needs the process cwd to be the repository for correctness.
- worker_acp_connect.go / acpfx.Spawn: pass an explicit allowlisted Env (PATH,
  HOME, LANG, TERM, TMPDIR plus operator-listed provider variables) instead of
  inheriting the daemon environment; this is the same newCommand behaviour the
  shim path record (acpfx/shim/claudecode/repo-settings-sources-unrestricted)
  traced, and one bounded-environment helper in shellfx/exec would serve both
  spawn sites.
- cmd/noskills-server/README.md:95 and the ErrACPAgentMissing text: state that
  NOSKILLS_ACP_COMMAND must be a bare name on PATH or an absolute path, and that
  flags such as `--acp` belong in NOSKILLS_ACP_ARGS; the README's `gemini --acp`
  example reads as a single command string that acpAgentCommand would hand to
  LookPath verbatim.
- projects.go handleAddProject: record whether a project was git-cloned from a
  third-party URL and surface that provenance to the attach path so the daemon
  (or a future trust prompt in the client) can require an explicit operator
  acknowledgement before the first agent process starts inside a cloned
  repository.

## 6. Coverage summary

Ledger units: 92. Covered: 55. Candidate: 37. Blocked: 0. Deferred: 0. Out of
scope: 0. Not applicable: 0.

Records: 13 confirmed, 23 needs validation, 3 rejected (kept in findings.json so
a later run does not repeat an unsupported claim), 1 merged into a sibling
fingerprint.

Companions selected: SUPPLY-CHAIN-AND-RELEASE.md, WEB-PROTOCOL-AND-AUTH.md,
AI-AND-LLM.md, DESKTOP-MOBILE-AND-LOCAL-IPC.md, MEMORY-SAFETY-AND-BINARY.md,
RESOURCE-EXHAUSTION-AND-AVAILABILITY.md, PROTOCOLS-RPC-AND-MESSAGING.md,
CLIENT-SIDE.md. Not selected: CLOUD-AND-DEPLOYMENT.md (no cloud IAM, Kubernetes
or Dockerfile in the tree) and DATA-ISOLATION-AND-LIFECYCLE.md (single-tenant
local state).

Critic passes, in order: c01-postwave-1 accepted 11 new units and 0
reassignments; c02-postwave-2 accepted 5 new units and 0 reassignments;
c03-postwave-3 accepted 1 new unit and 0 reassignments; c04-postwave-4 accepted
0 new units and 0 reassignments; c05-final-clean accepted 1 new unit and 0
reassignments; c06-postwave-5 accepted 1 new unit and 0 reassignments;
c07-postwave-6 accepted 2 new units and 0 reassignments; c08-postwave-7 accepted
1 new unit and 0 reassignments; c09-postwave-8 accepted 2 new units and 0
reassignments; c10-postwave-9 accepted 2 new units and 0 reassignments;
c11-postwave-10 accepted 0 new units and 0 reassignments; c12-final-clean
accepted 0 new units and 0 reassignments. The last one, c12-final-clean, is the
distinct final-clean pass and returned stop with no accepted work, which is the
condition for closing the hunting loop.

Every confirmed and needs_validation record passed an independent Phase 5
verification. 4 records received a non-material correction (wording or
repository-line citations) that a fresh verifier applied without changing
verdict, trace, impact or severity:
`laroux-server/runtime/server/rsc-action-import-no-distdir-containment`,
`laroux-server/runtime/server/static-asset-prefix-check-missing-separator`,
`laroux-server/main/load-app-components-per-request-cache-bust-import`,
`posts/config/cwd-dotenv-endpoint-and-token-path`. One replacement that narrowed
a needs_validation trace was re-verified by a second fresh verifier before it
was applied. Rejected fingerprints, mentioned only to explain coverage
decisions: `acpfx/shim/jsonl/generic-text-provenance`,
`flake.nix/inputs/unlocked-branch-refs-no-flake-lock`,
`posts/config/tilde-token-store-path-in-committed-dotenv`.
