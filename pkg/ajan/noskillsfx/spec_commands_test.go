// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func mustParse(t *testing.T, text string) any {
	t.Helper()

	value, err := parseJSON(text)
	if err != nil {
		t.Fatal(err)
	}

	return value
}

// TestFormatOutput covers the renderers' JavaScript edges: values printed
// through templates, null fields skipped by join, and a field read on null
// failing as the TypeScript renderer throws.
func TestFormatOutput(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name, data, format, want, err string
	}{
		{"json", `{"a":1}`, OutputJSON, "{\n  \"a\": 1\n}", ""},
		{"empty object", `{"error":"x"}`, OutputMarkdown, "", ""},
		{"an array", `[{"phase":"IDLE"}]`, OutputText, "", ""},
		{"null instruction joins as empty", `{"phase":null,"instruction":null}`, OutputMarkdown, "# noskills — null\n\n## Instruction\n\n\n", ""},
		{"objects print as templates", `{"statusReport":{"criteria":[{"id":"a"},"b",[1,2]]}}`, OutputMarkdown,
			"## Acceptance Criteria\n\n- [ ] [object Object]\n- [ ] b\n- [ ] 1,2\n", ""},
		{"criteria and debt items are labelled", `{"statusReport":{"criteria":[{"id":"ac-1","text":"x"},{"text":"y"}]},` +
			`"previousIterationDebt":{"note":"n","items":[{"id":"debt-1","text":"z","since":1}]}}`, OutputText,
			"\nCriteria:\n  - ac-1: x\n  - y\n\nn\n  - debt-1: z", ""},
		{"missing summary fields", `{"summary":{}}`, OutputText, "Spec: undefined, Iterations: undefined, Decisions: undefined", ""},
		{"null summary throws", `{"summary":null}`, OutputMarkdown, "", "Cannot read properties of null (reading 'spec')"},
		{"transition skips the iteration", `{"transition":{"onComplete":"x","iteration":2,"n":null}}`, OutputMarkdown,
			"## Next Steps\n\n- **onComplete:** `x`\n- **n:** `null`\n", ""},
		{"verification output is cut in text", `{"verificationFailed":true,"verificationOutput":"` + strings.Repeat("é", 250) + `"}`, OutputText,
			"\nVerification failed: " + strings.Repeat("é", 200), ""},
		{"skipped validation", `{"validation":{"agent":null,"status":"skipped","reason":"no agent"}}`, OutputText,
			"\nValidation (not run): Skipped: no agent", ""},
		{"reviewed validation", `{"validation":{"agent":"ollama","model":"m","status":"reviewed","summary":"",` +
			`"findings":[{"severity":"high","issue":"x","suggestion":""},{"severity":"low","issue":"y","suggestion":"z"}]}}`, OutputMarkdown,
			"## Validation (ollama, m)\n\n\n\n- [high] x\n- [low] y Suggestion: z\n", ""},
		{"no findings", `{"validation":{"agent":"a","model":"b","status":"reviewed","summary":"","findings":[]}}`, OutputText,
			"\nValidation (a, b): No findings.", ""},
		{"questions and extras", `{"questions":[{"id":"q1","text":"Why?","extras":["more"]},{"id":"q2","text":"How?"}]}`, OutputText,
			"\nQuestion [q1]: Why?\n  - more\n\nQuestion [q2]: How?", ""},
	}

	for _, tc := range cases {
		got, err := FormatOutput(mustParse(t, tc.data), tc.format)

		switch {
		case tc.err != "" && (err == nil || err.Error() != tc.err):
			t.Errorf("%s: error %v, want %q", tc.name, err, tc.err)
		case tc.err == "" && err != nil:
			t.Errorf("%s: error %v", tc.name, err)
		case got != tc.want:
			t.Errorf("%s: got %q, want %q", tc.name, got, tc.want)
		}
	}
}

func TestQuestionNumber(t *testing.T) {
	t.Parallel()

	cases := []struct {
		text string
		want int
		ok   bool
	}{
		{"2", 2, true},
		{"10", 10, true},
		{"1x", 0, false},
		{"", 0, false},
		{" 1", 0, false},
		{"1.5", 0, false},
		{"-1", 0, false},
	}

	for _, tc := range cases {
		if got, ok := questionNumber(tc.text); got != tc.want || ok != tc.ok {
			t.Errorf("questionNumber(%q) = %d, %v; want %d, %v", tc.text, got, ok, tc.want, tc.ok)
		}
	}
}

func TestMigrateLegacyLayout(t *testing.T) {
	t.Parallel()

	write := func(t *testing.T, root, rel, content string) {
		t.Helper()

		path := filepath.Join(root, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
			t.Fatal(err)
		}

		if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
			t.Fatal(err)
		}
	}

	t.Run("nothing to move", func(t *testing.T) {
		t.Parallel()

		root := t.TempDir()
		write(t, root, ".eser/.state/progresses/state.json", "{}")

		moved, err := MigrateLegacyLayout(root, func(string) { t.Error("notice without a move") })
		if moved || err != nil {
			t.Fatalf("moved %v, err %v", moved, err)
		}
	})

	t.Run("the whole legacy layout", func(t *testing.T) {
		t.Parallel()

		root := t.TempDir()
		write(t, root, ".eser/.state/state.json", `{"phase":"IDLE"}`)
		write(t, root, ".eser/.state/specs/a.json", "{}")
		write(t, root, ".eser/.state/purge-history/x/file", "kept")
		write(t, root, ".eser/.sessions/s1.json", "{}")
		write(t, root, ".eser/.events/events.jsonl", "{}\n")
		write(t, root, ".eser/.gitignore", ".state/\n.sessions/\n.events/\n")

		var notices []string

		moved, err := MigrateLegacyLayout(root, func(text string) { notices = append(notices, text) })
		if !moved || err != nil {
			t.Fatalf("moved %v, err %v", moved, err)
		}

		for _, rel := range []string{
			".eser/.state/progresses/state.json", ".eser/.state/progresses/specs/a.json", ".eser/.state/purge-history/x/file",
			".eser/.state/sessions/s1.json", ".eser/.state/events/events.jsonl",
		} {
			if _, err := os.Stat(filepath.Join(root, filepath.FromSlash(rel))); err != nil {
				t.Errorf("%s: %v", rel, err)
			}
		}

		if data, _ := os.ReadFile(filepath.Join(root, ".eser", ".gitignore")); string(data) != eserGitignoreContent { //nolint:gosec // G304: the test's temp dir
			t.Errorf(".gitignore is %q", data)
		}

		if len(notices) != 1 || notices[0] != LegacyMigrationNotice {
			t.Errorf("notices %q", notices)
		}
	})

	t.Run("a partial migration", func(t *testing.T) {
		t.Parallel()

		root := t.TempDir()
		write(t, root, ".eser/.state/state.json", "{}")
		write(t, root, ".eser/.state/progresses/state.json", "{}")

		var partial *PartialMigrationError

		if _, err := MigrateLegacyLayout(root, nil); !errors.As(err, &partial) {
			t.Fatalf("err %v, want a partial migration", err)
		}
	})
}

func TestSplitSpecRefusesBeforeWriting(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, specsDir, "taken"), 0o750); err != nil {
		t.Fatal(err)
	}

	parent := InitialState().with("phase", PhaseDiscovery, "spec", "parent")
	e := &LifecycleEnv{Root: root}

	children := []ChildSpec{{Name: "fresh"}, {Name: "taken"}}

	var refused *SplitRefusedError
	if _, err := SplitSpec(e, parent, children, "noskills"); !errors.As(err, &refused) || refused.Names[0] != "taken" {
		t.Fatalf("err %v, want the taken name refused", err)
	}

	if pathExists(filepath.Join(root, specsDir, "fresh")) {
		t.Error("a refused split created a child")
	}

	completed, err := SplitSpec(e, parent, []ChildSpec{{Name: "one", Description: "First"}, {Name: "two"}}, "noskills")
	if err != nil {
		t.Fatal(err)
	}

	if phaseOf(completed) != PhaseCompleted || completed.str("completionNote") != "Split into: one, two" {
		t.Errorf("parent %s", jsonStringify(completed))
	}

	child := ReadSpecStateObject(root, "two", nil)
	if phaseOf(child) != PhaseDiscoveryRefinement || !child.isNullish("specDescription") {
		t.Errorf("child %s", jsonStringify(child))
	}
}
