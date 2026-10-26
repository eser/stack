// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"errors"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"
)

func TestEntryIDs(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, 10, 25, 9, 8, 7, 6_000_000, time.FixedZone("x", 3600))
	base := "2026-10-25T08-08-07-006Z"

	if got := EntryIDFor(now, nil); got != base {
		t.Errorf("EntryIDFor = %s", got)
	}

	if got := EntryIDFor(now, map[string]bool{base: true, base + "-2": true}); got != base+"-3" {
		t.Errorf("EntryIDFor with taken ids = %s", got)
	}

	for _, tc := range []struct {
		id   string
		want bool
	}{
		{base, true}, {base + "-2", true}, {base + "-10", true}, {base + "-1", false}, {base + "-02", false},
		{"2026-10-25T08:08:07.006Z", false}, {"notes", false},
	} {
		if got := IsEntryID(tc.id); got != tc.want {
			t.Errorf("IsEntryID(%q) = %v", tc.id, got)
		}
	}

	ids := []string{base + "-2", "2025-01-01T00-00-00-000Z", base, base + "-10", "2027-01-01T00-00-00-000Z"}
	slices.SortFunc(ids, CompareEntryIDs)

	want := []string{"2025-01-01T00-00-00-000Z", base, base + "-2", base + "-10", "2027-01-01T00-00-00-000Z"}
	if !slices.Equal(ids, want) {
		t.Errorf("sorted %v", ids)
	}

	if dropped := EntriesBeyondLimit(ids, 3); !slices.Equal(dropped, want[:2]) {
		t.Errorf("EntriesBeyondLimit = %v", dropped)
	}

	if dropped := EntriesBeyondLimit(ids, 9); len(dropped) != 0 {
		t.Errorf("EntriesBeyondLimit under the limit = %v", dropped)
	}
}

// The manifest's noskills section moves as text; the results match what
// the yaml package prints for the same files (checked against the library).
func TestManifestSectionText(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name, in, without, block, restored string
	}{
		{
			name:     "only the section",
			in:       "noskills:\n  # c\n  concerns: []\n  tools:\n    - claude-code\n",
			without:  "{}\n",
			block:    "noskills:\n  # c\n  concerns: []\n  tools:\n    - claude-code",
			restored: "noskills:\n  # c\n  concerns: []\n  tools:\n    - claude-code\n",
		},
		{
			name:     "between other keys",
			in:       "# header\nother: 1\nnoskills:\n  # c\n  concerns: []\nlast: [a, b]\n",
			without:  "# header\nother: 1\nlast: [a, b]\n",
			block:    "noskills:\n  # c\n  concerns: []",
			restored: "# header\nother: 1\nlast: [a, b]\nnoskills:\n  # c\n  concerns: []\n",
		},
		{
			name:     "after a comment",
			in:       "# header\n\nnoskills:\n  concerns: []\n",
			without:  "# header\n\n{}\n",
			block:    "noskills:\n  concerns: []",
			restored: "# header\n\nnoskills:\n  concerns: []\n",
		},
		{
			name:     "before a trailing comment",
			in:       "workflows:\n  precommit:\n    - x\n\nnoskills:\n  a: 1\n# trailing\n",
			without:  "workflows:\n  precommit:\n    - x\n\n# trailing\n",
			block:    "noskills:\n  a: 1",
			restored: "workflows:\n  precommit:\n    - x\nnoskills:\n  a: 1\n\n# trailing\n",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			without, ok := withoutManifestSection(tc.in)
			if !ok || without != tc.without {
				t.Errorf("without = %q, %v", without, ok)
			}

			block, ok := manifestBlock(tc.in)
			if !ok || block != tc.block {
				t.Errorf("block = %q, %v", block, ok)
			}

			if restored := insertManifestSection(without, block); restored != tc.restored {
				t.Errorf("restored = %q", restored)
			}
		})
	}

	if _, ok := withoutManifestSection("other: 1\n"); ok {
		t.Error("found a section in a manifest without one")
	}

	if got := insertManifestSection("", "noskills:\n  a: 1"); got != "noskills:\n  a: 1\n" {
		t.Errorf("into an empty file: %q", got)
	}
}

func TestParseRestoreArgs(t *testing.T) {
	t.Parallel()

	request, err := ParseRestoreArgs([]string{"latest", "rules", "--overwrite", "concerns", "rules"})
	if err != nil || request.Entry != "latest" || !request.Overwrite ||
		!slices.Equal(request.Categories, []PurgeCategory{PurgeRules, PurgeConcerns}) {
		t.Errorf("request %+v, %v", request, err)
	}

	if request, err := ParseRestoreArgs(nil); err != nil || request.Entry != "" || request.Categories != nil {
		t.Errorf("no arguments: %+v, %v", request, err)
	}

	for _, args := range [][]string{{"latest", "--force"}, {"latest", "hooks"}} {
		if _, err := ParseRestoreArgs(args); !errors.Is(err, ErrRestoreArgs) {
			t.Errorf("%v: %v", args, err)
		}
	}
}

func TestDescribeError(t *testing.T) {
	t.Parallel()

	err := &PurgeHistoryError{EntryID: "x", Message: "keep a in purge history entry x", Cause: errors.New("disk full")}
	if got := DescribeError(err); got != "keep a in purge history entry x: disk full" {
		t.Errorf("DescribeError = %q", got)
	}
}

// A purge then a restore of every category gives the project back, and a
// second restore refuses to overwrite.
func TestPurgeAndRestoreEveryCategory(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	files := map[string]string{
		".eser/manifest.yml":                       "noskills:\n  concerns: []\n  tools:\n    - claude-code\n  command: noskills\n",
		".eser/concerns/move-fast.json":            "{}\n",
		".eser/rules/a.md":                         "A rule\n",
		".eser/specs/login/spec.md":                "# Spec: Login\n",
		".eser/.state/progresses/state.json":       "{}\n",
		".claude/agents/noskills-executor.md":      "old\n",
		"CLAUDE.md":                                "# Mine\n\n<!-- noskills:start -->\nx\n<!-- noskills:end -->\n",
		".claude/settings.json":                    `{"hooks":{"Stop":[{"hooks":[{"type":"command","command":"noskills invoke-hook stop"}]}]},"model":"x"}`,
		".kiro/specs/login/requirements.md":        "r\n",
		".eser/concerns/nested/empty-folder/.keep": "",
	}

	for rel, content := range files {
		writeTestFile(t, filepath.Join(root, filepath.FromSlash(rel)), content)
	}

	_ = os.Remove(filepath.Join(root, ".eser/concerns/nested/empty-folder/.keep"))

	specNames := ListSpecNames(root)
	entryID := EntryIDFor(time.Now(), nil)

	for _, category := range PurgeCategories() {
		outcome := PurgeCategoryContent(root, category, entryID, specNames)
		if !outcome.Removed || len(outcome.Errors) > 0 {
			t.Fatalf("purge %s: %+v", category, outcome)
		}
	}

	if got := readTestFile(t, filepath.Join(root, "CLAUDE.md")); got != "# Mine\n" {
		t.Errorf("CLAUDE.md after purge: %q", got)
	}

	if got := readTestFile(t, filepath.Join(root, ".claude/settings.json")); got != "{\n  \"model\": \"x\"\n}\n" {
		t.Errorf("settings after purge: %q", got)
	}

	if _, err := os.Stat(filepath.Join(root, ".kiro")); !errors.Is(err, os.ErrNotExist) {
		t.Errorf("the empty .kiro folder stayed: %v", err)
	}

	entries, err := ListPurgeEntries(root)
	if err != nil || len(entries) != 1 || !slices.Equal(entries[0].Categories, PurgeCategories()) {
		t.Fatalf("entries %+v, %v", entries, err)
	}

	outcomes := RestorePurgeCategories(root, entryID, PurgeCategories(), false)
	for _, outcome := range outcomes {
		if outcome.Failed != "" || outcome.Outcome.Refused {
			t.Fatalf("restore %s: %+v", outcome.Category, outcome)
		}
	}

	if got := readTestFile(t, filepath.Join(root, ".eser/manifest.yml")); got != files[".eser/manifest.yml"] {
		t.Errorf("manifest after restore: %q", got)
	}

	if _, err := os.Stat(filepath.Join(root, ".eser/concerns/nested/empty-folder")); err != nil {
		t.Errorf("the empty folder did not come back: %v", err)
	}

	if got := readTestFile(t, filepath.Join(root, "CLAUDE.md")); !strings.Contains(got, "# Mine") || !strings.Contains(got, noskillsSectionStart) {
		t.Errorf("sync did not put the CLAUDE.md section back: %q", got)
	}

	for _, outcome := range RestorePurgeCategories(root, entryID, PurgeCategories(), false) {
		if !outcome.Outcome.Refused {
			t.Errorf("a second restore of %s was not refused: %+v", outcome.Category, outcome)
		}
	}

	for _, outcome := range RestorePurgeCategories(root, entryID, PurgeCategories(), true) {
		if outcome.Failed != "" || outcome.Outcome.Refused {
			t.Errorf("restore %s with overwrite: %+v", outcome.Category, outcome)
		}
	}
}

func TestPruneKeepsTheNewestEntries(t *testing.T) {
	t.Parallel()

	root := t.TempDir()

	for day := 1; day <= 7; day++ {
		id := EntryIDFor(time.Date(2026, 1, day, 0, 0, 0, 0, time.UTC), nil)
		writeTestFile(t, filepath.Join(root, filepath.FromSlash(EntryPath(id)), "rules", "x"), "x")
	}

	writeTestFile(t, filepath.Join(root, filepath.FromSlash(PurgeHistoryDir), "not-an-entry", "x"), "x")

	dropped, err := PrunePurgeHistory(root, PurgeHistoryLimit)
	if err != nil || !slices.Equal(dropped, []string{"2026-01-01T00-00-00-000Z", "2026-01-02T00-00-00-000Z"}) {
		t.Fatalf("dropped %v, %v", dropped, err)
	}

	entries, _ := ListPurgeEntries(root)
	if len(entries) != PurgeHistoryLimit || entries[0].ID != "2026-01-07T00-00-00-000Z" {
		t.Errorf("entries %+v", entries)
	}
}
