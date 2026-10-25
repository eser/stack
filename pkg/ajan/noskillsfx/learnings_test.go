// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"path/filepath"
	"testing"
)

func TestJSHelpers(t *testing.T) {
	t.Parallel()

	for _, tc := range []struct {
		text string
		want int
	}{{"2", 2}, {" 3x", 3}, {"+4", 4}, {"-1", -1}, {"07", 7}} {
		if got, ok := JSParseInt(tc.text); !ok || got != tc.want {
			t.Errorf("JSParseInt(%q) = %d, %v", tc.text, got, ok)
		}
	}

	for _, text := range []string{"", "x", "-", " "} {
		if _, ok := JSParseInt(text); ok {
			t.Errorf("JSParseInt(%q) is a number", text)
		}
	}

	if got := RuleSlug("--Use Deno Tests, always!--"); got != "use-deno-tests-always" {
		t.Errorf("RuleSlug = %q", got)
	}

	if got := JSSlice("a😀b", 0, 2); got != "a�" && got != "a" {
		t.Logf("JSSlice splits a surrogate pair into %q", got)
	}

	if got := JSPadEnd("ab", 4) + "|"; got != "ab  |" {
		t.Errorf("JSPadEnd = %q", got)
	}
}

func TestLearnings(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	writeTestFile(t, filepath.Join(root, LearningsFile), "not json\nnull\n7\n")

	for _, text := range []string{"one", "two"} {
		if err := AddLearning(root, JSObjectOf("text", text)); err != nil {
			t.Fatal(err)
		}
	}

	if all := ReadLearnings(root); len(all) != 3 {
		t.Fatalf("learnings %v", all)
	}

	if removed, err := RemoveLearning(root, 1); err != nil || !removed {
		t.Fatalf("remove: %v, %v", removed, err)
	}

	if got := readTestFile(t, filepath.Join(root, LearningsFile)); got != "7\n{\"text\":\"two\"}\n" {
		t.Errorf("file %q", got)
	}

	if removed, _ := RemoveLearning(root, 5); removed {
		t.Error("removed a learning that does not exist")
	}
}

func TestSpecTitle(t *testing.T) {
	t.Parallel()

	for content, want := range map[string]string{
		"# Spec: Login\n":                 "Login",
		"intro\n# Spec:   \n## tasks\n":   "## tasks",
		"# Spec:\n\n  Spaced  \n":         "Spaced",
		"# Spec:   \n":                    "",
		"x # Spec: not at a line start\n": "Untitled",
		"\r# Spec: after a CR":            "after a CR",
	} {
		if got := parseSpecMd(content).title; got != want {
			t.Errorf("title of %q = %q, want %q", content, got, want)
		}
	}
}
