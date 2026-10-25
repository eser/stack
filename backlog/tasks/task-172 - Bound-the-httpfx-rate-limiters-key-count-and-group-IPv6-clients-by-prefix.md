---
id: TASK-172
title: Bound the httpfx rate limiter's key count and group IPv6 clients by prefix
status: Done
assignee: []
created_date: '2026-10-05 00:58'
updated_date: '2026-10-15 19:34'
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
- [x] #1 The limiter holds at most a configured number of keys per handler, with a safe default, and the behavior at the limit is documented
- [x] #2 IPv6 client addresses are keyed by a prefix, with the length documented
- [x] #3 Tests cover the limit and the IPv6 grouping
- [x] #4 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in round 3 of the autonomous backlog run (2026-10-05); deno task cli ok passes.

Verified in /Users/eser/projects/eser/stack/pkg/ajan/httpfx/middlewares/rate_limit_middleware.go. DefaultRateLimiterMaxKeys is 100,000 and WithRateLimiterMaxKeys changes it. The limit is split over min(32, maxKeys) shards with the remainder spread, so the total never exceeds maxKeys. Each request evicts the entries whose window has ended from the old end of the shard's window-start list. A new key at a full shard evicts the oldest entry. addressKey keys IPv6 by a /64 by default (WithRateLimiterIPv6Prefix, 1 to 128) and folds IPv4-mapped addresses to IPv4. The setting is read at request time, so option order does not matter. The README and godoc state the trade-off (an evicted client's count restarts). I corrected the README sentence that said the limit is always split over 32 shards: with fewer than 32 keys there is one shard per key. Tests: TestRateLimiter_HoldsAtMostMaxKeys, TestRateLimiter_EvictionOrderAtTheLimit, TestAddressKey, TestRateLimitMiddleware_GroupsIPv6ByPrefix, TestRateLimitMiddleware_InvalidKeySettings.
<!-- SECTION:NOTES:END -->
