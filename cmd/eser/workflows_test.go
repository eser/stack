// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"slices"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/workflowfx"
)

// workflowEnv is a test env with a manifest and the files of files.
func workflowEnv(t *testing.T, manifest string, files map[string]string) *env {
	t.Helper()

	if _, err := exec.LookPath("sh"); err != nil || runtime.GOOS == "windows" {
		t.Skip("the shell steps need sh")
	}

	e := testEnv(t)
	writeManifest(t, e.cwd, manifest)

	for name, content := range files {
		if err := os.WriteFile(filepath.Join(e.cwd, name), []byte(content), 0o600); err != nil {
			t.Fatal(err)
		}
	}

	return e
}

func output(e *env) string {
	return e.stdout.(*bytes.Buffer).String() + e.stderr.(*bytes.Buffer).String() //nolint:forcetypeassert
}

const gateManifest = `workflows:
  - id: default
    on: [precommit]
    steps:
      - validate-eof
      - shell:
          name: formatter
          command: test -f formatted.txt
          fixCommand: touch formatted.txt
  - id: commit-validation
    on: [commitmsg]
    steps:
      - validate-commit-msg:
          forceScope: true
`

func TestWorkflowsRunReportsAndFixes(t *testing.T) {
	t.Parallel()

	e := workflowEnv(t, gateManifest, map[string]string{"a.txt": "no newline"})

	if code := run(context.Background(), e, []string{"workflows", "run", "-e", "precommit"}); code != 1 {
		t.Fatalf("a failing precommit: exit %d, want 1:\n%s", code, output(e))
	}

	for _, want := range []string{
		"validate-eof......................................Failed",
		"a.txt: file does not end with a newline",
		"formatter.........................................Failed",
		"2 check(s) failed with 2 issue(s)",
	} {
		if !strings.Contains(output(e), want) {
			t.Errorf("output should contain %q:\n%s", want, output(e))
		}
	}

	e.stdout = &bytes.Buffer{}
	if code := run(context.Background(), e, []string{"workflows", "run", "-e", "precommit", "--fix"}); code != 0 {
		t.Fatalf("--fix: exit %d:\n%s", code, output(e))
	}

	fixed, _ := os.ReadFile(filepath.Join(e.cwd, "a.txt"))
	if string(fixed) != "no newline\n" || !fileExists(filepath.Join(e.cwd, "formatted.txt")) {
		t.Errorf("--fix should end a.txt with a newline and run the fixCommand: %q\n%s", fixed, output(e))
	}

	if !strings.Contains(output(e), "validate-eof......................................Fixed (1 file") ||
		!strings.Contains(output(e), "All checks passed!") {
		t.Errorf("--fix output:\n%s", output(e))
	}
}

func TestWorkflowsRunDryRunWritesNothing(t *testing.T) {
	t.Parallel()

	e := workflowEnv(t, gateManifest, map[string]string{"a.txt": "no newline"})

	if code := run(context.Background(), e, []string{"workflows", "run", "-e", "precommit", "--fix", "--dry-run"}); code != 1 {
		t.Fatalf("a dry run reports the issues: exit %d:\n%s", code, output(e))
	}

	content, _ := os.ReadFile(filepath.Join(e.cwd, "a.txt"))
	if string(content) != "no newline" || fileExists(filepath.Join(e.cwd, "formatted.txt")) {
		t.Errorf("a dry run changed files: %q", content)
	}
}

func TestWorkflowsRunOnly(t *testing.T) {
	t.Parallel()

	e := workflowEnv(t, gateManifest, map[string]string{"a.txt": "fine\n", "formatted.txt": ""})

	if code := run(context.Background(), e, []string{"workflows", "run", "-e", "precommit", "--only", "formatter"}); code != 0 {
		t.Fatalf("--only formatter: exit %d:\n%s", code, output(e))
	}

	if strings.Contains(output(e), "validate-eof") || !strings.Contains(output(e), "formatter....") {
		t.Errorf("--only should select the shell step by its name:\n%s", output(e))
	}

	e.stdout = &bytes.Buffer{}
	if code := run(context.Background(), e, []string{"workflows", "run", "-e", "precommit", "--only", "go-lint"}); code != 1 {
		t.Errorf("--only that selects nothing: exit %d, want 1", code)
	}

	if out := output(e); strings.Contains(out, "All checks passed!") || !strings.Contains(out, `"go-lint"`) {
		t.Errorf("--only that selects nothing should name the filter, not pass:\n%s", out)
	}
}

func TestWorkflowsRunPassesTheCommitMessageFile(t *testing.T) {
	t.Parallel()

	e := workflowEnv(t, gateManifest, map[string]string{"good.txt": "feat(cli): add a thing\n", "bad.txt": "add a thing\n"})

	if code := run(context.Background(), e, []string{"workflows", "run", "-e", "commitmsg", "--", filepath.Join(e.cwd, "good.txt")}); code != 0 {
		t.Errorf("a valid message: exit %d:\n%s", code, output(e))
	}

	if code := run(context.Background(), e, []string{"workflows", "run", "-e", "commitmsg", "--", filepath.Join(e.cwd, "bad.txt")}); code != 1 {
		t.Errorf("an invalid message: exit %d:\n%s", code, output(e))
	}
}

func TestWorkflowsRunJSONAndList(t *testing.T) {
	t.Parallel()

	e := workflowEnv(t, gateManifest, map[string]string{"a.txt": "fine\n", "formatted.txt": ""})

	if code := run(context.Background(), e, []string{"workflows", "run", "-w", "default", "--json"}); code != 0 {
		t.Fatalf("-w default --json: exit %d:\n%s", code, output(e))
	}

	var results []map[string]any
	if err := json.Unmarshal(e.stdout.(*bytes.Buffer).Bytes(), &results); err != nil || len(results) != 1 { //nolint:forcetypeassert
		t.Fatalf("--json output: %v\n%s", err, output(e))
	}

	e.stdout = &bytes.Buffer{}
	if code := run(context.Background(), e, []string{"workflows", "list"}); code != 0 ||
		!strings.Contains(output(e), "commit-validation") || !strings.Contains(output(e), "validate-licenses") {
		t.Errorf("workflows list: exit %d:\n%s", code, output(e))
	}

	if code := run(context.Background(), testEnv(t), []string{"workflows", "run"}); code != 2 {
		t.Errorf("no -e or -w: exit %d, want the usage code 2", code)
	}
}

func TestCodebaseValidatorCommand(t *testing.T) {
	t.Parallel()

	e := workflowEnv(t, "workflows:\n  - id: default\n    on: [precommit]\n    steps:\n      - validate-eof:\n          exclude: [\"skipped\"]\n",
		map[string]string{"a.txt": "no newline", "skipped.txt": "no newline"})

	if code := run(context.Background(), e, []string{"codebase", "validate-eof"}); code != 1 {
		t.Fatalf("validate-eof: exit %d:\n%s", code, output(e))
	}

	if out := output(e); !strings.Contains(out, "a.txt") || strings.Contains(out, "skipped.txt") {
		t.Errorf("validate-eof should use the manifest step's exclude:\n%s", out)
	}

	e.stdout = &bytes.Buffer{}
	if code := run(context.Background(), e, []string{"codebase", "validate-eof", "--fix", "--exclude", "skipped"}); code != 0 {
		t.Fatalf("validate-eof --fix: exit %d:\n%s", code, output(e))
	}

	fixed, _ := os.ReadFile(filepath.Join(e.cwd, "a.txt"))
	if string(fixed) != "no newline\n" {
		t.Errorf("validate-eof --fix wrote %q", fixed)
	}
}

// TestEveryManifestToolResolves checks AC #3 of TASK-248 against the
// repository's own manifest: every step name is a Go workflow tool, and
// every validator step is an `eser codebase` command.
func TestEveryManifestToolResolves(t *testing.T) {
	t.Parallel()

	config, err := workflowfx.LoadManifest(filepath.Join("..", ".."))
	if err != nil {
		t.Fatal(err)
	}

	registry := newWorkflowRegistry()

	validators := validatorCommands(testEnv(t))

	commands := make([]string, 0, len(validators))
	for _, cmd := range validators {
		commands = append(commands, cmd.Name)
	}

	for _, wf := range config.Workflows {
		for _, step := range wf.Steps {
			if _, ok := registry.Get(step.Name); !ok {
				t.Errorf("workflow %s: step %q is not a Go workflow tool", wf.ID, step.Name)
			}

			if step.Name != "shell" && !slices.Contains(commands, step.Name) {
				t.Errorf("workflow %s: validator %q is not an `eser codebase` command", wf.ID, step.Name)
			}
		}
	}
}
