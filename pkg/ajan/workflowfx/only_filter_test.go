// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package workflowfx_test

// RunOptions.Only selects a shell step by its name as well as a tool by its
// name, and a filter that selects no step is an error (TASK-363).

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/workflowfx"
)

const onlyManifest = `workflows:
  - id: ci
    on: [precommit]
    steps:
      - probe
      - shell:
          name: first
          command: echo first >> ran.txt
      - shell:
          name: second
          command: echo second >> ran.txt
`

func TestOnlySelectsStepsByName(t *testing.T) {
	t.Parallel()

	for _, tc := range []struct {
		only      string
		wantShell string
		wantProbe int
	}{
		{only: "second", wantShell: "second", wantProbe: 0},
		{only: "first", wantShell: "first", wantProbe: 0},
		{only: "probe", wantShell: "", wantProbe: 1},
		{only: "shell", wantShell: "first\nsecond", wantProbe: 0},
	} {
		t.Run(tc.only, func(t *testing.T) {
			t.Parallel()

			root := t.TempDir()
			probe := &recordingTool{name: "probe"} //nolint:exhaustruct
			registry := shellRegistry()
			registry.Register(probe)

			results := runManifest(t, onlyManifest, registry, &workflowfx.RunOptions{Root: root, Only: tc.only}) //nolint:exhaustruct

			got, _ := os.ReadFile(filepath.Join(root, "ran.txt")) //nolint:gosec // G304: the test's own file
			if strings.TrimSpace(string(got)) != tc.wantShell || len(probe.seen) != tc.wantProbe {
				t.Errorf("--only %s ran shell %q and probe %d times, want %q and %d",
					tc.only, got, len(probe.seen), tc.wantShell, tc.wantProbe)
			}

			if len(results[0].Steps) == 0 {
				t.Errorf("--only %s reported no steps", tc.only)
			}
		})
	}
}

func TestOnlyThatSelectsNothingFails(t *testing.T) {
	t.Parallel()

	config, err := workflowfx.ParseManifest("test.yml", []byte(onlyManifest))
	if err != nil {
		t.Fatal(err)
	}

	registry := shellRegistry()
	registry.Register(&recordingTool{name: "probe"}) //nolint:exhaustruct

	opts := &workflowfx.RunOptions{Root: t.TempDir(), Only: "go-lint"} //nolint:exhaustruct

	_, err = workflowfx.RunByEvent(context.Background(), "precommit", config.Workflows, registry, opts)
	if !errors.Is(err, workflowfx.ErrNoStepSelected) || !strings.Contains(err.Error(), `"go-lint"`) {
		t.Errorf("RunByEvent with an unmatched --only: got %v, want ErrNoStepSelected naming the filter", err)
	}

	_, err = workflowfx.RunWorkflowWithConfig(context.Background(), "ci", config, registry, opts)
	if !errors.Is(err, workflowfx.ErrNoStepSelected) {
		t.Errorf("RunWorkflowWithConfig with an unmatched --only: got %v, want ErrNoStepSelected", err)
	}
}
