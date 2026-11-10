---
id: TASK-384
title: 'security: close the open CodeQL alerts before 5.0.0'
status: In Progress
assignee: []
created_date: '2026-11-10 09:00'
updated_date: '2026-11-10'
labels:
  - security
  - bug
milestone: m-2
dependencies: []
priority: high
ordinal: 387000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
github.com/eser/stack had 11 open CodeQL code-scanning alerts on main before 5.0.0, all from the analysis of 2c520a07 (.github/workflows/codeql.yml, default code-scanning suites). They are to be closed by changing the code, or, for a false positive, by a narrow change that states the intent in the code; no alert is dismissed on GitHub. The CodeQL CLI 2.27.4 run locally on the tree at 667b204c reported the same findings. Each alert, its root cause and the verdict:

- #62 `go/disabled-certificate-check`, pkg/ajan/webtransport/client.go:188, and #61, pkg/ajan/httpclient/transport_http3.go:130: `InsecureSkipVerify = true` when certificate hashes are pinned (the WebTransport `serverCertificateHashes` model). False positive: the same function set `VerifyPeerCertificate` (leaf only) and `VerifyConnection` (resumed sessions), both failing closed. The query skips a write whose enclosing function name says it verifies; `buildDialerTLSConfig` and `buildH3TLSConfig` did not. webtransport had end-to-end tests of a wrong pin; the httpclient HTTP/3 transport had no test of its pin at all.
- #69 `js/incomplete-url-substring-sanitization`, pkg/@eserstack/noskills-web/templates/layout.test.ts:23: the test checked `page.includes("cdnjs.cloudflare.com")`. #60 is the same check at :19 before the line moved; GitHub already lists it as fixed. Test code, not a vulnerability; a substring of the page says nothing about the host a URL loads from.
- #59 and #56 `go/path-injection`, pkg/ajan/noskillsserverfx/projects.go:169 (`os.Stat` in `underDir`) and :240 (`os.Stat` in `resolveWorkspacePath`): the `path` field of `POST /api/projects` reached the filesystem with no root. Real: by design any directory on the machine could be registered, and the daemon then scaffolds specs into it and runs agent sessions there. The PIN is the boundary, but a workspace registered by path had no confinement at all, and the daemon listens on all interfaces.
- #65 `go/path-injection`, pkg/ajan/noskillsfx/lifecycle_commands.go:109: `pathExists(filepath.Join(root, specsDir, candidate))` in `uniqueSpecName`, with the candidate derived from the request's spec description (pkg/ajan/noskillsserverfx/specs.go:109). False positive: `SlugFromDescription` (pkg/ajan/noskillsfx/slug.go:50) keeps only `[a-z0-9-]`, which CodeQL does not see through its regexp replacements.
- #64 `go/incorrect-integer-conversion`, pkg/ajan/aifx/adapter_google_shared.go:353: `int32(opts.MaxTokens)` for Gemini and Vertex AI, with the value from `strconv.Atoi` of `eser ai --max-tokens` (cmd/eser/ai.go:303). Real: 4294967808 (2^32 + 512) was sent as 512, a value over 2^31-1 as a negative one.
- #63 `go/incorrect-integer-conversion`, cmd/eser/kit.go:780: `int(maxEntries)` after `kitLimit` (:673) allowed up to 2^53-1. Latent: it wraps only where `int` is 32 bits; every release target (pkg/ajan/codebasefx/release_artifacts.go:37) is 64-bit.
- #67 `js/stack-trace-exposure`, pkg/@eserstack/noskills-web/routes/api.ts:27: with `NOSKILLS_WEB_DEBUG_ERRORS` set, `faultResponse` (:74) sent `cause.stack`. Real, behind an opt-in: the README documents "the underlying error text", and the Go dashboard sends `err.Error()` (pkg/ajan/noskillsserverfx/dashboard.go:299); the stack adds the module paths of the process.
- #68 `js/xss-through-dom`, pkg/@eserstack/laroux-react/runtime/image/fallback.ts:94: `image.setAttribute("src", fallback)` with the fallback read from the `data-laroux-fallback` attribute. False positive in effect: the element is always an `<img>`, where a `javascript:` source does not run. The attribute was applied as raw page text, with any scheme.
- #66 `js/polynomial-redos`, pkg/@eserstack/kit/recipes/processor.ts:93: `stripTrailingSlashes` used `/[\\/]+$/` on recipe paths and ignore patterns. Real: the regex retries a run of slashes from every start position, so a path with 100 000 slashes before its last character took 8 s.

The task also covers govulncheck on both Go modules and the gosec rules of the precommit golangci-lint run.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each alert has a verdict, real or false positive, with its root cause at file:line
- [x] #2 Each real finding has a test that failed before its fix, and the fix is at the origin
- [x] #3 The certificate pin is enforced where `InsecureSkipVerify` is set, and a server whose leaf does not match the pin fails the connection, tested for both transports
- [x] #4 A workspace registered by path is confined to a root, with traversal and symlink escapes refused, tested
- [x] #5 The CodeQL CLI reports none of the alerts on the changed tree; no alert is dismissed on GitHub
- [x] #6 govulncheck on both Go modules and the gosec rules of the precommit lint report no finding in called or linted code
- [x] #7 `pnpm ok` passes
- [ ] #8 CodeQL reports no open alert on the next main run
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Certificate pins (#61, #62, AC3). In both packages the pin setup moved into `verifyLeafAgainstPins` (pkg/ajan/webtransport/client.go:199, pkg/ajan/httpclient/transport_http3.go:141), the only function that sets `InsecureSkipVerify`, and it sets it only together with `VerifyPeerCertificate` and `VerifyConnection`; `leafMatchesPin` holds the hash comparison both callbacks share. Behavior is unchanged. The function name states that it verifies, which is what `go/disabled-certificate-check` reads as intent. pkg/ajan/httpclient/transport_http3_test.go runs a real HTTP/3 server: the pinned leaf answers (`TestHTTP3RoundTripperAcceptsThePinnedLeaf`, :137); a pin for another certificate, the pinned certificate sent behind another leaf, and a self-signed server without a pin are each refused in the handshake (`TestHTTP3RoundTripperRejectsUnpinnedServers`, :153, which logs `leaf certificate matched none of the pinned fingerprints` and `certificate signed by unknown authority`); `InsecureSkipVerify` is never set without both callbacks (:205); `VerifyConnection` rejects an unpinned leaf as a resumed session presents it (:241). webtransport keeps its tests (pinning_test.go, `TestClientRejectsUntrustedServers` in client_test.go:400), which pass.

Layout test (#69): pkg/@eserstack/noskills-web/templates/layout.test.ts parses every external `src` and `href` with `new URL` and checks that the only host is `cdn.jsdelivr.net`, the CDN the CSP allows, which also rules out cdnjs.

Workspace root (#56, #59, AC4). `ServerConfig.WorkspaceRoot` (pkg/ajan/noskillsserverfx/server.go:32) defaults to the home directory (`workspaceRootOrHome`, called at :117), and `noskills-server start --workspace-root` sets it (cmd/noskills-server/main.go). The path checks moved from projects.go to project_paths.go, which keeps both files under the 500-line limit of `validate-server-loc`. `resolveWorkspacePath` (project_paths.go:139) resolves the root and the path with `EvalSymlinks`, refuses a path whose `filepath.Rel` to the root is not `filepath.IsLocal` (:163), opens the root with `os.OpenRoot` (:167), and stats the directory through it (:173), so a symlink swapped in after the check cannot escape. The DataDir check walks up through the root with `root.Stat` (`underDirInRoot`, :59) and then through the root's own ancestors, which come from configuration. With no home directory and no flag, registration by path is refused with `errNoWorkspaceRoot`; cloning by git URL is unaffected. `TestResolveWorkspacePath` (projects_test.go:138) failed first on "outside the root", "parent of the root", "traversal out of the root" and "symlink inside to a target outside", which were all registered; it now checks each refusal by its sentinel error, and accepts the root itself, a traversal that stays inside and a symlink from outside to a directory inside. `TestResolveWorkspacePathRoots` (:231) covers an unset root and a root inside the data directory. This is a behavior change: cmd/noskills-server/README.md (Workspace root), pkg/@eserstack/noskills-client/README.md and a CHANGELOG Migration item describe it. Projects already in daemon.json are not checked again.

Spec names (#65): `uniqueSpecName` (pkg/ajan/noskillsfx/lifecycle_commands.go:104) returns a candidate that does not match `specNamePattern` before it is joined into a path; `SpecNew` then refuses it as an invalid name. No candidate fails it today, so behavior is unchanged. `TestSlugFromDescriptionIsOnePathElement` (pkg/ajan/noskillsfx/slug_test.go:82) pins that the slug of traversal, absolute, backslash and NUL descriptions is one plain path element.

Gemini max tokens (#64): `applyGenAIGenerationParams` (pkg/ajan/aifx/adapter_google_shared.go:360) returns an error wrapping `ErrBadRequest` for `MaxTokens` over `math.MaxInt32`. `TestBuildGenerateContentConfigRefusesMaxTokensOverInt32` failed first (`error = <nil>` for 2147483648 and 4294967808) and checks that `math.MaxInt32` itself is sent. CHANGELOG Migration under Go: pkg/ajan/aifx.

Kit entries (#63): cmd/eser/kit.go:785 sets `opts.MaxEntries` to `math.MaxInt32` and converts `maxEntries` only when it is at most that; no tarball holds 2^31 entries, so the limit means the same on every platform. A clamp written as an `if` that reassigns `maxEntries` before the conversion still left the alert, because the conversion then reads the merged value. The wrap cannot happen on a 64-bit host, so there is no failing test; `GOARCH=386 GOOS=linux go vet ./cmd/eser` passes.

Debug detail (#67): `faultResponse` (pkg/@eserstack/noskills-web/routes/api.ts:78) sends `cause.message` for an Error, as the Go dashboard sends `err.Error()`; the stack stays in the log. A thrown value that is not an Error adds no detail, since `String(value)` is still caller-visible text CodeQL cannot tell from a stack; it is logged as before. The test "adds the error text, never the stack, as detail when debug errors are on" (server.test.ts:467) failed first with the stack and its file paths.

Image fallback (#68): `applyImageFallback` (pkg/@eserstack/laroux-react/runtime/image/fallback.ts) parses the attribute with `new URL` against the image's `baseURI`, applies it only with an `http:`, `https:`, `data:` or `blob:` scheme (:67), and sets the serialized `href` (:125). The loop guard compares resolved URLs, so an applied fallback is not applied again. `FallbackImageElement` gains `baseURI`. New cases in fallback.test.ts refuse a `javascript:` fallback and one that does not parse, and failed first; the CHANGELOG `Image` item names the rule.

Trailing slashes (#66): `stripTrailingSlashes` (pkg/@eserstack/kit/recipes/processor.ts:95) scans from the end. "takes linear time on a long run of slashes" (processor.test.ts:60) took 8137 ms and failed its 1000 ms bound before the fix, and takes about 1 ms after. The pattern side is not timed: `path.matchesGlob` refuses a pattern over 64 KiB.

CodeQL (AC5): CodeQL CLI 2.27.4 with the go-code-scanning and javascript-code-scanning suites, Go database built with `go build ./...`, JavaScript with build mode none. On 667b204c it reported the 11 open alerts at their locations and nothing else; on the changed tree it reports none. Variants of the fallback change showed that a scheme check alone does not clear `js/xss-through-dom`, and that setting the parsed URL's `href` does.

govulncheck (`pnpm cli go-vuln`, AC6): both modules report 0 vulnerabilities in called code and the one module-level finding not called that TASK-383 recorded (GO-2026-5932, `golang.org/x/crypto/openpgp`). The precommit golangci-lint run, gosec included, reports no issue in either module. No dependency, go.mod, package.json or pnpm-lock.yaml changed.

`pnpm ok` passes (AC7). AC8 needs the owner's push of these changes; the CodeQL workflow runs on push to main.
<!-- SECTION:NOTES:END -->
