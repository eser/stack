// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package workflowfx_test

// One test per gap that pkg/@eserstack/workflows/WIRING.md lists between the
// TypeScript engine and workflowfx (TASK-244).

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/codebasefx/validatortools"
	"github.com/eser/stack/pkg/ajan/workflowfx"
)

// recordingTool records the options it ran with and returns a fixed result.
type recordingTool struct {
	name      string
	seen      []map[string]any
	mutations []workflowfx.WorkflowFileMutation
}

func (t *recordingTool) Name() string        { return t.name }
func (t *recordingTool) Description() string { return "records its runs" }

func (t *recordingTool) Run(_ context.Context, opts map[string]any) (*workflowfx.WorkflowToolResult, error) {
	t.seen = append(t.seen, opts)

	name := t.name
	if display, ok := opts["name"].(string); ok && display != "" {
		name = display
	}

	return &workflowfx.WorkflowToolResult{ //nolint:exhaustruct
		Name:      name,
		Passed:    true,
		Mutations: t.mutations,
		Stats:     map[string]any{"filesChecked": 1},
	}, nil
}

func runManifest(t *testing.T, manifest string, registry *workflowfx.Registry, opts *workflowfx.RunOptions) []*workflowfx.WorkflowResult {
	t.Helper()

	config, err := workflowfx.ParseManifest("test.yml", []byte(manifest))
	if err != nil {
		t.Fatal(err)
	}

	results, err := workflowfx.RunByEvent(context.Background(), "precommit", config.Workflows, registry, opts)
	if err != nil {
		t.Fatal(err)
	}

	return results
}

func shellRegistry() *workflowfx.Registry {
	r := workflowfx.NewRegistry()
	r.Register(workflowfx.NewShellTool())

	return r
}

// Gap "Tools": injected validator tools run from manifest step names.
func TestGap_InjectedValidatorTools(t *testing.T) {
	t.Parallel()

	injected := &recordingTool{name: "validate-custom"} //nolint:exhaustruct
	registry := shellRegistry()
	registry.Register(injected)

	results := runManifest(t, `workflows:
  - id: ci
    on: [precommit]
    steps:
      - validate-custom:
          exclude: ["docs/"]
`, registry, nil)

	if !results[0].Passed || len(injected.seen) != 1 || len(injected.seen[0]["exclude"].([]any)) != 1 { //nolint:forcetypeassert
		t.Errorf("the injected tool did not run with its options: %+v", injected.seen)
	}

	// The Go validators answer to the manifest's validate-* names.
	manifestRegistry := workflowfx.NewRegistry()
	validatortools.RegisterManifestTools(manifestRegistry)

	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "a.txt"), []byte("no newline"), 0o600); err != nil {
		t.Fatal(err)
	}

	eof := runManifest(t, `workflows:
  - id: ci
    on: [precommit]
    steps:
      - validate-eof
`, manifestRegistry, &workflowfx.RunOptions{Root: root}) //nolint:exhaustruct

	if eof[0].Passed || eof[0].Steps[0].Name != "validate-eof" {
		t.Errorf("validate-eof should fail on a file without a final newline: %+v", eof[0].Steps)
	}
}

// Gap "Step format": manifest steps (a tool name, or { tool: options }).
func TestGap_ManifestStepFormat(t *testing.T) {
	t.Parallel()

	tool := &recordingTool{name: "probe"} //nolint:exhaustruct
	registry := workflowfx.NewRegistry()
	registry.Register(tool)

	runManifest(t, `workflows:
  - id: ci
    on: [precommit]
    steps:
      - probe
      - probe:
          level: 2
`, registry, nil)

	if len(tool.seen) != 2 || tool.seen[1]["level"] != 2 {
		t.Errorf("both step forms should run: %+v", tool.seen)
	}
}

// Gaps "fixCommand" and "--dry-run": --fix runs fixCommand, and a dry run
// never does and applies no mutations.
func TestGap_FixCommandAndDryRun(t *testing.T) {
	t.Parallel()

	manifest := `workflows:
  - id: ci
    on: [precommit]
    steps:
      - shell:
          name: fmt
          command: echo check > mode.txt
          fixCommand: echo fix > mode.txt
`

	for _, tc := range []struct {
		name string
		opts workflowfx.RunOptions
		want string
	}{
		{name: "check", opts: workflowfx.RunOptions{}, want: "check"},                                  //nolint:exhaustruct
		{name: "fix", opts: workflowfx.RunOptions{Fix: true}, want: "fix"},                             //nolint:exhaustruct
		{name: "fix and dry run", opts: workflowfx.RunOptions{Fix: true, DryRun: true}, want: "check"}, //nolint:exhaustruct
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			root := t.TempDir()
			opts := tc.opts
			opts.Root = root

			runManifest(t, manifest, shellRegistry(), &opts)

			got, err := os.ReadFile(filepath.Join(root, "mode.txt")) //nolint:gosec // G304: the test's own file
			if err != nil || strings.TrimSpace(string(got)) != tc.want {
				t.Errorf("ran %q, want %q (%v)", got, tc.want, err)
			}
		})
	}

	mutating := &recordingTool{ //nolint:exhaustruct
		name:      "fixer",
		mutations: []workflowfx.WorkflowFileMutation{{Path: "a", OldContent: "x", NewContent: "y"}},
	}
	registry := workflowfx.NewRegistry()
	registry.Register(mutating)

	applied := 0
	onMutations := func([]workflowfx.WorkflowFileMutation) error { applied++; return nil }

	runManifest(t, "workflows:\n  - id: ci\n    on: [precommit]\n    steps: [fixer]\n", registry,
		&workflowfx.RunOptions{Fix: true, DryRun: true, OnMutations: onMutations}) //nolint:exhaustruct

	if applied != 0 || mutating.seen[0]["dryRun"] != true {
		t.Errorf("a dry run applied %d mutations; options %+v", applied, mutating.seen[0])
	}
}

// Gap "Positional arguments": passed to tools as _args.
func TestGap_PositionalArgs(t *testing.T) {
	t.Parallel()

	tool := &recordingTool{name: "probe"} //nolint:exhaustruct
	registry := workflowfx.NewRegistry()
	registry.Register(tool)

	runManifest(t, "workflows:\n  - id: ci\n    on: [precommit]\n    steps: [probe]\n", registry,
		&workflowfx.RunOptions{Args: []string{".git/COMMIT_EDITMSG"}}) //nolint:exhaustruct

	if args, _ := tool.seen[0]["_args"].([]string); len(args) != 1 || args[0] != ".git/COMMIT_EDITMSG" {
		t.Errorf("_args: %+v", tool.seen[0]["_args"])
	}
}

// Gap "name, workingDirectory": the display name and the command's directory.
func TestGap_NameAndWorkingDirectory(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "sub"), 0o750); err != nil {
		t.Fatal(err)
	}

	results := runManifest(t, `workflows:
  - id: ci
    on: [precommit]
    steps:
      - shell:
          name: in-sub
          command: test "$(basename "$PWD")" = sub
          workingDirectory: sub
`, shellRegistry(), &workflowfx.RunOptions{Root: root}) //nolint:exhaustruct

	step := results[0].Steps[0]
	if step.Name != "in-sub" || !step.Passed {
		t.Errorf("step %+v", step)
	}
}

// Gap "Step timeout option": seconds, applied to the step and to the command.
func TestGap_TimeoutInSeconds(t *testing.T) {
	t.Parallel()

	started := time.Now()
	results := runManifest(t, `workflows:
  - id: ci
    on: [precommit]
    steps:
      - shell:
          name: slow
          command: sleep 5
          timeout: 0.3
          continueOnError: true
`, shellRegistry(), nil)

	elapsed := time.Since(started)
	step := results[0].Steps[0]

	if step.Passed || elapsed > 4*time.Second || !strings.Contains(step.Issues[0].Message, "timeout") {
		t.Errorf("the command should stop at 0.3 s: passed %v after %v, issues %+v", step.Passed, elapsed, step.Issues)
	}
}

// Gap "Progress": each step is reported as it ends, before the run returns,
// in the TypeScript run command's format.
func TestGap_Progress(t *testing.T) {
	t.Parallel()

	var (
		order []string
		out   bytes.Buffer
	)

	printer := workflowfx.ProgressPrinter(&out)
	opts := &workflowfx.RunOptions{ //nolint:exhaustruct
		OnStepEnd: func(name string, result workflowfx.StepResult) {
			order = append(order, result.Name)
			printer(name, result)
		},
	}

	runManifest(t, `workflows:
  - id: ci
    on: [precommit]
    steps:
      - shell: { name: first, command: "true" }
      - shell: { name: second, command: "echo broken; exit 2", continueOnError: true }
`, shellRegistry(), opts)

	if strings.Join(order, ",") != "first,second" {
		t.Errorf("order %v", order)
	}

	lines := strings.Split(strings.TrimSpace(out.String()), "\n")
	if len(lines) != 3 || !strings.HasPrefix(lines[0], "first....") || !strings.Contains(lines[0], "Passed (") ||
		!strings.Contains(lines[1], "Failed (") || lines[2] != "  ✗ broken" {
		t.Errorf("progress:\n%s", out.String())
	}

	if strings.Index(lines[0], "Passed") != 50 {
		t.Errorf("the status column starts at 50: %q", lines[0])
	}
}

// Gap "Result fields": numeric stats and the workflow's id.
func TestGap_ResultFields(t *testing.T) {
	t.Parallel()

	results := runManifest(t, `workflows:
  - id: ci
    on: [precommit]
    steps:
      - shell: { command: "exit 3", continueOnError: true }
`, shellRegistry(), nil)

	step := results[0].Steps[0]
	if results[0].ID != "ci" || step.Stats["exitCode"] != 3 || step.Issues[0].Message != "Command exited with code 3" {
		t.Errorf("result %+v", results[0])
	}

	for key, value := range step.Stats {
		if _, ok := value.(int); !ok {
			t.Errorf("stats[%q] = %v is not a number", key, value)
		}
	}
}

// TestDryRunListsTheManifestSteps runs the repository's precommit workflows
// as a dry run with a stub for every tool and checks the engine reports every
// step, in the manifest's order, under its display name. The TypeScript
// engine's test (engine.test.ts) checks the same order, so the two list the
// same steps.
func TestDryRunListsTheManifestSteps(t *testing.T) {
	t.Parallel()

	config, err := workflowfx.LoadManifest("../../..")
	if err != nil {
		t.Fatal(err)
	}

	registry := workflowfx.NewRegistry()

	var want []string

	for _, wf := range config.Workflows {
		if !contains(wf.On, "precommit") {
			continue
		}

		for _, step := range wf.Steps {
			if _, ok := registry.Get(step.Name); !ok {
				registry.Register(&recordingTool{name: step.Name}) //nolint:exhaustruct
			}

			display := step.Name
			if name, ok := step.Options["name"].(string); ok {
				display = name
			}

			want = append(want, display)
		}
	}

	var got []string

	opts := &workflowfx.RunOptions{ //nolint:exhaustruct
		DryRun:    true,
		OnStepEnd: func(_ string, result workflowfx.StepResult) { got = append(got, result.Name) },
	}

	if _, err := workflowfx.RunByEvent(context.Background(), "precommit", config.Workflows, registry, opts); err != nil {
		t.Fatal(err)
	}

	if strings.Join(got, "\n") != strings.Join(want, "\n") || len(got) < 30 {
		t.Errorf("dry-run steps:\n%s\nwant:\n%s", strings.Join(got, "\n"), strings.Join(want, "\n"))
	}

	t.Logf("%d precommit steps", len(got))
}

func contains(list []string, value string) bool {
	for _, item := range list {
		if item == value {
			return true
		}
	}

	return false
}
