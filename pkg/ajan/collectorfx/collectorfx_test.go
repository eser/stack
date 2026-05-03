// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package collectorfx_test

import (
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/collectorfx"
)

// --- SpecifierToIdentifier ---
// Test cases ported directly from @eserstack/collector/manifest.test.ts

func TestSpecifierToIdentifier(t *testing.T) {
	t.Parallel()

	tests := []struct {
		specifier string
		want      string
	}{
		// Extension stripping
		{"foo/bar.ts", "foo_bar"},
		// Only the last extension is stripped
		{"foo/bar.json.ts", "foo_bar_json"},
		// Dynamic route segments
		{"foo/[id]/bar", "foo_id_bar"},
		// Catch-all spread
		{"foo/[...all]/bar", "foo_all_bar"},
		// Optional segments
		{"foo/[[optional]]/bar", "foo_optional_bar"},
		// Dash separator (common in file-based routing)
		{"foo/as-df/bar", "foo_as_df_bar"},
		// @ sign
		{"foo/as@df", "foo_as_df"},
		// Leading digit must be prefixed with _
		{"404", "_404"},
		// Leading underscore from routing convention (_middleware)
		{"foo/_middleware", "foo_middleware"},
		// Root index
		{"index.ts", "index"},
		// Deeply nested
		{"api/v1/users/[id]/posts.ts", "api_v1_users_id_posts"},
	}

	for _, tt := range tests {
		t.Run(tt.specifier, func(t *testing.T) {
			t.Parallel()
			used := make(map[string]struct{})
			got := collectorfx.SpecifierToIdentifier(tt.specifier, used)

			if got != tt.want {
				t.Errorf("SpecifierToIdentifier(%q) = %q, want %q", tt.specifier, got, tt.want)
			}
		})
	}
}

func TestSpecifierToIdentifier_Deduplication(t *testing.T) {
	t.Parallel()

	used := make(map[string]struct{})

	first := collectorfx.SpecifierToIdentifier("foo/bar.ts", used)
	second := collectorfx.SpecifierToIdentifier("foo/bar.js", used) // same identifier after processing
	third := collectorfx.SpecifierToIdentifier("foo/bar.tsx", used) // third duplicate

	if first != "foo_bar" {
		t.Errorf("first: got %q, want %q", first, "foo_bar")
	}

	if second != "foo_bar_1" {
		t.Errorf("second: got %q, want %q", second, "foo_bar_1")
	}

	if third != "foo_bar_2" {
		t.Errorf("third: got %q, want %q", third, "foo_bar_2")
	}
}

// --- IsIdentifierStart / IsIdentifierChar ---

func TestIsIdentifierStart(t *testing.T) {
	t.Parallel()

	valid := []rune{'a', 'z', 'A', 'Z', '_', '$', 'é', 'ñ'}
	invalid := []rune{'0', '9', '-', ' ', '/', '.', '@'}

	for _, r := range valid {
		if !collectorfx.IsIdentifierStart(r) {
			t.Errorf("IsIdentifierStart(%q) = false, want true", r)
		}
	}

	for _, r := range invalid {
		if collectorfx.IsIdentifierStart(r) {
			t.Errorf("IsIdentifierStart(%q) = true, want false", r)
		}
	}
}

func TestIsIdentifierChar(t *testing.T) {
	t.Parallel()

	valid := []rune{'a', 'Z', '_', '$', '0', '9'}
	invalid := []rune{'-', ' ', '/', '.', '@'}

	for _, r := range valid {
		if !collectorfx.IsIdentifierChar(r) {
			t.Errorf("IsIdentifierChar(%q) = false, want true", r)
		}
	}

	for _, r := range invalid {
		if collectorfx.IsIdentifierChar(r) {
			t.Errorf("IsIdentifierChar(%q) = true, want false", r)
		}
	}
}

// --- GenerateManifestSource ---

func TestGenerateManifestSource_Empty(t *testing.T) {
	t.Parallel()

	src := collectorfx.GenerateManifestSource(nil)

	if !strings.Contains(src, "export const manifest") {
		t.Error("manifest declaration missing from output")
	}

	if !strings.Contains(src, "exports: [") {
		t.Error("exports array missing from output")
	}
}

func TestGenerateManifestSource_SingleEntry(t *testing.T) {
	t.Parallel()

	entries := []collectorfx.ManifestEntry{
		{RelPath: "routes/index.ts", Exports: []string{"default", "config"}},
	}

	src := collectorfx.GenerateManifestSource(entries)

	if !strings.Contains(src, `import * as routes_index from "./routes/index.ts"`) {
		t.Errorf("import statement missing or wrong:\n%s", src)
	}

	if !strings.Contains(src, `"default"`) || !strings.Contains(src, `"config"`) {
		t.Errorf("exports missing in manifest:\n%s", src)
	}

	if !strings.Contains(src, `"routes_index"`) {
		t.Errorf("identifier missing in manifest entry:\n%s", src)
	}
}

func TestGenerateManifestSource_DeduplicatesIdentifiers(t *testing.T) {
	t.Parallel()

	entries := []collectorfx.ManifestEntry{
		{RelPath: "routes/foo.ts", Exports: []string{"default"}},
		{RelPath: "routes/foo.js", Exports: []string{"default"}}, // same identifier before dedup
	}

	src := collectorfx.GenerateManifestSource(entries)

	if !strings.Contains(src, `routes_foo`) {
		t.Errorf("first identifier missing:\n%s", src)
	}

	if !strings.Contains(src, `routes_foo_1`) {
		t.Errorf("deduplicated identifier missing:\n%s", src)
	}
}

func TestGenerateManifestSource_ValidTypeScript(t *testing.T) {
	t.Parallel()

	entries := []collectorfx.ManifestEntry{
		{RelPath: "routes/[id].ts", Exports: []string{"default"}},
		{RelPath: "routes/404.ts", Exports: nil},
	}

	src := collectorfx.GenerateManifestSource(entries)

	// Both entries should appear
	if !strings.Contains(src, "routes_id") {
		t.Errorf("dynamic route identifier missing:\n%s", src)
	}

	if !strings.Contains(src, "_404") {
		t.Errorf("numeric identifier missing:\n%s", src)
	}

	// Must end with `as const;`
	if !strings.HasSuffix(strings.TrimSpace(src), "} as const;") {
		t.Errorf("manifest must end with `} as const;`:\n%s", src)
	}
}
