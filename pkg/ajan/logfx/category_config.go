// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package logfx

import "slices"

// ParentSinksOverride is the CategoryConfig.ParentSinks value that keeps the
// sinks and filters of less specific configs out: the gathering stops at the
// config that carries it, when that config names sinks.
const ParentSinksOverride = "override"

// CategoryConfig is one logger configuration of @eserstack/logging: a
// category as its segments, whether it sets a level, and the names of its
// sinks and filters. The sinks and filters themselves are JavaScript
// functions that stay with the caller, so only their names come here.
type CategoryConfig struct {
	// ParentSinks is "inherit" (the default) or ParentSinksOverride.
	ParentSinks string
	Category    []string
	Sinks       []string
	Filters     []string
	HasLevel    bool
}

// CategoryResolution is what a category takes from the configs that match it.
type CategoryResolution struct {
	// Sinks and Filters are names, each once, in the order they were gathered.
	Sinks   []string
	Filters []string
	// LevelIndex is the index of the config whose level applies, or -1 when no
	// matching config sets one.
	LevelIndex int
}

// isSelfOrDescendant reports whether category is parent or lies below it.
// Segments compare whole: ["app"] is not a parent of ["application"].
func isSelfOrDescendant(category, parent []string) bool {
	return len(category) >= len(parent) && slices.Equal(category[:len(parent)], parent)
}

// ResolveCategoryConfig answers which level, sinks and filters a category
// takes, as @eserstack/logging's getEffectiveConfig does.
//
// A config matches when its category is the category itself or one of its
// ancestors; the empty category matches every category. The matching configs
// are read from the most specific (the longest category) outward, configs of
// the same length in their given order:
//
//   - the level comes from the first of them that sets one;
//   - the sink names and the filter names of each config are added, a name
//     already added keeping its place;
//   - a config with sinks whose ParentSinks is ParentSinksOverride is the last
//     one whose sinks and filters are added, so the less specific configs
//     (its ancestors) add none; their levels still count.
func ResolveCategoryConfig(category []string, configs []CategoryConfig) CategoryResolution {
	matches := make([]int, 0, len(configs))

	for index, config := range configs {
		if isSelfOrDescendant(category, config.Category) {
			matches = append(matches, index)
		}
	}

	slices.SortStableFunc(matches, func(a, b int) int {
		return len(configs[b].Category) - len(configs[a].Category)
	})

	resolution := CategoryResolution{
		Sinks:      []string{},
		Filters:    []string{},
		LevelIndex: -1,
	}

	gathering := true

	for _, index := range matches {
		config := configs[index]

		if resolution.LevelIndex < 0 && config.HasLevel {
			resolution.LevelIndex = index
		}

		if !gathering {
			continue
		}

		for _, name := range config.Sinks {
			if !slices.Contains(resolution.Sinks, name) {
				resolution.Sinks = append(resolution.Sinks, name)
			}
		}

		for _, name := range config.Filters {
			if !slices.Contains(resolution.Filters, name) {
				resolution.Filters = append(resolution.Filters, name)
			}
		}

		if len(config.Sinks) > 0 && config.ParentSinks == ParentSinksOverride {
			gathering = false
		}
	}

	return resolution
}
