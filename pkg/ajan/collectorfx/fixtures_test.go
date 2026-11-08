// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package collectorfx_test

import (
	"encoding/json"
	"io/fs"
	"os"
	"slices"
	"testing"

	"github.com/eser/stack/pkg/ajan/collectorfx"
)

// The fixtures in testdata/ were written from the answers of the TypeScript
// implementation in @eserstack/collector before it moved here. Its tests run
// the same cases through the bridge.

type specifierIdentifierCase struct {
	Name        string   `json:"name"`
	Used        []string `json:"used"`
	Specifiers  []string `json:"specifiers"`
	Identifiers []string `json:"identifiers"`
}

type manifestCase struct {
	Name    string `json:"name"`
	Source  string `json:"source"`
	Entries []struct {
		RelPath string   `json:"relPath"`
		Exports []string `json:"exports"`
	} `json:"entries"`
}

func readFixture[T any](t *testing.T, name string) []T {
	t.Helper()

	raw, err := fs.ReadFile(os.DirFS("testdata"), name)
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}

	var cases []T
	if err := json.Unmarshal(raw, &cases); err != nil {
		t.Fatalf("decode fixture: %v", err)
	}

	return cases
}

func TestSpecifierToIdentifierFixtures(t *testing.T) {
	t.Parallel()

	for _, tc := range readFixture[specifierIdentifierCase](t, "specifier_identifiers.json") {
		t.Run(tc.Name, func(t *testing.T) {
			t.Parallel()

			used := make(map[string]struct{}, len(tc.Used))
			for _, name := range tc.Used {
				used[name] = struct{}{}
			}

			got := make([]string, 0, len(tc.Specifiers))
			for _, specifier := range tc.Specifiers {
				got = append(got, collectorfx.SpecifierToIdentifier(specifier, used))
			}

			if !slices.Equal(got, tc.Identifiers) {
				t.Errorf("got %q, want %q", got, tc.Identifiers)
			}

			for _, identifier := range got {
				if _, ok := used[identifier]; !ok {
					t.Errorf("%q was not added to the used set", identifier)
				}
			}
		})
	}
}

func TestGenerateManifestSourceFixtures(t *testing.T) {
	t.Parallel()

	for _, tc := range readFixture[manifestCase](t, "manifests.json") {
		t.Run(tc.Name, func(t *testing.T) {
			t.Parallel()

			entries := make([]collectorfx.ManifestEntry, 0, len(tc.Entries))
			for _, entry := range tc.Entries {
				entries = append(entries, collectorfx.ManifestEntry{RelPath: entry.RelPath, Exports: entry.Exports})
			}

			if got := collectorfx.GenerateManifestSource(entries); got != tc.Source {
				t.Errorf("got\n%s\nwant\n%s", got, tc.Source)
			}
		})
	}
}
