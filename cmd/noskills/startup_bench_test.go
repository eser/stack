// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

import (
	"bytes"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"
)

// Hook startup (TASK-257 acceptance criterion 2): the PreToolUse hook runs
// before every guarded tool call, so it has to answer in well under 50 ms.
// Both measures run the built binary as a tool runs it: a new process with
// the hook JSON on stdin, in a project with a manifest and a state.
//
//	go test -run '^$' -bench HookStartup ./cmd/noskills/

const hookStartupBudget = 50 * time.Millisecond

// hookInputs are a git write the guard refuses and a file edit the phase
// gate reads the state for.
func hookInputs() []string {
	return []string{
		`{"session_id":"s","hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"git push origin main"}}`,
		`{"session_id":"s","hook_event_name":"PreToolUse","tool_name":"Write","tool_input":{"file_path":"src/a.ts","content":"x"}}`,
	}
}

func buildBinary(tb testing.TB) string {
	tb.Helper()

	binary := filepath.Join(tb.TempDir(), "noskills")

	build := exec.Command("go", "build", "-trimpath", "-ldflags=-s -w", "-o", binary, ".") //nolint:noctx // a bounded local build
	if out, err := build.CombinedOutput(); err != nil {
		tb.Fatalf("build cmd/noskills: %v: %s", err, out)
	}

	return binary
}

func hookProject(tb testing.TB) string {
	tb.Helper()

	root := tb.TempDir()

	for path, content := range map[string]string{
		".eser/manifest.yml":                 "noskills:\n  concerns: []\n  tools:\n    - claude-code\n  allowGit: false\n  command: noskills\n",
		".eser/.state/progresses/state.json": `{"phase":"IDLE","spec":null}` + "\n",
	} {
		full := filepath.Join(root, path)
		if err := os.MkdirAll(filepath.Dir(full), 0o750); err != nil {
			tb.Fatal(err)
		}

		if err := os.WriteFile(full, []byte(content), 0o600); err != nil {
			tb.Fatal(err)
		}
	}

	return root
}

// runPreToolUse starts the binary once and returns how long it took.
func runPreToolUse(tb testing.TB, binary, project, input string) time.Duration {
	tb.Helper()

	cmd := exec.Command(binary, "invoke-hook", "pre-tool-use") //nolint:noctx,gosec // G204: the binary this test built
	cmd.Dir = project
	cmd.Stdin = strings.NewReader(input)
	cmd.Stdout = &bytes.Buffer{}
	cmd.Stderr = &bytes.Buffer{}

	start := time.Now()
	err := cmd.Run()
	elapsed := time.Since(start)

	var exitErr *exec.ExitError
	if err != nil && (!errors.As(err, &exitErr) || exitErr.ExitCode() != 2) {
		tb.Fatalf("pre-tool-use: %v", err)
	}

	return elapsed
}

// BenchmarkHookStartup reports the wall time of one PreToolUse hook run,
// process start included, as ms/hook.
func BenchmarkHookStartup(b *testing.B) {
	binary := buildBinary(b)
	project := hookProject(b)

	for i, input := range hookInputs() {
		name := []string{"git-write-denied", "file-edit-gated"}[i]

		b.Run(name, func(b *testing.B) {
			var total time.Duration

			runs := 0

			for b.Loop() {
				total += runPreToolUse(b, binary, project, input)
				runs++
			}

			b.ReportMetric(float64(total.Microseconds())/1000/float64(runs), "ms/hook")
		})
	}
}

// TestHookStartupBudget fails when the median PreToolUse run takes 50 ms or
// more. -short skips it, as it builds the binary.
func TestHookStartupBudget(t *testing.T) {
	if testing.Short() {
		t.Skip("builds the binary; run without -short")
	}

	binary := buildBinary(t)
	project := hookProject(t)

	for _, input := range hookInputs() {
		runs := make([]time.Duration, 0, 21)

		for range cap(runs) {
			runs = append(runs, runPreToolUse(t, binary, project, input))
		}

		slices.Sort(runs)

		if median := runs[len(runs)/2]; median >= hookStartupBudget {
			t.Errorf("median hook startup %v, budget %v (runs %v)", median, hookStartupBudget, runs)
		} else {
			t.Logf("median hook startup %v over %d runs", median, len(runs))
		}
	}
}
