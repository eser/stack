// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package logfx

import (
	"log/slog"
	"math/rand"
	"strings"
	"sync"
	"time"
)

// FilterFunc decides whether a record should pass.
// Returns true to allow, false to drop.
type FilterFunc func(level slog.Level, msg string, attrs []slog.Attr) bool

// LevelFilter returns a FilterFunc that passes records at or above min.
func LevelFilter(min slog.Level) FilterFunc {
	return func(level slog.Level, _ string, _ []slog.Attr) bool {
		return level >= min
	}
}

// ChainFilters returns a FilterFunc that passes only when all filters pass.
// An empty chain always passes.
func ChainFilters(filters ...FilterFunc) FilterFunc {
	return func(level slog.Level, msg string, attrs []slog.Attr) bool {
		for _, f := range filters {
			if !f(level, msg, attrs) {
				return false
			}
		}

		return true
	}
}

// CategoryPrefixFilter returns a FilterFunc that passes records whose "scope"
// attr starts with prefix. Records with no "scope" attr pass unconditionally.
func CategoryPrefixFilter(prefix string) FilterFunc {
	return func(_ slog.Level, _ string, attrs []slog.Attr) bool {
		for _, a := range attrs {
			if a.Key == "scope" {
				return strings.HasPrefix(a.Value.String(), prefix)
			}
		}

		return true
	}
}

// RateLimitFilter returns a FilterFunc that allows at most maxPerSec records
// per second using a simple token-window strategy. Thread-safe.
func RateLimitFilter(maxPerSec float64) FilterFunc {
	var mu sync.Mutex
	windowStart := time.Now()
	count := 0.0

	return func(_ slog.Level, _ string, _ []slog.Attr) bool {
		mu.Lock()
		defer mu.Unlock()

		now := time.Now()
		elapsed := now.Sub(windowStart).Seconds()

		if elapsed >= 1.0 {
			windowStart = now
			count = 0
		}

		if count >= maxPerSec {
			return false
		}

		count++

		return true
	}
}

// SamplingFilter returns a FilterFunc that probabilistically passes records.
// probability 1.0 passes all, 0.0 drops all.
func SamplingFilter(probability float64) FilterFunc {
	return func(_ slog.Level, _ string, _ []slog.Attr) bool {
		return rand.Float64() < probability //nolint:gosec
	}
}
