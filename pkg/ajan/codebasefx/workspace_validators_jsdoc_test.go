// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package codebasefx

import "testing"

// extractJSDocEntries: the single-pass rewrite must attach exactly the JSDoc
// that immediately precedes each export, and number lines like the file does.
func TestExtractJSDocEntries(t *testing.T) {
	t.Parallel()

	content := "/** first */\nexport const a = 1;\n" + // line 2, documented
		"\n" +
		"/** stray */\nconst hidden = 2;\n" + // JSDoc followed by code, not an export
		"export function b() {}\n" + // line 6, no doc (stray is not adjacent)
		"\n" +
		"/**\n * multi\n */\n\n" + // blank line between is still adjacent
		"export class C {}\n" + // line 12, documented
		"export type D = string;\n" // line 13, no doc

	entries := extractJSDocEntries(content)

	want := []jsDocEntry{
		{jsdoc: " first ", symbolName: "a", line: 2},
		{jsdoc: "", symbolName: "b", line: 6},
		{jsdoc: "\n * multi\n ", symbolName: "C", line: 12},
		{jsdoc: "", symbolName: "D", line: 13},
	}

	if len(entries) != len(want) {
		t.Fatalf("got %d entries, want %d: %+v", len(entries), len(want), entries)
	}

	for i := range want {
		if entries[i] != want[i] {
			t.Errorf("entry %d = %+v, want %+v", i, entries[i], want[i])
		}
	}
}

func TestExtractJSDocEntries_NoExports(t *testing.T) {
	t.Parallel()

	if got := extractJSDocEntries("/** doc */\nconst x = 1;\n"); got != nil {
		t.Errorf("expected nil for a file without exports, got %+v", got)
	}
}
