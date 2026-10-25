---
id: m-4
title: "M4 noskills as a Go binary"
---

## Description

Make pkg/ajan/noskillsfx the only noskills implementation behind a static Go binary that hooks call in milliseconds, and delete the TypeScript twin.

Exit criteria:
- cmd/noskills builds for the five release targets with CGO_ENABLED=0 and passes the golden harness recorded from the TS implementation
- Generated agent hooks call the local noskills binary, with no npx or node on the hook path, and existing `npx eser@latest noskills` hooks still work
- noskills ships through every channel with Rust-triple names, replacing the forwarding stub, and a v4.5.2-named noskills archive self-updates in preflight
- The migrated TS noskills code is deleted and the gate is green
