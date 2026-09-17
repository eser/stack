---
id: TASK-8
title: 'Make the ajan platform packages workspace members linked with workspace:*'
status: Done
assignee: []
created_date: '2026-09-17 18:58'
updated_date: '2026-09-17 19:11'
labels:
  - ajan
  - release
  - build
dependencies: []
references:
  - pkg/@eserstack/ajan/npm/generate-packages.ts
  - pkg/@eserstack/ajan/scripts/build.ts
  - pkg/@eserstack/codebase/npm-platform-packages.ts
  - pkg/@eserstack/ajan/ffi/resolve.ts
  - pkg/@eserstack/codebase/ajan-ranges.test.ts
priority: medium
ordinal: 8000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Today the six @eserstack/ajan-* platform packages are generated into pkg/@eserstack/ajan/dist/npm at build time and consumed from npm: the workspace manifests of cli and ajan declare them as optionalDependencies with a floor range (^4.1.0 || ^5.0.0) because pnpm has to resolve a version that already exists on npm before the release is cut, and the published CLI manifest pins them to the exact version at build time (npm-platform-packages.ts). That is two mechanisms for one invariant — the platform library must come from the same commit as the TypeScript that loads it — plus a resolver that probes cwd-relative dev builds to make local development work. Making the platform packages real workspace members (committed package.json with name, version, os/cpu, exports; the binary gitignored and written there by build.ts) and declaring them with workspace:* gives the invariant by construction: locally pnpm links the freshly built package, and pnpm publish rewrites workspace:* to the exact version so no consumer ever sees the protocol. Portability: pnpm, Bun and Deno 2 all understand workspace:* in package.json; the npm CLI does not, but the workspace is installed with pnpm and every published manifest carries a plain version. The open questions are os/cpu filtering of optional workspace links (does pnpm link a darwin-x64 member on darwin-arm64, and what does Deno do) and how the release pipeline publishes the members.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 pkg/@eserstack/ajan-{darwin-arm64,darwin-x64,linux-arm64,linux-x64,win32-x64,wasm}/package.json are committed workspace members sharing the TS version; build.ts writes the library into the matching member and the generated dist/npm layout is removed
- [x] #2 cli and ajan declare the platform packages as optionalDependencies with workspace:*; the floor ranges, pinPlatformPackages() and the ajan-ranges guard go away, and dist/package.json still carries exact versions (verified by preflight-npm-consumer.ts)
- [x] #3 Verified and documented for pnpm, Deno 2 and Bun: a fresh checkout installs, the current-platform member is linked, non-matching os/cpu members do not break install, and eser ajan version loads the library from node_modules without the cwd-relative dev-build probe (which is then removed from resolve.ts)
- [x] #4 publish-ajan publishes the members with pnpm publish --filter and the platform packages land before the bundles as today; a dry-run of the whole chain passes in preflight
- [x] #5 Workspace validators (validate-package-configs, validate-mod-exports, filenames) accept the new members, and the JSR manifests are unaffected since the members are npm-only
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Six workspace members pkg/@eserstack/ajan-{darwin-arm64,darwin-x64,linux-arm64,linux-x64,win32-x64,wasm} with committed package.json (name, shared version, os/cpu, main, files — no exports, so gen-jsr-manifests reports them not publishable and deno publish never sees them) and README; binaries gitignored. npm/generate-packages.ts now stages dist/<target> libraries into the members instead of generating dist/npm. cli and ajan declare them with workspace:*; npm-platform-packages.ts, ajan-ranges.test.ts and the dist/npm branch of the version sync are removed; the CLI builder resolves workspace: specifiers to exact versions via the new @eserstack/codebase/npm-workspace-specifiers (tested). resolve.ts lost the cwd-relative dist probe. Pipeline: compile-binaries and publish-ajan.yml upload the members (LCA pkg/@eserstack/, so the publish loop shape is unchanged). Verified 2026-09-17 on darwin-arm64: pnpm install links all six (non-matching platforms only warn), eser codebase versions sync covers all six, deno task cli ajan version loads the library through the member, the bundle's dist/package.json carries 4.5.1 for all six, preflight passes for Node and Bun consumers, and a scratch Bun workspace with the same manifests installs and links every member. Caveat: pnpm and Bun link workspace members regardless of os/cpu (only npm consumers get the single matching package); harmless because the other members hold no binary and the resolver probes only the host's slug.
<!-- SECTION:NOTES:END -->
