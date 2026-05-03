// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package logfx

import (
	"log/slog"
	"strings"
	"sync"
)

// CategoryRoute maps a dot-separated category prefix to a minimum log level.
type CategoryRoute struct {
	// Category is a dot-separated prefix, e.g. "myapp.http". Empty string is root.
	Category string
	MinLevel slog.Level
}

// RouteTree resolves the effective minimum level for a dotted-category string by
// longest-prefix matching over routes. Returns defaultLevel when no route matches.
func RouteTree(routes []CategoryRoute, category string, defaultLevel slog.Level) slog.Level {
	bestLen := -1
	result := defaultLevel

	for _, r := range routes {
		if r.Category == "" {
			// Root catch-all — only wins if no other prefix matched
			if bestLen < 0 {
				result = r.MinLevel
			}

			continue
		}

		if strings.HasPrefix(category, r.Category) {
			// Require segment boundary: "myapp" must not match "myapplication"
			rest := category[len(r.Category):]
			if rest == "" || rest[0] == '.' {
				if len(r.Category) > bestLen {
					bestLen = len(r.Category)
					result = r.MinLevel
				}
			}
		}
	}

	return result
}

// RouteConfig carries a category → level mapping for Configure.
type RouteConfig struct {
	Category string
	Level    slog.Level
}

var (
	globalRoutes   []CategoryRoute
	globalRoutesMu sync.RWMutex
)

// Configure sets the global category-level routes used by EffectiveLevel.
func Configure(routes []RouteConfig) {
	cr := make([]CategoryRoute, len(routes))

	for i, r := range routes {
		cr[i] = CategoryRoute{Category: r.Category, MinLevel: r.Level}
	}

	globalRoutesMu.Lock()
	globalRoutes = cr
	globalRoutesMu.Unlock()
}

// EffectiveLevel returns the effective minimum log level for a category using
// the routes registered via Configure. Falls back to LevelInfo.
func EffectiveLevel(category string) slog.Level {
	globalRoutesMu.RLock()
	routes := globalRoutes
	globalRoutesMu.RUnlock()

	return RouteTree(routes, category, LevelInfo)
}
