// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package logfx

import "slices"

// ParentSinksOverride is the CategoryConfig.ParentSinks value that clears the
// sink names gathered before the config that carries it.
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
//   - the sink names of each config with sinks are added, a name already
//     added keeping its place, and a config whose ParentSinks is
//     ParentSinksOverride first clears the names gathered so far (those of the
//     more specific configs, since the read goes outward);
//   - the filter names of every config are added the same way, without
//     override.
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

	for _, index := range matches {
		config := configs[index]

		if len(config.Sinks) > 0 {
			if config.ParentSinks == ParentSinksOverride {
				resolution.Sinks = resolution.Sinks[:0]
			}

			for _, name := range config.Sinks {
				if !slices.Contains(resolution.Sinks, name) {
					resolution.Sinks = append(resolution.Sinks, name)
				}
			}
		}

		for _, name := range config.Filters {
			if !slices.Contains(resolution.Filters, name) {
				resolution.Filters = append(resolution.Filters, name)
			}
		}

		if resolution.LevelIndex < 0 && config.HasLevel {
			resolution.LevelIndex = index
		}
	}

	return resolution
}
