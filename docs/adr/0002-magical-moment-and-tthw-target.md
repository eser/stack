# ADR 0002 — Magical Moment and Time-to-Hello-World Target

**Status**: Accepted  
**Date**: 2026-05-01  
**Deciders**: Eser Ozvataf

## Context

noskills-server needed a clear, testable user-experience target before Phase 5b distribution shipped. Without a concrete persona and a measurable first-use goal, DX decisions become guesswork and TTHW creep goes undetected.

## Decision

### Persona: Solo Indie Hacker on macOS

Single-tenant, personal laptop, side-project work. Values:
- Zero manual cert steps
- No sysadmin-style setup (no `openssl`, no `keytool`, no port-forwarding)
- "It just works in Arc/Chrome"
- Phone access to the same session

### TTHW target: Champion < 2 minutes

Competitive landscape at decision time:
- Claude CLI: ~30 s (one-shot, no persistence)
- Aider: ~2 min (Python install + API key)
- OpenInterpreter: ~2 min
- Continue: ~3 min (IDE extension, settings page)
- Clay: ~5 min (no homebrew, manual Node)
- Cursor: 5–8 min

Target: beat Aider on TTHW and win on persistence. Stretch goal < 90 s with everything optimal.

### Magical moment: "daemon survives my laptop reboot"

The differentiator no competitor delivers:
- Claude CLI: one-shot, no history
- Aider: keeps local history but loses live state on exit
- Continue: restarts on IDE close
- Cursor: restarts on app close
- Clay: localhost-only, no homebrew

noskills-server is the only Claude tool where "close laptop, open later, session continues" works. This is the claim the 4 crash-safety tests (ADR 0001 companion) verify.

### Delivery vehicle

A 60-second asciinema recording at the top of the README: `brew install → start → stream delta → close laptop → reopen → replay`. Recording is the proof; the user sees the magical moment before installing.

## Consequences

- `MkcertProvider` must work silently on first run (mkcert installs local CA, no manual trust step).
- `noskills-server doctor` must pass green on a clean macOS Sequoia install.
- 4 crash-safety tests are mandatory; they gate Phase 5b distribution.
- First-run welcome banner must keep PIN visible without scrolling.
- WebTransport cert pinning via `serverCertificateHashes` in the PWA client so phone access works without iOS CA trust gymnastics.
