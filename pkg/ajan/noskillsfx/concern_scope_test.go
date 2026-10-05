// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx_test

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/noskillsfx"
)

// scopedConcernJSON is a project concern with scoped and plain content. The
// plain reminder holds the words the old keyword filter matched; without a
// scope it still applies to every spec.
const scopedConcernJSON = `{
  "id": "custom",
  "name": "Custom",
  "description": "A project concern with scoped and plain content",
  "extras": [],
  "specSections": [
    {"id": "screens", "title": "Screens", "placeholder": "_s_", "scope": ["ui"], "position": "after:tasks"},
    {"id": "endpoints", "title": "Endpoints", "placeholder": "_e_", "scope": ["api"], "position": "after:tasks"},
    {"id": "rollout", "title": "Rollout", "placeholder": "_r_", "position": "after:tasks"},
    {"id": "cli-help", "title": "CLI Help", "placeholder": "_c_", "condition": "involvesCLI", "position": "after:tasks"}
  ],
  "reminders": [
    "Plain: the migration, the loading state and the API docs",
    {"text": "UI: design every state", "scope": ["ui"]},
    {"text": "API: document every endpoint", "scope": ["api"]},
    {"text": "Migration: write a rollback for each schema change", "scope": ["migration"]},
    {"text": "Either: name things for the reader", "scope": ["ui", "api"]}
  ],
  "acceptanceCriteria": []
}`

// unscopedConcernJSON was written before scopes existed: its reminders use
// the old keywords and none of them is UI-, API- or file-specific any more.
const unscopedConcernJSON = `{
  "id": "legacy",
  "name": "Legacy",
  "description": "A project concern written before scopes existed",
  "extras": [],
  "specSections": ["Legacy Section"],
  "reminders": [
    "No AI slop: every UI element is intentional",
    "Endpoint should be documented in API docs",
    "Plan the migration and its rollback"
  ],
  "acceptanceCriteria": []
}`

const (
	plainReminder     = "custom: Plain: the migration, the loading state and the API docs"
	uiReminder        = "custom: UI: design every state"
	apiReminder       = "custom: API: document every endpoint"
	migrationReminder = "custom: Migration: write a rollback for each schema change"
	eitherReminder    = "custom: Either: name things for the reader"
)

func legacyReminders() []string {
	return []string{
		"legacy: No AI slop: every UI element is intentional",
		"legacy: Endpoint should be documented in API docs",
		"legacy: Plan the migration and its rollback",
	}
}

// loadTestConcerns writes the given concern files to a temporary directory
// and loads them through LoadConcerns.
func loadTestConcerns(t *testing.T, files map[string]string) ([]noskillsfx.ConcernDefinition, error) {
	t.Helper()

	dir := t.TempDir()

	for name, content := range files {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(content), 0o600); err != nil {
			t.Fatalf("write %s: %v", name, err)
		}
	}

	return noskillsfx.LoadConcerns(dir)
}

func mustLoadScopedConcerns(t *testing.T) []noskillsfx.ConcernDefinition {
	t.Helper()

	concerns, err := loadTestConcerns(t, map[string]string{
		"100-custom.json": scopedConcernJSON,
		"200-legacy.json": unscopedConcernJSON,
	})
	if err != nil {
		t.Fatalf("LoadConcerns: %v", err)
	}

	return concerns
}

func noFlags() noskillsfx.SpecClassification {
	return noskillsfx.SpecClassification{} //nolint:exhaustruct // every flag false is the point
}

func uiSpec() *noskillsfx.SpecClassification {
	cl := noFlags()
	cl.InvolvesWebUI = true

	return &cl
}

func apiSpec() *noskillsfx.SpecClassification {
	cl := noFlags()
	cl.InvolvesPublicAPI = true

	return &cl
}

func migrationSpec() *noskillsfx.SpecClassification {
	cl := noFlags()
	cl.InvolvesMigration = true

	return &cl
}

// otherSpec is a CLI-only spec: none of the flags a scope names is set.
func otherSpec() *noskillsfx.SpecClassification {
	cl := noFlags()
	cl.InvolvesCLI = true

	return &cl
}

func TestLoadConcernsReadsPlainAndScopedReminders(t *testing.T) {
	t.Parallel()

	concerns := mustLoadScopedConcerns(t)
	custom := concerns[0]

	if len(custom.Reminders) != 5 {
		t.Fatalf("got %d reminders, want 5", len(custom.Reminders))
	}

	if custom.Reminders[0].Scope != nil {
		t.Errorf("plain reminder scope = %v, want none", custom.Reminders[0].Scope)
	}

	if got := custom.Reminders[4].Scope; !slices.Equal(got, []noskillsfx.ConcernScope{"ui", "api"}) {
		t.Errorf("scoped reminder scope = %v, want [ui api]", got)
	}
}

func TestLoadConcernsRefusesInvalidScopes(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name    string
		content string
		wantErr error
		message string
	}{
		{
			name:    "unknown reminder scope value",
			content: `{"id": "x", "reminders": [{"text": "Check it", "scope": ["UI"]}], "specSections": []}`,
			wantErr: noskillsfx.ErrInvalidScope,
			message: `reminders[0].scope has "UI"`,
		},
		{
			name:    "unknown section scope value",
			content: `{"id": "x", "reminders": [], "specSections": [{"id": "s", "scope": ["cli"]}]}`,
			wantErr: noskillsfx.ErrInvalidScope,
			message: `specSections[0].scope has "cli"`,
		},
		{
			name:    "section scope that is not a list",
			content: `{"id": "x", "reminders": [], "specSections": [{"id": "s", "scope": "ui"}]}`,
			wantErr: noskillsfx.ErrInvalidScope,
			message: "specSections[0].scope is not a list",
		},
		{
			name:    "reminder object without text",
			content: `{"id": "x", "reminders": [{"scope": ["ui"]}], "specSections": []}`,
			wantErr: noskillsfx.ErrInvalidReminder,
			message: `"text" string`,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			_, err := loadTestConcerns(t, map[string]string{"100-x.json": tc.content})
			if !errors.Is(err, tc.wantErr) {
				t.Fatalf("err = %v, want %v", err, tc.wantErr)
			}

			if !strings.Contains(err.Error(), tc.message) {
				t.Errorf("err = %q, want it to contain %q", err, tc.message)
			}
		})
	}
}

func TestGetRemindersFiltersByDeclaredScope(t *testing.T) {
	t.Parallel()

	concerns := mustLoadScopedConcerns(t)

	cases := []struct {
		name string
		cl   *noskillsfx.SpecClassification
		want []string
	}{
		{
			"unclassified spec keeps every reminder",
			nil,
			[]string{plainReminder, uiReminder, apiReminder, migrationReminder, eitherReminder},
		},
		{"UI spec", uiSpec(), []string{plainReminder, uiReminder, eitherReminder}},
		{"API spec", apiSpec(), []string{plainReminder, apiReminder, eitherReminder}},
		{"migration spec", migrationSpec(), []string{plainReminder, migrationReminder}},
		{"other spec", otherSpec(), []string{plainReminder}},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			got := noskillsfx.GetReminders(concerns[:1], tc.cl)
			if !slices.Equal(got, tc.want) {
				t.Errorf("GetReminders = %v, want %v", got, tc.want)
			}

			// Reminders without a scope reach every spec, whatever they say.
			legacy := noskillsfx.GetReminders(concerns[1:], tc.cl)
			if !slices.Equal(legacy, legacyReminders()) {
				t.Errorf("GetReminders(legacy) = %v, want %v", legacy, legacyReminders())
			}
		})
	}
}

func TestSplitRemindersByTierUsesDeclaredScope(t *testing.T) {
	t.Parallel()

	concerns := mustLoadScopedConcerns(t)

	cases := []struct {
		name      string
		cl        *noskillsfx.SpecClassification
		wantTier1 []string
		wantTier2 []string
	}{
		{
			name:      "unclassified spec",
			cl:        nil,
			wantTier1: append([]string{plainReminder}, legacyReminders()...),
			wantTier2: []string{uiReminder, apiReminder, migrationReminder, eitherReminder},
		},
		{
			name:      "UI spec",
			cl:        uiSpec(),
			wantTier1: append([]string{plainReminder}, legacyReminders()...),
			wantTier2: []string{uiReminder, eitherReminder},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			tier1, tier2 := noskillsfx.SplitRemindersByTier(concerns, tc.cl)
			if !slices.Equal(tier1, tc.wantTier1) {
				t.Errorf("tier1 = %v, want %v", tier1, tc.wantTier1)
			}

			if !slices.Equal(tier2, tc.wantTier2) {
				t.Errorf("tier2 = %v, want %v", tier2, tc.wantTier2)
			}
		})
	}
}

func TestGetTier2RemindersForFileUsesDeclaredScope(t *testing.T) {
	t.Parallel()

	concerns := mustLoadScopedConcerns(t)

	cases := []struct {
		name     string
		cl       *noskillsfx.SpecClassification
		filePath string
		want     []string
	}{
		{"UI spec, UI file", uiSpec(), "src/app/page.tsx", []string{uiReminder, eitherReminder}},
		{"UI spec, source file", uiSpec(), "src/server/routes.ts", nil},
		{"API spec, source file", apiSpec(), "pkg/server/routes.go", []string{apiReminder, eitherReminder}},
		{"API spec, UI file", apiSpec(), "src/app/page.tsx", nil},
		{"migration spec, any file", migrationSpec(), "db/001_init.sql", []string{migrationReminder}},
		{"other spec, UI file", otherSpec(), "src/app/page.tsx", nil},
		{"other spec, source file", otherSpec(), "src/cli.ts", nil},
		{"unclassified spec, UI file", nil, "src/app/page.tsx", []string{uiReminder, migrationReminder, eitherReminder}},
		{"unclassified spec, file of no listed type", nil, "README.md", []string{migrationReminder}},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			got := noskillsfx.GetTier2RemindersForFile(concerns, tc.filePath, tc.cl)
			if !slices.Equal(got, tc.want) {
				t.Errorf("GetTier2RemindersForFile(%q) = %v, want %v", tc.filePath, got, tc.want)
			}
		})
	}
}

func TestGenerateInitialSpecHonorsSectionScopes(t *testing.T) {
	t.Parallel()

	concerns := mustLoadScopedConcerns(t)

	cases := []struct {
		name string
		cl   *noskillsfx.SpecClassification
		want map[string]string
	}{
		{
			name: "unclassified spec hides scoped sections",
			cl:   nil,
			want: map[string]string{
				"screens": "conditional-hidden", "endpoints": "conditional-hidden",
				"rollout": "placeholder", "cli-help": "conditional-hidden",
			},
		},
		{
			name: "UI spec shows the ui section",
			cl:   uiSpec(),
			want: map[string]string{
				"screens": "placeholder", "endpoints": "conditional-hidden",
				"rollout": "placeholder", "cli-help": "conditional-hidden",
			},
		},
		{
			name: "API spec shows the api section",
			cl:   apiSpec(),
			want: map[string]string{
				"screens": "conditional-hidden", "endpoints": "placeholder",
				"rollout": "placeholder", "cli-help": "conditional-hidden",
			},
		},
		{
			name: "other spec shows unscoped sections and matching conditions",
			cl:   otherSpec(),
			want: map[string]string{
				"screens": "conditional-hidden", "endpoints": "conditional-hidden",
				"rollout": "placeholder", "cli-help": "placeholder",
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			args := noskillsfx.GenerateSpecArgs{ //nolint:exhaustruct // creator is not part of this check
				SpecName:       "scoped",
				ActiveConcerns: concerns[:1],
				Classification: tc.cl,
				Now:            "2026-10-05T00:00:00Z",
			}

			result, err := noskillsfx.GenerateInitialSpec(args)
			if err != nil {
				t.Fatalf("GenerateInitialSpec: %v", err)
			}

			got := map[string]string{}

			for _, p := range result.Placeholders {
				if p.ConcernSource != nil && *p.ConcernSource == "custom" {
					got[p.SectionID] = p.Status
				}
			}

			for id, want := range tc.want {
				if got[id] != want {
					t.Errorf("section %s status = %q, want %q", id, got[id], want)
				}
			}
		})
	}
}

func TestConcernReminderJSONKeepsItsShape(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name     string
		reminder noskillsfx.ConcernReminder
		want     string
	}{
		{"plain reminder is a string", noskillsfx.ConcernReminder{Text: "Plain", Scope: nil}, `"Plain"`},
		{
			"scoped reminder is an object",
			noskillsfx.ConcernReminder{Text: "Scoped", Scope: []noskillsfx.ConcernScope{"data"}},
			`{"text":"Scoped","scope":["data"]}`,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			data, err := json.Marshal(tc.reminder)
			if err != nil {
				t.Fatalf("Marshal: %v", err)
			}

			if string(data) != tc.want {
				t.Errorf("Marshal = %s, want %s", data, tc.want)
			}

			var back noskillsfx.ConcernReminder
			if err := json.Unmarshal(data, &back); err != nil {
				t.Fatalf("Unmarshal: %v", err)
			}

			if back.Text != tc.reminder.Text || !slices.Equal(back.Scope, tc.reminder.Scope) {
				t.Errorf("round trip = %+v, want %+v", back, tc.reminder)
			}
		})
	}
}

func TestCompileExecutingCarriesOnlyUnscopedReminders(t *testing.T) {
	t.Parallel()

	concerns := mustLoadScopedConcerns(t)

	cases := []struct {
		name        string
		cl          *noskillsfx.SpecClassification
		wantSummary string
	}{
		{"UI spec counts its two scoped reminders", uiSpec(), "2 file-specific rules"},
		{"other spec has no scoped reminder to count", otherSpec(), ""},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			state := stateIn(noskillsfx.PhaseExecuting, 1)
			state.Classification = tc.cl

			out := noskillsfx.Compile(
				state,
				noskillsfx.NosManifest{Concerns: []string{"custom", "legacy"}}, //nolint:exhaustruct // only the active concerns matter here
				noskillsfx.CompileOptions{AllConcerns: concerns},               //nolint:exhaustruct // defaults for the rest
			)

			want := append([]string{plainReminder}, legacyReminders()...)
			if out.Context == nil || !slices.Equal(out.Context.ConcernReminders, want) {
				t.Fatalf("ConcernReminders = %+v, want %v", out.Context, want)
			}

			got := ""
			if out.Behavioral.Tier2Summary != nil {
				got = *out.Behavioral.Tier2Summary
			}

			if tc.wantSummary == "" && got != "" {
				t.Errorf("Tier2Summary = %q, want none", got)
			}

			if !strings.HasPrefix(got, tc.wantSummary) {
				t.Errorf("Tier2Summary = %q, want it to start with %q", got, tc.wantSummary)
			}
		})
	}
}
