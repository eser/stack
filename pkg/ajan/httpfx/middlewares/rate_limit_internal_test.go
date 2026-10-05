// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package middlewares

import (
	"hash/maphash"
	"math"
	"strconv"
	"sync/atomic"
	"testing"
	"time"
)

// entryCount returns the number of keys the limiter holds.
func entryCount(limiter *rateLimiter) int {
	total := 0

	for i := range limiter.shards {
		shard := &limiter.shards[i]

		shard.mutex.Lock()
		total += len(shard.entries)
		shard.mutex.Unlock()
	}

	return total
}

// hasEntry reports whether the limiter holds key.
func hasEntry(limiter *rateLimiter, key string) bool {
	for i := range limiter.shards {
		shard := &limiter.shards[i]

		shard.mutex.Lock()
		_, ok := shard.entries[key]
		shard.mutex.Unlock()

		if ok {
			return true
		}
	}

	return false
}

// sameShardKeys returns n client addresses that fall in one shard of
// limiter, whose hash seed is random.
func sameShardKeys(limiter *rateLimiter, n int) []string {
	shardOf := func(key string) uint64 {
		return maphash.String(limiter.seed, key) % uint64(len(limiter.shards))
	}

	keys := []string{"203.0.113.0"}

	for i := 1; len(keys) < n; i++ {
		key := "203.0.113." + strconv.Itoa(i)
		if shardOf(key) == shardOf(keys[0]) {
			keys = append(keys, key)
		}
	}

	return keys
}

// The limiter evicts a key once its window has ended, at the next request
// to the key's shard, so a shard holds only the keys whose window still runs
// and those that ended since its last request.
func TestRateLimiter_EvictsExpiredEntries(t *testing.T) {
	t.Parallel()

	start := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	window := time.Minute

	limiter := newRateLimiter(10, window, DefaultRateLimiterMaxKeys)
	keys := sameShardKeys(limiter, 5)

	for _, key := range keys[:3] {
		if allowed, _, _ := limiter.isAllowed(key, start); !allowed {
			t.Fatalf("isAllowed(%q) at the start = false, want true", key)
		}
	}

	if got := entryCount(limiter); got != 3 {
		t.Fatalf("entries after three keys = %d, want 3", got)
	}

	// Within the window nothing is evicted, even for a request of a new key.
	limiter.isAllowed(keys[3], start.Add(window/2))

	if got := entryCount(limiter); got != 4 {
		t.Errorf("entries within the window = %d, want 4", got)
	}

	// The window of the first three keys ended; the next request to their
	// shard drops them and keeps the key that is still within its window.
	limiter.isAllowed(keys[4], start.Add(window+time.Second))

	if got := entryCount(limiter); got != 2 {
		t.Errorf("entries after the first window = %d, want 2 (%s and %s)", got, keys[3], keys[4])
	}

	for _, key := range keys[:3] {
		if hasEntry(limiter, key) {
			t.Errorf("entry %q survived its window", key)
		}
	}
}

// A flood of new keys never grows the limiter past its key limit, whether
// the limit gives each shard one key or a share of several.
func TestRateLimiter_HoldsAtMostMaxKeys(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)

	tests := []struct {
		name    string
		maxKeys int
	}{
		{name: "one key", maxKeys: 1},
		{name: "fewer keys than shards", maxKeys: 5},
		{name: "a limit the shards split unevenly", maxKeys: 100},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			limiter := newRateLimiter(10, time.Minute, tt.maxKeys)

			for i := range 5000 {
				key := "client-" + strconv.Itoa(i)
				if allowed, _, _ := limiter.isAllowed(key, now); !allowed {
					t.Fatalf("isAllowed(%q), the key's first request = false, want true", key)
				}

				if got := entryCount(limiter); got > tt.maxKeys {
					t.Fatalf("after %d keys the limiter holds %d, want at most %d", i+1, got, tt.maxKeys)
				}
			}

			// 5000 keys over at most 32 shards fill every shard.
			if got := entryCount(limiter); got != tt.maxKeys {
				t.Errorf("after the flood the limiter holds %d keys, want %d", got, tt.maxKeys)
			}
		})
	}
}

// At the key limit a shard evicts the entries whose window has ended first,
// and only when none has, the one whose window started earliest. An evicted
// key's count starts again, which is the trade-off WithRateLimiterMaxKeys
// documents.
func TestRateLimiter_EvictionOrderAtTheLimit(t *testing.T) {
	t.Parallel()

	start := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	window := time.Minute

	// Two keys per shard, and one request per key and window.
	newLimiter := func() (*rateLimiter, []string) {
		limiter := newRateLimiter(1, window, 2*rateLimiterShards)

		return limiter, sameShardKeys(limiter, 3)
	}

	t.Run("an ended window goes before a running one", func(t *testing.T) {
		t.Parallel()

		limiter, keys := newLimiter()
		a, b, c := keys[0], keys[1], keys[2]

		limiter.isAllowed(a, start)
		limiter.isAllowed(b, start.Add(window/2))
		limiter.isAllowed(c, start.Add(window+time.Second)) // a's window has ended

		if hasEntry(limiter, a) || !hasEntry(limiter, b) || !hasEntry(limiter, c) {
			t.Fatalf("entries a=%v b=%v c=%v, want a evicted and b, c kept",
				hasEntry(limiter, a), hasEntry(limiter, b), hasEntry(limiter, c))
		}

		if allowed, _, _ := limiter.isAllowed(b, start.Add(window+2*time.Second)); allowed {
			t.Error("b's second request in its window was allowed: its count was lost")
		}
	})

	t.Run("then the oldest running window", func(t *testing.T) {
		t.Parallel()

		limiter, keys := newLimiter()
		a, b, c := keys[0], keys[1], keys[2]

		limiter.isAllowed(a, start)

		if allowed, _, _ := limiter.isAllowed(a, start); allowed {
			t.Fatal("a's second request in its window was allowed, want refused")
		}

		limiter.isAllowed(b, start.Add(time.Second))
		limiter.isAllowed(c, start.Add(2*time.Second)) // the shard is full; a is the oldest

		if hasEntry(limiter, a) || !hasEntry(limiter, b) || !hasEntry(limiter, c) {
			t.Fatalf("entries a=%v b=%v c=%v, want a evicted and b, c kept",
				hasEntry(limiter, a), hasEntry(limiter, b), hasEntry(limiter, c))
		}

		if allowed, _, _ := limiter.isAllowed(b, start.Add(3*time.Second)); allowed {
			t.Error("b's second request in its window was allowed: its count was lost")
		}

		if allowed, _, _ := limiter.isAllowed(a, start.Add(3*time.Second)); !allowed {
			t.Error("a's request after its eviction was refused, want its count restarted")
		}
	})
}

func TestAddressKey(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		host string
		bits int
		want string
	}{
		{name: "IPv4", host: "203.0.113.7", bits: 64, want: "203.0.113.7"},
		{name: "IPv4 mapped into IPv6", host: "::ffff:203.0.113.7", bits: 64, want: "203.0.113.7"},
		{name: "IPv6 by its /64", host: "2001:db8:1:2:3:4:5:6", bits: 64, want: "2001:db8:1:2::/64"},
		{name: "another address in the same /64", host: "2001:db8:1:2:ffff::1", bits: 64, want: "2001:db8:1:2::/64"},
		{name: "the next /64", host: "2001:db8:1:3::1", bits: 64, want: "2001:db8:1:3::/64"},
		{name: "IPv6 with a zone", host: "fe80::1%en0", bits: 64, want: "fe80::/64"},
		{name: "IPv6 by its /48", host: "2001:db8:1:2:3:4:5:6", bits: 48, want: "2001:db8:1::/48"},
		{name: "IPv6 per address", host: "2001:db8:1:2:3:4:5:6", bits: 128, want: "2001:db8:1:2:3:4:5:6/128"},
		{name: "not an address", host: "client.example", bits: 64, want: "client.example"},
		{name: "empty", host: "", bits: 64, want: ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			if got := addressKey(tt.host, tt.bits); got != tt.want {
				t.Errorf("addressKey(%q, %d) = %q, want %q", tt.host, tt.bits, got, tt.want)
			}
		})
	}
}

func TestRateLimiter_IsAllowed(t *testing.T) {
	t.Parallel()

	start := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	window := time.Minute

	type step struct {
		at            time.Duration
		wantAllowed   bool
		wantRemaining int
		wantReset     time.Duration
	}

	tests := []struct {
		name  string
		limit int
		steps []step
	}{
		{
			name:  "counts down to the limit, then refuses",
			limit: 2,
			steps: []step{
				{at: 0, wantAllowed: true, wantRemaining: 1, wantReset: window},
				{at: time.Second, wantAllowed: true, wantRemaining: 0, wantReset: window},
				{at: 2 * time.Second, wantAllowed: false, wantRemaining: 0, wantReset: window},
			},
		},
		{
			name:  "the last instant of a window still belongs to it",
			limit: 1,
			steps: []step{
				{at: 0, wantAllowed: true, wantRemaining: 0, wantReset: window},
				{at: window, wantAllowed: false, wantRemaining: 0, wantReset: window},
			},
		},
		{
			name:  "a new window starts after the old one ends",
			limit: 1,
			steps: []step{
				{at: 0, wantAllowed: true, wantRemaining: 0, wantReset: window},
				{at: 10 * time.Second, wantAllowed: false, wantRemaining: 0, wantReset: window},
				{at: window + time.Second, wantAllowed: true, wantRemaining: 0, wantReset: 2*window + time.Second},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			limiter := newRateLimiter(tt.limit, window, DefaultRateLimiterMaxKeys)

			for i, s := range tt.steps {
				allowed, remaining, reset := limiter.isAllowed("key", start.Add(s.at))

				if allowed != s.wantAllowed || remaining != s.wantRemaining || !reset.Equal(start.Add(s.wantReset)) {
					t.Errorf("step %d at +%s: isAllowed = (%v, %d, +%s), want (%v, %d, +%s)",
						i, s.at, allowed, remaining, reset.Sub(start), s.wantAllowed, s.wantRemaining, s.wantReset)
				}
			}
		})
	}
}

// BenchmarkRateLimiter_IsAllowed counts requests from every GOMAXPROCS
// goroutine over 1024 client keys, the contention rateLimiterShards is sized
// for. Run it with -cpu 1,16 to see the cost of the hash and of the locks.
func BenchmarkRateLimiter_IsAllowed(b *testing.B) {
	keys := make([]string, 1024)
	for i := range keys {
		keys[i] = "client-" + strconv.Itoa(i)
	}

	limiter := newRateLimiter(math.MaxInt, time.Minute, DefaultRateLimiterMaxKeys)
	now := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)

	// Each goroutine starts at its own key, so they do not walk the keys in
	// step and meet on the same shard at every request.
	var goroutines atomic.Int64

	b.ReportAllocs()
	b.RunParallel(func(pb *testing.PB) {
		next := int(goroutines.Add(1)) * 97

		for pb.Next() {
			limiter.isAllowed(keys[next%len(keys)], now)
			next++
		}
	})
}

// BenchmarkRateLimiter_NewKeysAtTheLimit sends a new key with every
// request to a limiter that is already full, the flood the key limit is for:
// each request evicts one entry.
func BenchmarkRateLimiter_NewKeysAtTheLimit(b *testing.B) {
	const maxKeys = 1024

	keys := make([]string, 4*maxKeys)
	for i := range keys {
		keys[i] = "client-" + strconv.Itoa(i)
	}

	limiter := newRateLimiter(math.MaxInt, time.Minute, maxKeys)
	now := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)

	for _, key := range keys[:maxKeys] {
		limiter.isAllowed(key, now)
	}

	next := 0

	b.ReportAllocs()

	for b.Loop() {
		limiter.isAllowed(keys[next%len(keys)], now)
		next++
	}
}

func TestRetryAfterSeconds(t *testing.T) {
	t.Parallel()

	tests := []struct {
		wait time.Duration
		want int
	}{
		{wait: 0, want: 0},
		{wait: time.Millisecond, want: 1},
		{wait: time.Second, want: 1},
		{wait: 59*time.Second + 500*time.Millisecond, want: 60},
		{wait: time.Minute, want: 60},
	}

	for _, tt := range tests {
		if got := retryAfterSeconds(tt.wait); got != tt.want {
			t.Errorf("retryAfterSeconds(%s) = %d, want %d", tt.wait, got, tt.want)
		}
	}
}
