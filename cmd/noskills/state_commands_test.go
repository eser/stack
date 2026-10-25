// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// The state commands run in Go: with NOSKILLS_NO_FORWARD=1 none of them
// starts the TypeScript CLI, and init writes the tool files itself.
func TestStateCommandsRunInGo(t *testing.T) {
	t.Parallel()

	root := initializedProject(t, "IDLE")

	for _, args := range [][]string{
		{"rule", "add", "Always write tests"}, {"rule", "list"}, {"concern", "list", "--json"},
		{"concern", "add", "move-fast"}, {"learn"}, {"ledger", "x"}, {"pack", "list"}, {"pack", "search", "react"},
		{"purge", "restore", "--agent"}, {"spec", "x", "ledger"}, {"spec", "x", "learn", "a learning"},
		{"init", "--agent", "--tools=claude-code"}, {"sync", "--agent"},
	} {
		te := newTestEnv(t, root)
		te.vars[envNoForward] = "1"

		if code := run(context.Background(), te.env, args); code != 0 || len(te.calls) != 0 {
			t.Errorf("%v: exit %d, ran %v, stderr %q", args, code, te.calls, te.stderr)
		}
	}

	if _, err := os.Stat(filepath.Join(root, ".claude", "settings.json")); err != nil {
		t.Errorf("init wrote no Claude Code hooks: %v", err)
	}
}

// learn list names each learning's type with its icon; the TypeScript CLI
// prints the icon and label spans as "[object Object]".
func TestLearnListShowsTheTypes(t *testing.T) {
	t.Parallel()

	root := initializedProject(t, "IDLE")
	writeFile(t, filepath.Join(root, ".eser", "learnings.jsonl"),
		`{"ts":"2026-10-25T12:00:00.000Z","spec":"login","type":"mistake","text":"We assumed it","severity":"high"}`+"\n"+
			`{"ts":"2026-10-24T12:00:00.000Z","spec":"login","type":"success","text":"Pairing worked","severity":"low"}`+"\n")

	te := newTestEnv(t, root)
	if code := run(context.Background(), te.env, []string{"learn", "list"}); code != 0 {
		t.Fatalf("exit %d", code)
	}

	out := ansiEsc(te.stdout.String())
	for _, want := range []string{
		"2 learning(s):", "  1. ⚠ [mistake] We assumed it", "     spec: login | severity: HIGH | 2026-10-25",
		"  2. ✓ [success] Pairing worked", "severity: low | 2026-10-24",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("no %q in\n%s", want, out)
		}
	}
}

func ansiEsc(text string) string {
	for {
		start := strings.Index(text, "\x1b[")
		if start == -1 {
			return text
		}

		end := start + 2
		for end < len(text) && (text[end] == ';' || (text[end] >= '0' && text[end] <= '9')) {
			end++
		}

		text = text[:start] + text[min(end+1, len(text)):]
	}
}
