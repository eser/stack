// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"strings"
	"testing"
)

// The expected texts are what `yaml.stringify({ k: value }, { lineWidth: 0 })`
// of the yaml package 2.9.1 prints.
func TestYAMLStringifyQuotesAsTheLibraryDoes(t *testing.T) {
	t.Parallel()

	cases := []struct {
		value any
		want  string
	}{
		{"plain", "plain"},
		{"", `""`},
		{"true", `"true"`},
		{"null", `"null"`},
		{"123", `"123"`},
		{"1.5", `"1.5"`},
		{"a: b", `"a: b"`},
		{"a:b", "a:b"},
		{"- x", `"- x"`},
		{"#x", `"#x"`},
		{"x #y", `"x #y"`},
		{"it's", "it's"},
		{`say "hi"`, `say "hi"`},
		{"  lead", `"  lead"`},
		{"trail ", `"trail "`},
		{"multi\nline", "|-\n  multi\n  line"},
		{"~", `"~"`},
		{"yes", "yes"},
		{"2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z"},
		{"[x]", `"[x]"`},
		{"@at", `"@at"`},
		{"x:", `"x:"`},
		{"0x1F", `"0x1F"`},
		{"1e3", `"1e3"`},
		{".5", `".5"`},
		{"-", `"-"`},
		{"--", "--"},
		{"Unknown User", "Unknown User"},
		{"a\x07b", `"a\ab"`},
		{": x", `": x"`},
		{"NaN", "NaN"},
		{".nan", `".nan"`},
		{"+1", `"+1"`},
		{15.0, "15"},
		{nil, "null"},
		{false, "false"},
	}

	for _, tc := range cases {
		got := yamlStringify(JSObjectOf("k", tc.value), 0)
		if want := "k: " + tc.want + "\n"; got != want {
			t.Errorf("stringify(%q) = %q, want %q", tc.value, got, want)
		}
	}
}

func TestYAMLStringifyNestsBlocks(t *testing.T) {
	t.Parallel()

	metadata := JSObjectOf(
		"created", JSObjectOf("date", "x", "user", "y"),
		"contributors", []any{JSObjectOf("user", "u", "lastAction", "created", "date", "d")},
		"approvals", []any{},
		"pendingDecisions", []any{JSObjectOf("section", "s", "question", "q", "waitingFor", []any{"a", "b"})},
	)

	want := strings.Join([]string{
		"created:",
		"  date: x",
		"  user: y",
		"contributors:",
		"  - user: u",
		"    lastAction: created",
		"    date: d",
		"approvals: []",
		"pendingDecisions:",
		"  - section: s",
		"    question: q",
		"    waitingFor:",
		"      - a",
		"      - b",
		"",
	}, "\n")

	if got := yamlStringify(metadata, 0); got != want {
		t.Errorf("got\n%s\nwant\n%s", got, want)
	}
}

// The manifest is written at the library's default width of 80: long
// plain and quoted values fold at spaces, as the yaml package folds them.
func TestYAMLFoldsLongValuesAtTheDefaultWidth(t *testing.T) {
	t.Parallel()

	got := renderManifestSection(JSObjectOf(
		"verifyCommand", strings.Repeat("word ", 30)+"end",
		"other", strings.Repeat("a ", 50)+"b",
		"q", strings.Repeat(`"quoted" `, 12),
	))

	want := "noskills:\n  # noskills orchestrator — inline comments in this section won't be preserved on next write\n" +
		"  verifyCommand: word word word word word word word word word word word word word\n" +
		"    word word word word word word word word word word word word word word word\n" +
		"    word word end\n" +
		"  other: a a a a a a a a a a a a a a a a a a a a a a a a a a a a a a a a a a a a a\n" +
		"    a a a a a a a a a a a a a b\n" +
		`  q: '"quoted" "quoted" "quoted" "quoted" "quoted" "quoted" "quoted" "quoted"` + "\n" +
		`    "quoted" "quoted" "quoted" "quoted" '`

	if got != want {
		t.Errorf("got\n%s\nwant\n%s", got, want)
	}
}
