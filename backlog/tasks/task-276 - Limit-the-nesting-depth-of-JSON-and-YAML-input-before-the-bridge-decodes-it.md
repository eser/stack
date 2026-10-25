---
id: TASK-276
title: Limit the nesting depth of JSON and YAML input before the bridge decodes it
status: Done
assignee: []
created_date: '2026-10-24 00:20'
updated_date: '2026-10-24 18:45'
labels:
  - go
  - ajan
  - security
  - wasm
milestone: m-0
dependencies:
  - TASK-273
priority: medium
ordinal: 276000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The WASM profile spike found that every WASM build traps with a V8 RangeError (stack overflow) on a first call with 5,000 to 6,000 levels of nesting. That is below encoding/json's own 10,000-level limit, and the RangeError escapes Go's recover, so the instance dies. YAML and TOML decoding recurse the same way, and natively a deep document costs a large goroutine stack.

Check nesting depth before decoding in formatfx and in the bridge's request decode, with one documented limit well below the measured trap (for example 1,000 levels), and return error JSON that names the limit. The check is a byte scan for JSON and a depth guard in the YAML and TOML decode paths. Rules: security-practices (input validation, resource bounds).

Plan key: M0-T26. Effort: small.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Go tests decode JSON, YAML and TOML one level over the limit and get an error that names the limit, and one level under it decodes
- [x] #2 On the WASM reactor, a formatDecode call with 10,000 levels returns error JSON and the next call on the same instance succeeds
- [x] #3 The limit is documented in the formatfx README and the ajan README
- [x] #4 `deno task cli ok` passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-24. formatfx/depth.go: MaxNestingDepth = 1000, ErrNestingTooDeep, CheckJSONDepth (byte scan of [ and { outside strings), CheckTOMLDepth (basic and literal strings, # comments), CheckYAMLDepth (flow brackets plus block levels from mapping keys and sequence items by indentation). The JSON, JSONL, YAML and TOML readers check before decoding; the error names the limit ('more than 1000 levels (found N); flatten the document'). The bridge's registry (callRegistered, which the WASM reactor uses) checks every argument that starts with { or [ before the function decodes it, so a deep formatEncode request is refused too. Tests: formatfx/depth_test.go decodes JSON, JSONL, TOML, flow YAML and block YAML at the limit and gets ErrNestingTooDeep one level over (brackets in strings do not count); reactor_protocol_test.go refuses a 10,000-level formatEncode request and serves the next call; wasm/loader-reactor.test.ts sends formatDecode and formatEncode with 10,000 levels to the reactor, gets error JSON naming the limit, and the same instance then answers formatList. The limit is in the new pkg/ajan/formatfx/README.md (added to the Go README list in docs/agents/documentation-and-tooling.md) and in the ajan README. deno task cli ok passed.
<!-- SECTION:NOTES:END -->
