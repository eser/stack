---
id: TASK-172
title: Bound the httpfx rate limiter's key count and group IPv6 clients by prefix
status: To Do
assignee: []
created_date: '2026-10-05 00:58'
labels:
  - httpfx
  - security
dependencies: []
priority: medium
ordinal: 172000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
RateLimitMiddleware keeps one entry per key until the key's window ends. The default key is the client IP, so an IPv6 client can rotate through addresses in its /64 and add millions of entries within one window. Memory is bounded only by request volume (coding-practices: Bound Every Resource; security-practices http-and-auth.md: Layered Controls). The fix needs two owner decisions: what happens when the limit is reached (reject new keys, admit them without counting, or evict existing entries, each with a different DoS trade-off), and the IPv6 prefix length used as the key. That is why it is not fixed in this run. TASK-139 removed the leaked limiters and goroutines; this is the remaining unbounded part of the same middleware.

Decisions: at most 100,000 keys per middleware by default, configurable; at the limit, entries whose window has ended are evicted first, then the oldest entry. IPv6 clients are keyed by their /64 prefix, configurable. The README states the trade-off: under a flood of new keys, an evicted client's count restarts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The limiter holds at most a configured number of keys per handler, with a safe default, and the behavior at the limit is documented
- [ ] #2 IPv6 client addresses are keyed by a prefix, with the length documented
- [ ] #3 Tests cover the limit and the IPv6 grouping
- [ ] #4 deno task cli ok passes
<!-- AC:END -->
