// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

const (
	sectionSpec   = "upload"
	sectionReason = "The upload changes no stored data at all"
)

// sectionProject is a project whose spec "upload" is in phase, with the
// spec.md and placeholders `spec new` writes; state.json names the spec
// when global is set.
func sectionProject(t *testing.T, phase string, global bool) *LifecycleEnv {
	t.Helper()

	root := t.TempDir()
	initial := GenerateInitialSpecObject(sectionSpec, nil, nil, "Creator", "2026-01-01T00:00:00.000Z")
	specMD := filepath.Join(root, specsDir, sectionSpec, "spec.md")

	if err := os.MkdirAll(filepath.Dir(specMD), 0o750); err != nil {
		t.Fatal(err)
	}

	if err := os.WriteFile(specMD, []byte(initial.Content), 0o600); err != nil {
		t.Fatal(err)
	}

	state := InitialState().with("phase", phase, "spec", sectionSpec, "specState", initialSpecState().with(
		"path", specsDir+"/"+sectionSpec+"/spec.md", "placeholders", initial.Placeholders, "metadata", initial.Metadata))

	write := WriteSpecStateObject(root, sectionSpec, state, nil)
	if global {
		write = WriteStateAndSpec(root, state, nil)
	}

	if write != nil {
		t.Fatal(write)
	}

	return &LifecycleEnv{
		Root: root,
		Now:  func() time.Time { return time.Date(2026, 2, 3, 4, 5, 6, 0, time.UTC) },
	}
}

func sectionStatus(t *testing.T, state *JSObject, id string) *JSObject {
	t.Helper()

	for _, p := range objectsOf(state.objOrEmpty("specState").arr("placeholders")) {
		if p.str("sectionId") == id {
			return p
		}
	}

	t.Fatalf("no placeholder %s in %s", id, jsonStringify(state))

	return nil
}

// TestResolveSpecSectionRefuses checks the checks of resolveSection, in
// order, and that a refusal writes nothing.
func TestResolveSpecSectionRefuses(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name, phase, id, action, text, kind, message string
		details                                      []string
	}{
		{"no action", PhaseDiscovery, "summary", "", "", "usage",
			`Usage: npx eser@latest noskills spec upload section <list | <id> fill "text" | <id> na "reason">`, nil},
		{"unknown action", PhaseDiscovery, "summary", "set", "x", "usage", "", nil},
		{"empty text", PhaseDiscovery, "summary", SectionFill, " \t", "text", "Please provide the section text.", nil},
		{"empty reason", PhaseDiscovery, "summary", SectionNA, "", "text", "Please provide the reason the section does not apply.", nil},
		{"phase", PhaseExecuting, "summary", SectionFill, "x", "phase", "Cannot change spec sections in phase EXECUTING.",
			[]string{"The completeness gate checks them during DISCOVERY and DISCOVERY_REFINEMENT."}},
		{"unknown section", PhaseDiscoveryRefinement, "bogus", SectionFill, "x", "unknown", "Unknown section: bogus",
			[]string{"  Valid: summary, problem-statement, ambition, reversibility, user-impact, verification-strategy, " +
				"scope-boundary, premises, tasks, acceptance-criteria"}},
		{"short reason", PhaseDiscovery, "premises", SectionNA, " too short ", "reason",
			`N/A reason for "premises" is too short (9 chars, minimum 20). Provide a specific reason why this section ` +
				"does not apply. Vague N/As are hand-waving — the Jidoka gate will reject them.", nil},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			e := sectionProject(t, tc.phase, false)
			before := ReadSpecStateObject(e.Root, sectionSpec, nil)

			_, err := ResolveSpecSection(context.Background(), e, sectionSpec, tc.id, tc.action, tc.text)

			refusal, ok := IsRefusal(err)
			if !ok || refusal.Kind != tc.kind {
				t.Fatalf("err %v, want a %s refusal", err, tc.kind)
			}

			if tc.message != "" && refusal.Message != tc.message {
				t.Errorf("message %q, want %q", refusal.Message, tc.message)
			}

			if strings.Join(refusal.Details, "\n") != strings.Join(tc.details, "\n") {
				t.Errorf("details %q, want %q", refusal.Details, tc.details)
			}

			if after := ReadSpecStateObject(e.Root, sectionSpec, nil); jsonStringify(after) != jsonStringify(before) {
				t.Errorf("a refusal wrote the state: %s", jsonStringify(after))
			}
		})
	}
}

// TestResolveSpecSectionHiddenAndResolved checks the refusals for a hidden
// section and for one already resolved.
func TestResolveSpecSectionHiddenAndResolved(t *testing.T) {
	t.Parallel()

	e := sectionProject(t, PhaseDiscovery, false)
	state := ReadSpecStateObject(e.Root, sectionSpec, nil)
	specState := state.objOrEmpty("specState")
	placeholders := appendAny(specState.arr("placeholders"),
		JSObjectOf("sectionId", "design-states", "sectionTitle", "Design States", "status", "conditional-hidden"))

	if err := WriteSpecStateObject(e.Root, sectionSpec, state.with("specState", specState.with("placeholders", placeholders)), nil); err != nil {
		t.Fatal(err)
	}

	_, err := ResolveSpecSection(context.Background(), e, sectionSpec, "design-states", SectionFill, "x")
	if refusal, ok := IsRefusal(err); !ok || refusal.Kind != "hidden" {
		t.Errorf("hidden: err %v", err)
	}

	if _, err := ResolveSpecSection(context.Background(), e, sectionSpec, "summary", SectionFill, "First."); err != nil {
		t.Fatal(err)
	}

	_, err = ResolveSpecSection(context.Background(), e, sectionSpec, "summary", SectionNA, sectionReason)
	if refusal, ok := IsRefusal(err); !ok || refusal.Message != "Section summary is already resolved." {
		t.Errorf("resolved: err %v", err)
	}
}

// TestResolveSpecSection checks a fill and an N/A: the placeholder, the
// spec.md section and TOC, which state files are written, and the open
// sections reported.
func TestResolveSpecSection(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name, action, text, wantStatus, wantText string
		global                                   bool
	}{
		{"fill", SectionFill, "  Users upload photos.  ", "filled",
			"Users upload photos.\n\n_Answered by Unknown User on 2026-02-03_", true},
		{"na", SectionNA, sectionReason, "na",
			"_Marked N/A by Unknown User on 2026-02-03: " + sectionReason + "_", false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			e := sectionProject(t, PhaseDiscoveryRefinement, tc.global)

			result, err := ResolveSpecSection(context.Background(), e, sectionSpec, "premises", tc.action, tc.text)
			if err != nil {
				t.Fatal(err)
			}

			if result.Title != "Premises" || !result.FileUpdated || len(result.Open) != 9 || result.Open[0] != "summary" {
				t.Errorf("result %+v", result)
			}

			placeholder := sectionStatus(t, ReadSpecStateObject(e.Root, sectionSpec, nil), "premises")
			if placeholder.str("status") != tc.wantStatus {
				t.Errorf("placeholder %s", jsonStringify(placeholder))
			}

			if tc.action == SectionNA && placeholder.str("naReason") != sectionReason {
				t.Errorf("naReason %q", placeholder.str("naReason"))
			}

			global := ReadHookState(e.Root, nil)
			if globalSpec, _ := global.strOK("spec"); (globalSpec == sectionSpec) != tc.global {
				t.Errorf("state.json %s", jsonStringify(global))
			}

			if tc.global && sectionStatus(t, global, "premises").str("status") != tc.wantStatus {
				t.Error("state.json kept the old placeholder")
			}

			data, err := os.ReadFile(filepath.Join(e.Root, specsDir, sectionSpec, "spec.md"))
			if err != nil {
				t.Fatal(err)
			}

			md := string(data)
			if !strings.Contains(md, "## Premises\n\n"+tc.wantText+"\n") || strings.Contains(md, PlaceholderMarker("premises")) {
				t.Errorf("spec.md:\n%s", md)
			}

			if symbol := placeholderSymbol(tc.wantStatus); !strings.Contains(md, "- "+symbol+" Premises") {
				t.Errorf("spec.md TOC:\n%s", md)
			}
		})
	}
}

// TestResolveSpecSectionWithoutMarker checks that a spec.md without the
// section's marker stays as it is while the state records the section.
func TestResolveSpecSectionWithoutMarker(t *testing.T) {
	t.Parallel()

	e := sectionProject(t, PhaseDiscovery, false)
	specMD := filepath.Join(e.Root, specsDir, sectionSpec, "spec.md")

	if err := os.WriteFile(specMD, []byte("# Spec: upload\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	result, err := ResolveSpecSection(context.Background(), e, sectionSpec, "summary", SectionFill, "Text.")
	if err != nil || result.FileUpdated {
		t.Fatalf("result %+v, err %v", result, err)
	}

	if data, _ := os.ReadFile(specMD); string(data) != "# Spec: upload\n" { //nolint:gosec // G304: the test's own fixture
		t.Errorf("spec.md changed: %q", data)
	}

	if status := sectionStatus(t, ReadSpecStateObject(e.Root, sectionSpec, nil), "summary").str("status"); status != "filled" {
		t.Errorf("status %s", status)
	}
}

// TestSpecSections checks the list entries and a missing spec.
func TestSpecSections(t *testing.T) {
	t.Parallel()

	e := sectionProject(t, PhaseDiscovery, false)

	if _, err := ResolveSpecSection(context.Background(), e, sectionSpec, "tasks", SectionNA, sectionReason); err != nil {
		t.Fatal(err)
	}

	entries, err := SpecSections(e, sectionSpec)
	if err != nil {
		t.Fatal(err)
	}

	if len(entries) != len(BaseSections) || entries[0] != (SpecSectionEntry{
		ID: "summary", Title: "Summary", Status: "placeholder", Symbol: "○", Note: "",
	}) {
		t.Errorf("entries %+v", entries)
	}

	if tasks := entries[8]; tasks.Symbol != "—" || tasks.Note != " (N/A: "+sectionReason+")" {
		t.Errorf("tasks %+v", tasks)
	}

	_, err = SpecSections(e, "ghost")
	if notFound, ok := errors.AsType[*SpecNotFoundError](err); !ok || notFound.Name != "ghost" {
		t.Errorf("missing spec: err %v", err)
	}
}

// TestGateNamesTheSectionCommand checks that the completeness gate's
// refusal names each open section's id and the commands that resolve it,
// and leaves them out when only a decision is pending.
func TestGateNamesTheSectionCommand(t *testing.T) {
	t.Parallel()

	hint := "Record each answer with `nos spec upload section <id> fill \"text\"`, or mark a section that does not " +
		"apply with `nos spec upload section <id> na \"reason\"`; `nos spec upload section list` shows the ids."

	cases := []struct {
		name      string
		specState *JSObject
		want      []string
		absent    string
	}{
		{"an open section", initialSpecState().with("placeholders", []any{
			JSObjectOf("sectionId", "summary", "sectionTitle", "Summary", "status", "placeholder"),
		}), []string{"\n  - Summary (summary)\n", "fill in yourself.\n" + hint}, ""},
		{"a pending decision", initialSpecState().with("metadata", emptySpecMetadata().with("pendingDecisions", []any{
			JSObjectOf("section", "auth", "question", "Which provider?", "waitingFor", []any{"@alice"}),
		})), []string{"Pending decisions:"}, "Record each answer"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			state := InitialState().with("phase", PhaseDiscoveryRefinement, "spec", sectionSpec, "specState", tc.specState)

			_, err := approveDiscoveryReviewState(state, "nos")
			if err == nil {
				t.Fatal("the gate let an incomplete spec through")
			}

			for _, want := range tc.want {
				if !strings.Contains(err.Error(), want) {
					t.Errorf("refusal %q holds no %q", err.Error(), want)
				}
			}

			if tc.absent != "" && strings.Contains(err.Error(), tc.absent) {
				t.Errorf("refusal %q holds %q", err.Error(), tc.absent)
			}
		})
	}
}
