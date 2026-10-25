// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"regexp"
	"slices"
	"testing"
)

func TestJSReplacementPatterns(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name, s, pattern, replacement, want string
	}{
		{"plain text", "a MARK b", "MARK", "x", "a x b"},
		{"$& is the match", "a MARK b", "MARK", "[$&]", "a [MARK] b"},
		{"$$ is a dollar", "a MARK b", "MARK", "$$5", "a $5 b"},
		{"$` and $' are the sides", "a MARK b", "MARK", "<$`|$'>", "a <a | b> b"},
		{"$1 without groups stays", "a MARK b", "MARK", "$1", "a $1 b"},
		{"only the first match", "MARK MARK", "MARK", "x", "x MARK"},
		{"no match", "abc", "MARK", "x", "abc"},
	}

	for _, tc := range cases {
		if got := jsReplaceFirstString(tc.s, tc.pattern, tc.replacement); got != tc.want {
			t.Errorf("%s: got %q, want %q", tc.name, got, tc.want)
		}
	}

	re := regexp.MustCompile(`(- )\[ \]( task-1:.*)`)
	if got := jsReplaceFirstRegexp("- [ ] task-1: Do it", re, "$1[x]$2"); got != "- [x] task-1: Do it" {
		t.Errorf("groups: %q", got)
	}
}

func TestSplitDetector(t *testing.T) {
	t.Parallel()

	answers := func(statusQuo string) []*JSObject {
		return []*JSObject{JSObjectOf("questionId", "status_quo", "answer", statusQuo)}
	}

	cases := []struct {
		name      string
		statusQuo string
		want      []string
	}{
		{"numbered in parentheses", "(1) Users email support for changes. (2) Admins edit the database by hand.",
			[]string{"users-email-support-changes", "admins-edit-database-hand"}},
		// The expectations are what the TypeScript analyzeForSplit answers.
		{"dots after a colon are no list", "Today: 1. fix the login form. 2. add the audit log.", nil},
		{"ordinals", "First: rebuild the cache. Second: update the docs.",
			[]string{"rebuild-cache", "update-docs"}},
		{"a separator word", "Users cannot reset passwords. Additionally the export breaks on large files.",
			[]string{"users-cannot-reset-passwords", "export-breaks-large-files"}},
		{"two areas of two estimated tasks each", "(1) fix it (2) ship it", []string{"fix", "ship"}},
		{"coupled areas", "(1) Add the UserType model. (2) Update the views that use the UserType model.", nil},
		{"one area", "Users share one account.", nil},
	}

	for _, tc := range cases {
		proposal := AnalyzeForSplit(answers(tc.statusQuo))

		var names []string
		for _, item := range proposal.Proposals {
			names = append(names, item.Name)
		}

		if proposal.Detected != (tc.want != nil) || !slices.Equal(names, tc.want) {
			t.Errorf("%s: detected %v, names %v; want %v", tc.name, proposal.Detected, names, tc.want)
		}
	}
}

func TestParseSpecContent(t *testing.T) {
	t.Parallel()

	content := "# Spec: x\n\n## Tasks\n\n- [ ] task-1: Build the form\nFiles: `src/a.tsx`, `src/b.ts`\n- [x] TASK-2: Save it\n" +
		"\n## Out of Scope\n\n- Billing\n\n## Verification\n\n- Unit tests\n"

	parsed := ParseSpecContent("x", content)

	if len(parsed.Tasks) != 2 || parsed.Tasks[0].ID != "task-1" || !slices.Equal(parsed.Tasks[0].Files, []string{"src/a.tsx", "src/b.ts"}) ||
		parsed.Tasks[1].ID != "TASK-2" {
		t.Errorf("tasks %+v", parsed.Tasks)
	}

	if !slices.Equal(parsed.OutOfScope, []string{"Billing"}) || !slices.Equal(parsed.Verification, []string{"Unit tests"}) {
		t.Errorf("out of scope %v, verification %v", parsed.OutOfScope, parsed.Verification)
	}
}

func TestRefinementTasks(t *testing.T) {
	t.Parallel()

	tasks := parseRefinementTasks("task-1: Build the form, task-2: Save it;\ntask-3: Log it")
	if !slices.Equal(tasks, []string{"task-1: Build the form", "task-2: Save it", "task-3: Log it"}) {
		t.Errorf("tasks %q", tasks)
	}

	spec := "## Tasks\n\n<!-- PLACEHOLDER:tasks -->\n_text_\n\n## Acceptance Criteria\n\nx"
	if got := replaceTasksSection(spec, "## Tasks\n\n- [ ] task-1: A\n"); got != "## Tasks\n\n- [ ] task-1: A\n\n## Acceptance Criteria\n\nx" {
		t.Errorf("middle section: %q", got)
	}

	last := "# S\n\n## Tasks\n\nold\n\n"
	if got := replaceTasksSection(last, "## Tasks\n\nnew\n"); got != "# S\n\n## Tasks\n\nnew\n\n\n" {
		t.Errorf("last section: %q", got)
	}
}

func TestToBulletListAndDeriveTasks(t *testing.T) {
	t.Parallel()

	if got := toBulletList("No billing settings. No team management in this spec."); !slices.Equal(got,
		[]string{"No billing settings", "No team management in this spec."}) {
		t.Errorf("sentences: %q", got)
	}

	if got := toBulletList("one item\nsecond item"); !slices.Equal(got, []string{"one item", "second item"}) {
		t.Errorf("lines: %q", got)
	}

	answers := []*JSObject{
		JSObjectOf("questionId", "ambition", "answer", "1-star: a form. 10-star: the goal: passwordless sign-in with links."),
		JSObjectOf("questionId", "verification", "answer", "- Unit tests\n* An e2e test"),
	}
	decisions := []*JSObject{JSObjectOf("question", "Should we add an audit log?", "choice", "Accepted")}

	want := []string{
		"Passwordless sign-in with links", "Unit tests", "An e2e test", "Add an audit log",
		"Write or update tests for all new and changed behavior",
		"Update documentation for all public-facing changes (README, API docs, CHANGELOG)",
	}

	if got := deriveTasks(answers, decisions); !slices.Equal(got, want) {
		t.Errorf("tasks %q", got)
	}
}
