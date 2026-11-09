// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package logfx_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/logfx"
)

// testdata/category_configs.json was written from the answers of
// @eserstack/logging's TypeScript getEffectiveConfig before the resolution
// moved here; that package's bridge.test.ts runs the same cases through the
// bridge and through its TypeScript fallback.

type fixtureLoggerConfig struct {
	LowestLevel *float64        `json:"lowestLevel"`
	ParentSinks string          `json:"parentSinks"`
	Category    json.RawMessage `json:"category"`
	Sinks       []string        `json:"sinks"`
	Filters     []string        `json:"filters"`
}

type categoryConfigCase struct {
	Name     string                `json:"name"`
	Category []string              `json:"category"`
	Loggers  []fixtureLoggerConfig `json:"loggers"`
	Want     struct {
		Sinks       []string `json:"sinks"`
		Filters     []string `json:"filters"`
		LowestLevel float64  `json:"lowestLevel"`
	} `json:"want"`
}

// fixtureCategory reads a category as @eserstack/logging normalizes it: an
// array as it is, a string split on dots without the empty parts.
func fixtureCategory(t *testing.T, raw json.RawMessage) []string {
	t.Helper()

	var segments []string
	if err := json.Unmarshal(raw, &segments); err == nil {
		return segments
	}

	var dotted string
	if err := json.Unmarshal(raw, &dotted); err != nil {
		t.Fatalf("category %s is neither an array nor a string", raw)
	}

	return slices.DeleteFunc(strings.Split(dotted, "."), func(part string) bool { return part == "" })
}

func TestResolveCategoryConfigFixtures(t *testing.T) {
	t.Parallel()

	data, err := os.ReadFile(filepath.Join("testdata", "category_configs.json"))
	if err != nil {
		t.Fatal(err)
	}

	var cases []categoryConfigCase
	if err := json.Unmarshal(data, &cases); err != nil {
		t.Fatal(err)
	}

	if len(cases) == 0 {
		t.Fatal("no cases in category_configs.json")
	}

	// The TypeScript default, logging.Severities.Info.
	const defaultLevel = 9

	for _, tc := range cases {
		t.Run(tc.Name, func(t *testing.T) {
			t.Parallel()

			configs := make([]logfx.CategoryConfig, 0, len(tc.Loggers))
			for _, logger := range tc.Loggers {
				configs = append(configs, logfx.CategoryConfig{
					ParentSinks: logger.ParentSinks,
					Category:    fixtureCategory(t, logger.Category),
					Sinks:       logger.Sinks,
					Filters:     logger.Filters,
					HasLevel:    logger.LowestLevel != nil,
				})
			}

			got := logfx.ResolveCategoryConfig(tc.Category, configs)

			level := float64(defaultLevel)
			if got.LevelIndex >= 0 {
				level = *tc.Loggers[got.LevelIndex].LowestLevel
			}

			if level != tc.Want.LowestLevel {
				t.Errorf("lowestLevel: got %v, want %v", level, tc.Want.LowestLevel)
			}

			if !slices.Equal(got.Sinks, tc.Want.Sinks) {
				t.Errorf("sinks: got %q, want %q", got.Sinks, tc.Want.Sinks)
			}

			if !slices.Equal(got.Filters, tc.Want.Filters) {
				t.Errorf("filters: got %q, want %q", got.Filters, tc.Want.Filters)
			}
		})
	}
}
