// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx_test

import (
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/noskillsfx"
)

func TestCheckSpecCompleteness(t *testing.T) {
	t.Parallel()

	naReason := func(s string) *string { return &s }

	makeState := func(placeholders []noskillsfx.PlaceholderStatus) noskillsfx.SpecState {
		return noskillsfx.SpecState{ //nolint:exhaustruct
			Placeholders: placeholders,
		}
	}

	t.Run("all sections filled → can advance", func(t *testing.T) {
		t.Parallel()
		state := makeState([]noskillsfx.PlaceholderStatus{
			{SectionID: "summary", SectionTitle: "Summary", Status: "filled"}, //nolint:exhaustruct
			{SectionID: "problem", SectionTitle: "Problem", Status: "filled"}, //nolint:exhaustruct
		})
		result := noskillsfx.CheckSpecCompleteness(state)
		if !result.CanAdvance {
			t.Errorf("expected CanAdvance=true, got false; unresolved=%v", result.UnresolvedSection)
		}
	})

	t.Run("valid N/A with long reason → can advance", func(t *testing.T) {
		t.Parallel()
		state := makeState([]noskillsfx.PlaceholderStatus{
			{SectionID: "summary", SectionTitle: "Summary", Status: "na", NaReason: naReason("this section does not apply because it is a pure refactor with no user-facing changes")}, //nolint:exhaustruct
		})
		result := noskillsfx.CheckSpecCompleteness(state)
		if !result.CanAdvance {
			t.Error("expected CanAdvance=true for valid N/A, got false")
		}
	})

	t.Run("N/A with short reason (<20 chars) → cannot advance", func(t *testing.T) {
		t.Parallel()
		state := makeState([]noskillsfx.PlaceholderStatus{
			{SectionID: "summary", SectionTitle: "Summary", Status: "na", NaReason: naReason("n/a")}, //nolint:exhaustruct
		})
		result := noskillsfx.CheckSpecCompleteness(state)
		if result.CanAdvance {
			t.Error("expected CanAdvance=false for short N/A reason, got true")
		}
	})

	t.Run("N/A with nil reason → cannot advance", func(t *testing.T) {
		t.Parallel()
		state := makeState([]noskillsfx.PlaceholderStatus{
			{SectionID: "summary", SectionTitle: "Summary", Status: "na"}, //nolint:exhaustruct
		})
		result := noskillsfx.CheckSpecCompleteness(state)
		if result.CanAdvance {
			t.Error("expected CanAdvance=false for nil N/A reason, got true")
		}
	})

	t.Run("placeholder status → cannot advance", func(t *testing.T) {
		t.Parallel()
		state := makeState([]noskillsfx.PlaceholderStatus{
			{SectionID: "summary", SectionTitle: "Summary", Status: "placeholder"}, //nolint:exhaustruct
		})
		result := noskillsfx.CheckSpecCompleteness(state)
		if result.CanAdvance {
			t.Error("expected CanAdvance=false for unfilled placeholder, got true")
		}
		if len(result.UnresolvedSection) == 0 {
			t.Error("expected UnresolvedSection to be populated")
		}
	})

	t.Run("conditional-hidden → resolved, can advance", func(t *testing.T) {
		t.Parallel()
		state := makeState([]noskillsfx.PlaceholderStatus{
			{SectionID: "optional", SectionTitle: "Optional", Status: "conditional-hidden"}, //nolint:exhaustruct
		})
		result := noskillsfx.CheckSpecCompleteness(state)
		if !result.CanAdvance {
			t.Error("expected CanAdvance=true for conditional-hidden, got false")
		}
	})

	t.Run("no placeholders → can advance", func(t *testing.T) {
		t.Parallel()
		state := makeState([]noskillsfx.PlaceholderStatus{})
		result := noskillsfx.CheckSpecCompleteness(state)
		if !result.CanAdvance {
			t.Error("expected CanAdvance=true for empty placeholder list")
		}
	})
}

func TestMergeSections(t *testing.T) {
	t.Parallel()

	t.Run("no active concerns → only base sections", func(t *testing.T) {
		t.Parallel()
		sections := noskillsfx.MergeSections(nil)
		if len(sections) != len(noskillsfx.BaseSections) {
			t.Errorf("got %d sections, want %d (BaseSections)", len(sections), len(noskillsfx.BaseSections))
		}
	})

	t.Run("all base section IDs present in output", func(t *testing.T) {
		t.Parallel()
		sections := noskillsfx.MergeSections(nil)
		ids := make(map[string]bool, len(sections))
		for _, s := range sections {
			ids[s.ID] = true
		}
		for _, base := range noskillsfx.BaseSections {
			if !ids[base.ID] {
				t.Errorf("base section %q missing from MergeSections output", base.ID)
			}
		}
	})
}

func TestPlaceholderMarker(t *testing.T) {
	t.Parallel()

	got := noskillsfx.PlaceholderMarker("summary")
	if !strings.Contains(got, "summary") {
		t.Errorf("PlaceholderMarker(%q) = %q, expected to contain section ID", "summary", got)
	}
	if !strings.HasPrefix(got, "<!--") {
		t.Errorf("PlaceholderMarker should return an HTML comment, got %q", got)
	}
}

func TestGenerateInitialSpec(t *testing.T) {
	t.Parallel()

	t.Run("generates non-empty markdown content", func(t *testing.T) {
		t.Parallel()
		args := noskillsfx.GenerateSpecArgs{
			SpecName:       "add-auth",
			ActiveConcerns: nil,
			Classification: nil,
			Creator:        struct{ Name, Email string }{Name: "test-user"},
			Now:            "2026-04-15T00:00:00Z",
		}
		result, err := noskillsfx.GenerateInitialSpec(args)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result.Content == "" {
			t.Error("expected non-empty Content")
		}
	})

	t.Run("content contains spec name", func(t *testing.T) {
		t.Parallel()
		args := noskillsfx.GenerateSpecArgs{
			SpecName:       "my-feature",
			ActiveConcerns: nil,
			Classification: nil,
			Creator:        struct{ Name, Email string }{Name: "alice"},
			Now:            "2026-04-15T00:00:00Z",
		}
		result, err := noskillsfx.GenerateInitialSpec(args)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !strings.Contains(result.Content, "my-feature") {
			t.Error("expected Content to contain spec name 'my-feature'")
		}
	})

	t.Run("produces placeholder statuses for base sections", func(t *testing.T) {
		t.Parallel()
		args := noskillsfx.GenerateSpecArgs{
			SpecName:       "test-spec",
			ActiveConcerns: nil,
			Classification: nil,
			Creator:        struct{ Name, Email string }{Name: "alice"},
			Now:            "2026-04-15T00:00:00Z",
		}
		result, err := noskillsfx.GenerateInitialSpec(args)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(result.Placeholders) == 0 {
			t.Error("expected non-empty Placeholders")
		}
	})
}
