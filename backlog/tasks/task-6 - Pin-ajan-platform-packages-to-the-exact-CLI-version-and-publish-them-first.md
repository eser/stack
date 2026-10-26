---
id: TASK-6
title: Pin ajan platform packages to the exact CLI version and publish them first
status: Done
assignee: []
created_date: '2026-09-17 13:43'
updated_date: '2026-09-17 13:50'
labels:
  - ci
  - release
  - ajan
dependencies: []
references:
  - pkg/@eserstack/cli/scripts/npm-build.ts
  - pkg/@eserstack/ajan/ffi/resolve.ts
  - pkg/@eserstack/shell/exec/command.ts
  - .github/workflows/build.yml
priority: high
ordinal: 6000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
npx eser . commitmsg on 2026-09-17 failed with '@eserstack/ajan native library is not available — exec.child() requires FFI'. The npx install had resolved @eserstack/ajan-darwin-arm64 to 4.1.57 (stale registry metadata in the npm cache) while the eser 4.5.1 bundle expects the 4.5.1 library: seven exports (EserAjanAiCancelRequest, the EserAjanShellPty* family) are missing from 4.1.57, so dlopen fails and every FFI-only path (exec.child, PTY, TUI keypress) throws. The eser package declares the platform packages as '^4.1.57 || ^5.0.0', which admits any older 4.x even though the TS side is compiled against one exact ABI; a stale cache or an already-installed older platform package silently produces a broken CLI. The range was chosen to dodge a publish-order deadlock (eser published before its platform packages exist), which is the real thing to fix.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The generated dist/package.json of the CLI (and any other bundle that ships platform packages) pins every @eserstack/ajan-* optionalDependency to the exact version being released
- [x] #2 The release pipeline publishes the ajan platform packages before the npm bundles (publish needs publish-ajan), so an exact pin is always resolvable by the time eser@VERSION exists
- [x] #3 The library resolver prefers the installed platform package over a monorepo dev build found relative to the working directory, so a published CLI run inside the stack checkout does not pick up a stale local build
- [x] #4 exec.child() and the other FFI-only entry points report the actual load error (missing symbol, path tried) instead of only 'native library is not available'
- [x] #5 A unit test covers the exact-pin rewrite; the preflight consumer install verifies eser ajan version reports the released version
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause confirmed: the npx install had resolved @eserstack/ajan-darwin-arm64 to 4.1.57 (stale cached packument) under eser 4.5.1; nm shows seven exports missing from 4.1.57, so dlopen failed and exec.child() threw. Fixes: (1) new @eserstack/codebase/npm-platform-packages pinPlatformPackages(), used by the CLI builder, pins every @eserstack/ajan-* optionalDependency in dist/package.json to the exact released version (npm skips an unresolvable optional dep, verified, so the pin is safe before publish); (2) build.yml: publish now needs publish-ajan, platform packages land before the bundles; (3) resolve.ts: the cwd-relative monorepo dist probe moved after the installed-package probes; (4) exec.child(), child-go, pty-go and keypress-go append describeLoadFailure() (the retained load error) to their messages; (5) unit tests for the pin, ajan-ranges.test.ts updated to the two-layer rule, preflight consumer asserts eser ajan version reports the released version when a library loads. Takes effect from the next release (4.5.2): 4.5.1 on npm still carries the range.
<!-- SECTION:NOTES:END -->
