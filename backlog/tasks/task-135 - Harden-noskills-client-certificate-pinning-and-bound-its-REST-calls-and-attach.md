---
id: TASK-135
title: Harden noskills-client certificate pinning and bound its REST calls and attach
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - noskills-client
  - security
  - robustness
dependencies: []
references:
  - pkg/@eserstack/noskills-client/cert.ts
  - pkg/@eserstack/noskills-client/attach.ts
  - pkg/@eserstack/noskills-client/client.ts
priority: medium
ordinal: 135000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
cert.ts caches one fingerprint under the constant key "active" (line 19) for every daemon and never refreshes it after a certificate change; attach.ts:190 passes only config.certHashes[0] although webtransport accepts the list; hexToArrayBuffer (cert.ts:148) does not check for 64 hex characters; and fetchAndPinCertFingerprint (cert.ts:90-122) turns network errors, non-OK statuses and bad JSON alike into null. apiGet, apiPost and apiDelete (client.ts:41-76) call fetchFn with no signal, and attachSession builds its WebTransport client without dialTimeout, so a stalled or unreachable daemon hangs the call. Rules: coding-practices: External Calls Have Timeouts, Error Handling.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The cache is keyed by baseUrl origin, every configured hash is passed, and fingerprints are validated
- [x] #2 'No fingerprint endpoint' is distinguished from a failure
- [x] #3 REST calls and attach have bounded defaults, with a longer one for registerProject with a git URL, and accept a caller AbortSignal
- [x] #4 Tests use a fake fetch and transport that never answer; the README matches
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

small-b: Checked against the code and tests:
- The cache key is new URL(baseUrl).origin.
- configuredPins passes every config.certHashes entry, and each pin is checked to be 32 bytes. Hex fingerprints must be 64 digits.
- A 404 returns null. Every other failure throws CertFingerprintError or NoskillsTimeoutError.
- Default limits: 10 s for REST calls, 300 s for registerProject with a git URL and no path, 10 s for attach, also passed as the WebTransport dialTimeout.
- CallOptions.signal and AttachOptions.signal are honored.
- Tests cover fetches and transports that never answer, and a fetch that ignores the signal.
- The README matches the code.
- The curated mod.ts re-exports every export of types, cert, client, attach and errors.
<!-- SECTION:NOTES:END -->
