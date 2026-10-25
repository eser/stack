package middlewares

import (
	"fmt"
	"hash/maphash"
	"net/http"
	"net/netip"
	"strconv"
	"sync"
	"time"

	"github.com/eser/stack/pkg/ajan/httpfx"
	"github.com/eser/stack/pkg/ajan/lib/netlib"
)

// RateLimitOption defines a functional option for configuring rate limiting.
type RateLimitOption func(*rateLimitConfig)

const (
	// DefaultRateLimiterMaxKeys is the number of keys a RateLimitMiddleware
	// handler holds at most unless WithRateLimiterMaxKeys sets another.
	DefaultRateLimiterMaxKeys = 100_000

	// DefaultRateLimiterIPv6PrefixBits is the IPv6 prefix length the address
	// key functions group clients by unless WithRateLimiterIPv6Prefix sets
	// another. A /64 is the smallest network a site or a host is usually
	// given, so its addresses are one client's to rotate through.
	DefaultRateLimiterIPv6PrefixBits = 64
)

// rateLimitConfig holds the internal configuration for rate limiting.
type rateLimitConfig struct {
	KeyFunc           func(*httpfx.Context) string // Function to extract key for rate limiting
	RequestsPerMinute int                          // Number of requests allowed per minute
	WindowSize        time.Duration                // Time window for rate limiting
	SkipLoopback      bool                         // Let loopback socket peers through unlimited
	MaxKeys           int                          // Keys the limiter holds at most
	IPv6PrefixBits    int                          // Prefix length the address keys group IPv6 clients by
}

// WithRateLimiterKeyFunc sets the key extraction function for rate limiting.
func WithRateLimiterKeyFunc(keyFunc func(*httpfx.Context) string) RateLimitOption {
	return func(config *rateLimitConfig) {
		config.KeyFunc = keyFunc
	}
}

// WithRateLimiterRequestsPerMinute sets the number of requests allowed per minute.
func WithRateLimiterRequestsPerMinute(requests int) RateLimitOption {
	return func(config *rateLimitConfig) {
		config.RequestsPerMinute = requests
	}
}

// WithRateLimiterWindowSize sets the time window for rate limiting.
func WithRateLimiterWindowSize(duration time.Duration) RateLimitOption {
	return func(config *rateLimitConfig) {
		config.WindowSize = duration
	}
}

// WithRateLimiterSkipLoopback lets requests whose socket peer is a loopback
// address (127.0.0.0/8, ::1) through without counting them, for local
// benchmarks. Behind a reverse proxy on the same host every request arrives
// from loopback, so this option turns rate limiting off there; leave it unset
// in production.
func WithRateLimiterSkipLoopback() RateLimitOption {
	return func(config *rateLimitConfig) {
		config.SkipLoopback = true
	}
}

// WithRateLimiterMaxKeys sets how many keys the limiter holds at most
// (DefaultRateLimiterMaxKeys unless set). When a new key arrives and the
// limit is reached, the limiter evicts the entries whose window has ended
// first, then the entry whose window started earliest. An evicted key's count
// starts again at zero, so under a flood of new keys a client can get more
// than its limit in one window: the bound protects memory at the cost of
// accuracy while the limiter is full. The limit is split evenly over the
// limiter's shards, so a shard can start evicting before the total reaches
// it.
func WithRateLimiterMaxKeys(maxKeys int) RateLimitOption {
	return func(config *rateLimitConfig) {
		config.MaxKeys = maxKeys
	}
}

// WithRateLimiterIPv6Prefix sets the prefix length, from 1 to 128 bits, by
// which the address key functions (the default one and
// WithRateLimiterIPKeyFunc) group IPv6 clients: every address in one prefix
// shares one count. The default is DefaultRateLimiterIPv6PrefixBits (a /64);
// 128 counts each address on its own. IPv4 clients are always counted per
// address.
func WithRateLimiterIPv6Prefix(bits int) RateLimitOption {
	return func(config *rateLimitConfig) {
		config.IPv6PrefixBits = bits
	}
}

// WithRateLimiterIPKeyFunc sets the key function to extract IP addresses for rate limiting.
// It keys by the socket peer, ignoring ResolveAddressMiddleware, and groups
// IPv6 peers by prefix as WithRateLimiterIPv6Prefix sets.
func WithRateLimiterIPKeyFunc() RateLimitOption {
	return func(config *rateLimitConfig) {
		config.KeyFunc = func(ctx *httpfx.Context) string {
			host, _, _ := netlib.SplitHostPort(ctx.Request.RemoteAddr)

			return addressKey(host, config.IPv6PrefixBits)
		}
	}
}

// WithUserKeyFunc sets the key function to extract user IDs for rate limiting.
func WithUserKeyFunc(userIDExtractor func(*httpfx.Context) string) RateLimitOption {
	return func(config *rateLimitConfig) {
		config.KeyFunc = userIDExtractor
	}
}

// rateLimitEntry counts the requests of one key in its current window. The
// entries of a shard also form a list in the order their windows started,
// which is the order the shard evicts them in.
type rateLimitEntry struct {
	resetTime time.Time
	key       string
	older     *rateLimitEntry
	newer     *rateLimitEntry
	count     int
}

// rateLimiterShards is the number of independently locked parts of a
// limiter: requests for keys in different shards never wait for each other.
// BenchmarkRateLimiter_IsAllowed with 16 goroutines over 1024 keys, on a
// 16-core arm64 machine, took about 33 ns per request with 32 shards and
// 130 ns with one lock for the whole limiter (go test -bench -cpu 1,16
// -count 6, medians). The earlier map with a lock per entry took about 140 ns
// and could lose a count when two requests created the same key at once. One
// goroutine takes about 20 ns either way. A limiter with fewer keys than this
// has one shard per key.
const rateLimiterShards = 32

// rateLimiter counts requests per key in fixed windows. Each handler that
// RateLimitMiddleware returns owns one, and it starts no goroutine: each
// request evicts the entries of its shard whose window has ended, which sit
// at the old end of the shard's list. The limiter therefore lives exactly as
// long as its handler, and it never holds more than maxKeys entries.
type rateLimiter struct {
	seed   maphash.Seed
	shards []rateLimitShard
	limit  int
	window time.Duration
}

// rateLimitShard holds the entries of the keys that hash to it, at most
// maxKeys of them, in a map for lookups and in a list from the oldest window
// to the newest for eviction.
type rateLimitShard struct {
	entries map[string]*rateLimitEntry
	oldest  *rateLimitEntry
	newest  *rateLimitEntry
	maxKeys int
	mutex   sync.Mutex
}

// newRateLimiter builds a limiter that holds at most maxKeys keys, split as
// evenly as possible over its shards. maxKeys must be positive.
func newRateLimiter(limit int, window time.Duration, maxKeys int) *rateLimiter {
	shardCount := min(rateLimiterShards, maxKeys)

	limiter := &rateLimiter{
		seed:   maphash.MakeSeed(),
		shards: make([]rateLimitShard, shardCount),
		limit:  limit,
		window: window,
	}

	for i := range limiter.shards {
		shardMax := maxKeys / shardCount
		if i < maxKeys%shardCount {
			shardMax++
		}

		limiter.shards[i].entries = make(map[string]*rateLimitEntry)
		limiter.shards[i].maxKeys = shardMax
	}

	return limiter
}

// isAllowed counts a request for key at now. It reports whether the request
// is within the limit, how many requests the key has left in its window, and
// when that window resets.
func (rl *rateLimiter) isAllowed(key string, now time.Time) (bool, int, time.Time) {
	shard := &rl.shards[maphash.String(rl.seed, key)%uint64(len(rl.shards))]

	shard.mutex.Lock()
	defer shard.mutex.Unlock()

	shard.evictExpired(now)

	entry, exists := shard.entries[key]

	switch {
	case !exists:
		if len(shard.entries) >= shard.maxKeys {
			// No window has ended, or evictExpired would have made room.
			shard.remove(shard.oldest)
		}

		entry = &rateLimitEntry{resetTime: now.Add(rl.window), key: key} //nolint:exhaustruct // linked below
		shard.entries[key] = entry
		shard.pushNewest(entry)
	case now.After(entry.resetTime):
		// evictExpired stops at the first running window, and an ended one
		// can sit behind it when two requests read the clock in one order
		// and took the lock in the other. The key starts a new window.
		entry.resetTime = now.Add(rl.window)
		entry.count = 0

		shard.unlink(entry)
		shard.pushNewest(entry)
	}

	if entry.count >= rl.limit {
		return false, 0, entry.resetTime
	}

	entry.count++

	return true, rl.limit - entry.count, entry.resetTime
}

// evictExpired drops the entries whose window ended before now, oldest
// first, and stops at the first that is still running. The caller holds the
// shard's mutex.
func (shard *rateLimitShard) evictExpired(now time.Time) {
	for shard.oldest != nil && now.After(shard.oldest.resetTime) {
		shard.remove(shard.oldest)
	}
}

// pushNewest links entry in as the shard's newest. The caller holds the
// shard's mutex.
func (shard *rateLimitShard) pushNewest(entry *rateLimitEntry) {
	entry.older = shard.newest
	entry.newer = nil

	if shard.newest != nil {
		shard.newest.newer = entry
	} else {
		shard.oldest = entry
	}

	shard.newest = entry
}

// unlink takes entry out of the shard's list and leaves it in the map. The
// caller holds the shard's mutex.
func (shard *rateLimitShard) unlink(entry *rateLimitEntry) {
	if entry.older != nil {
		entry.older.newer = entry.newer
	} else {
		shard.oldest = entry.newer
	}

	if entry.newer != nil {
		entry.newer.older = entry.older
	} else {
		shard.newest = entry.older
	}

	entry.older = nil
	entry.newer = nil
}

// remove drops entry from the shard. The caller holds the shard's mutex.
func (shard *rateLimitShard) remove(entry *rateLimitEntry) {
	shard.unlink(entry)
	delete(shard.entries, entry.key)
}

// retryAfterSeconds rounds the wait until the window resets up to whole
// seconds, so a client that waits as long as it is told does not come back
// before the reset.
func retryAfterSeconds(wait time.Duration) int {
	return int((wait + time.Second - 1) / time.Second)
}

// RateLimitMiddleware creates a rate limiting middleware using functional
// options. Each call builds its own limiter, owned by the handler it returns:
// two calls never share a count, and a handler that is no longer referenced
// leaves nothing running behind it.
//
// The default key is the client address that ResolveAddressMiddleware
// resolved, or the socket peer when it has not run, with IPv6 clients grouped
// by prefix (WithRateLimiterIPv6Prefix). The limiter holds at most
// DefaultRateLimiterMaxKeys keys; WithRateLimiterMaxKeys says what happens at
// the limit.
//
// Panics when the window set with WithRateLimiterWindowSize is not positive,
// because no limit can be counted over it, when the key limit is not
// positive, and when the IPv6 prefix is not between 1 and 128 bits.
func RateLimitMiddleware(options ...RateLimitOption) httpfx.Handler { //nolint:funlen
	// Start with default configuration
	cfg := &rateLimitConfig{ //nolint:exhaustruct // KeyFunc is set below, once cfg exists
		// 60 requests per minute
		RequestsPerMinute: 60, //nolint:mnd
		WindowSize:        time.Minute,
		SkipLoopback:      false,
		MaxKeys:           DefaultRateLimiterMaxKeys,
		IPv6PrefixBits:    DefaultRateLimiterIPv6PrefixBits,
	}

	cfg.KeyFunc = func(ctx *httpfx.Context) string {
		// Use resolved client address from ResolveAddressMiddleware if available.
		// This ensures correct rate limiting behind reverse proxies where
		// RemoteAddr is always the proxy IP (often 127.0.0.1).
		if addr, ok := ctx.Request.Context().Value(ClientAddr).(string); ok && addr != "" {
			host, _, _ := netlib.SplitHostPort(addr)

			return addressKey(host, cfg.IPv6PrefixBits)
		}

		// Fallback to socket address when ResolveAddressMiddleware hasn't run
		host, _, _ := netlib.SplitHostPort(ctx.Request.RemoteAddr)

		return addressKey(host, cfg.IPv6PrefixBits)
	}

	// Apply all options
	for _, option := range options {
		option(cfg)
	}

	validateRateLimitConfig(cfg)

	limiter := newRateLimiter(cfg.RequestsPerMinute, cfg.WindowSize, cfg.MaxKeys)

	return func(ctx *httpfx.Context) httpfx.Result {
		// The socket peer decides, not the key: a key can come from a forwarded
		// header that the client wrote.
		if cfg.SkipLoopback && isLoopbackPeer(ctx.Request.RemoteAddr) {
			return ctx.Next()
		}

		// Extract key for rate limiting
		key := cfg.KeyFunc(ctx)

		// One clock read for the count, the headers and Retry-After.
		now := time.Now()

		allowed, remaining, resetTime := limiter.isAllowed(key, now)

		headers := ctx.ResponseWriter.Header()

		// Set rate limit headers
		headers.Set("X-Ratelimit-Limit", strconv.Itoa(cfg.RequestsPerMinute))
		headers.Set("X-Ratelimit-Remaining", strconv.Itoa(remaining))
		headers.Set("X-Ratelimit-Reset", strconv.FormatInt(resetTime.Unix(), 10))

		if !allowed {
			// Rate limit exceeded
			retryAfter := retryAfterSeconds(resetTime.Sub(now))

			headers.Set("Retry-After", strconv.Itoa(retryAfter))

			errorResponse := map[string]any{
				"error": "Rate limit exceeded",
				"message": fmt.Sprintf(
					"Too many requests. Limit: %d requests per %v",
					cfg.RequestsPerMinute,
					cfg.WindowSize,
				),
				"retryAfter": retryAfter,
			}

			result := ctx.Results.JSON(errorResponse)
			result.InnerStatusCode = http.StatusTooManyRequests

			return result
		}

		// Request is allowed, continue to next handler
		return ctx.Next()
	}
}

// validateRateLimitConfig panics on a setting no limiter can work with,
// naming the option that fixes it.
func validateRateLimitConfig(cfg *rateLimitConfig) {
	if cfg.WindowSize <= 0 {
		panic(fmt.Sprintf(
			"httpfx: RateLimitMiddleware window %s is not positive; pass a duration such as time.Minute to WithRateLimiterWindowSize",
			cfg.WindowSize,
		))
	}

	if cfg.MaxKeys <= 0 {
		panic(fmt.Sprintf(
			"httpfx: RateLimitMiddleware key limit %d is not positive; pass a count such as %d to WithRateLimiterMaxKeys",
			cfg.MaxKeys, DefaultRateLimiterMaxKeys,
		))
	}

	if cfg.IPv6PrefixBits < 1 || cfg.IPv6PrefixBits > 128 {
		panic(fmt.Sprintf(
			"httpfx: RateLimitMiddleware IPv6 prefix /%d is outside 1 to 128 bits; pass a length such as %d to WithRateLimiterIPv6Prefix",
			cfg.IPv6PrefixBits, DefaultRateLimiterIPv6PrefixBits,
		))
	}
}

// addressKey returns the rate limit key for a client host. An IPv4 address,
// or an IPv4 address mapped into IPv6, is its own key; an IPv6 address is
// keyed by its prefix of ipv6PrefixBits bits ("2001:db8:1:2::/64"), so a
// client cannot multiply its budget by rotating through the addresses of its
// network. A host that is not an IP address is returned unchanged.
func addressKey(host string, ipv6PrefixBits int) string {
	addr, err := netip.ParseAddr(host)
	if err != nil {
		return host
	}

	addr = addr.Unmap().WithZone("")
	if addr.Is4() {
		return addr.String()
	}

	prefix, err := addr.Prefix(ipv6PrefixBits)
	if err != nil {
		// Only a length outside 0 to 128 fails, and RateLimitMiddleware
		// refuses those; the whole address is the narrowest key anyway.
		return addr.String()
	}

	return prefix.String()
}

// isLoopbackPeer reports whether remoteAddr (host:port or a bare IP) is a
// loopback address.
func isLoopbackPeer(remoteAddr string) bool {
	host, _, err := netlib.SplitHostPort(remoteAddr)
	if err != nil {
		return false
	}

	ip, err := netip.ParseAddr(host)
	if err != nil {
		return false
	}

	return ip.Unmap().IsLoopback()
}
