// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package kitfx_test

import (
	"testing"

	"github.com/eser/stack/pkg/ajan/kitfx"
)

var filterFixtures = []kitfx.Recipe{
	{
		Name:        "go-project",
		Description: "A Go project recipe",
		Language:    "go",
		Scale:       kitfx.RecipeScaleProject,
		Tags:        []string{"backend", "api"},
		Files:       []kitfx.RecipeFile{{Source: "s", Target: "t"}},
	},
	{
		Name:        "go-utility",
		Description: "A Go utility recipe",
		Language:    "go",
		Scale:       kitfx.RecipeScaleUtility,
		Tags:        []string{"backend", "cli"},
		Files:       []kitfx.RecipeFile{{Source: "s", Target: "t"}},
	},
	{
		Name:        "ts-project",
		Description: "A TypeScript project recipe",
		Language:    "typescript",
		Scale:       kitfx.RecipeScaleProject,
		Tags:        []string{"frontend", "api"},
		Files:       []kitfx.RecipeFile{{Source: "s", Target: "t"}},
	},
	{
		Name:        "ts-utility",
		Description: "A TypeScript utility recipe",
		Language:    "typescript",
		Scale:       kitfx.RecipeScaleUtility,
		Tags:        []string{"frontend", "cli"},
		Files:       []kitfx.RecipeFile{{Source: "s", Target: "t"}},
	},
}

func TestFilterRecipes_NoFilter_ReturnsAll(t *testing.T) {
	t.Parallel()

	got := kitfx.FilterRecipes(filterFixtures, kitfx.FilterOptions{})
	if len(got) != len(filterFixtures) {
		t.Errorf("expected %d recipes, got %d", len(filterFixtures), len(got))
	}
}

func TestFilterRecipes_LanguageFilter(t *testing.T) {
	t.Parallel()

	got := kitfx.FilterRecipes(filterFixtures, kitfx.FilterOptions{Language: "go"})
	if len(got) != 2 {
		t.Fatalf("expected 2 go recipes, got %d", len(got))
	}

	for _, r := range got {
		if r.Language != "go" {
			t.Errorf("unexpected language %q in result", r.Language)
		}
	}
}

func TestFilterRecipes_ScaleFilter(t *testing.T) {
	t.Parallel()

	got := kitfx.FilterRecipes(filterFixtures, kitfx.FilterOptions{Scale: string(kitfx.RecipeScaleProject)})
	if len(got) != 2 {
		t.Fatalf("expected 2 project-scale recipes, got %d", len(got))
	}

	for _, r := range got {
		if r.Scale != kitfx.RecipeScaleProject {
			t.Errorf("unexpected scale %q in result", r.Scale)
		}
	}
}

func TestFilterRecipes_TagFilter(t *testing.T) {
	t.Parallel()

	got := kitfx.FilterRecipes(filterFixtures, kitfx.FilterOptions{Tag: "api"})
	if len(got) != 2 {
		t.Fatalf("expected 2 api-tagged recipes, got %d", len(got))
	}

	for _, r := range got {
		found := false
		for _, tag := range r.Tags {
			if tag == "api" {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("recipe %q does not have tag 'api'", r.Name)
		}
	}
}

func TestFilterRecipes_TagFilter_ExactMatch(t *testing.T) {
	t.Parallel()

	// "ap" must NOT match "api" — exact tag match, not prefix/substring.
	got := kitfx.FilterRecipes(filterFixtures, kitfx.FilterOptions{Tag: "ap"})
	if len(got) != 0 {
		t.Errorf("expected 0 recipes for partial tag 'ap', got %d", len(got))
	}
}

func TestFilterRecipes_AndLogic_LanguageAndScale(t *testing.T) {
	t.Parallel()

	got := kitfx.FilterRecipes(filterFixtures, kitfx.FilterOptions{
		Language: "go",
		Scale:    string(kitfx.RecipeScaleProject),
	})

	if len(got) != 1 {
		t.Fatalf("expected 1 recipe (go+project), got %d", len(got))
	}

	if got[0].Name != "go-project" {
		t.Errorf("expected go-project, got %q", got[0].Name)
	}
}

func TestFilterRecipes_AndLogic_AllThree(t *testing.T) {
	t.Parallel()

	got := kitfx.FilterRecipes(filterFixtures, kitfx.FilterOptions{
		Language: "typescript",
		Scale:    string(kitfx.RecipeScaleUtility),
		Tag:      "cli",
	})

	if len(got) != 1 {
		t.Fatalf("expected 1 recipe (ts+utility+cli), got %d", len(got))
	}

	if got[0].Name != "ts-utility" {
		t.Errorf("expected ts-utility, got %q", got[0].Name)
	}
}

func TestFilterRecipes_NoMatch_ReturnsEmpty(t *testing.T) {
	t.Parallel()

	got := kitfx.FilterRecipes(filterFixtures, kitfx.FilterOptions{Language: "rust"})
	if len(got) != 0 {
		t.Errorf("expected 0 recipes for 'rust', got %d", len(got))
	}
}
