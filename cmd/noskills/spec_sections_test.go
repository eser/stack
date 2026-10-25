// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

import (
	"context"
	"regexp"
	"strings"
	"testing"
)

var ansiCode = regexp.MustCompile("\x1b\\[[0-9;]*m") //nolint:gochecknoglobals // compiled once

// TestSpecSection runs `spec <name> section` in order on one spec: the
// list, the refusals, a fill, an N/A, and the gate passing once every
// section is resolved. None of it starts the TypeScript CLI.
func TestSpecSection(t *testing.T) {
	t.Parallel()

	te := newTestEnv(t, initializedProject(t, "IDLE"))
	te.vars[envTSCLI] = "node main.ts"

	if code := run(context.Background(), te.env, []string{"spec", "new", "upload", "Let users upload photos"}); code != 0 {
		t.Fatalf("spec new: exit %d: %s", code, te.stdout)
	}

	reason := "The upload changes no stored data at all"
	section := func(args ...string) []string { return append([]string{"spec", "upload", "section"}, args...) }

	type sectionStep struct {
		args []string
		code int
		want string
	}

	opens := []string{"problem-statement", "ambition", "reversibility", "user-impact", "verification-strategy", "scope-boundary", "tasks"}
	steps := make([]sectionStep, 0, 12+len(opens))
	steps = append(steps,
		sectionStep{section(), 0, "  ○ summary  Summary\n"},
		sectionStep{section("list"), 0, "N/A:  noskills spec upload section <id> na \"reason\"\n"},
		sectionStep{section("summary"), 1, "Usage: noskills spec upload section <list | <id> fill \"text\" | <id> na \"reason\">\n"},
		sectionStep{section("summary", "fill"), 1, "Please provide the section text.\n"},
		sectionStep{section("bogus", "fill", "x"), 1, "Unknown section: bogus\n  Valid: summary, problem-statement,"},
		sectionStep{section("premises", "na", "too", "short"), 1, `N/A reason for "premises" is too short (9 chars, minimum 20).`},
		sectionStep{section("summary", "fill", "Users", "upload", "photos."), 0, "Section filled: Summary (by Unknown User)\nStill open: problem-statement,"},
		sectionStep{section("summary", "fill", "Again."), 1, "Section summary is already resolved.\n"},
		sectionStep{section("premises", "na", reason), 0, "Section marked N/A: Premises (by Unknown User)\n"},
		sectionStep{[]string{"spec", "ghost", "section", "list"}, 1, "Spec 'ghost' not found."},
	)

	for _, open := range opens {
		steps = append(steps, sectionStep{section(open, "na", reason), 0, ""})
	}

	steps = append(steps,
		sectionStep{section("acceptance-criteria", "na", reason), 0, "All sections resolved.\n"},
		sectionStep{[]string{"validate", "upload"}, 0, "upload: all 10 sections resolved"},
	)

	for _, st := range steps {
		te.stdout.Reset()

		code := run(context.Background(), te.env, st.args)
		if plain := ansiCode.ReplaceAllString(te.stdout.String(), ""); code != st.code || !strings.Contains(plain, st.want) {
			t.Errorf("%v: exit %d, stdout %q; want %d and %q", st.args, code, plain, st.code, st.want)
		}
	}

	if len(te.calls) != 0 {
		t.Errorf("forwarded %+v", te.calls)
	}
}
