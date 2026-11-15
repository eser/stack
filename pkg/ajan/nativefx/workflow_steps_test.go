// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package nativefx_test

import (
	"context"
	"encoding/json"
	"errors"
	"iter"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/functionsfx"
	"github.com/eser/stack/pkg/ajan/nativefx"
)

const twoStepManifest = `workflows:
  - id: check
    on: [precommit]
    steps:
      - shell:
          name: first
          command: echo one
      - shell:
          name: second
          command: echo two
`

func registryOf(t *testing.T) *functionsfx.Registry {
	t.Helper()

	registry := functionsfx.NewRegistry()
	if err := nativefx.Register(registry); err != nil {
		t.Fatalf("Register: %v", err)
	}

	return registry
}

func openSteps(t *testing.T, ctx context.Context, input *nativefx.WorkflowStepsInput) (iter.Seq2[json.RawMessage, error], error) { //nolint:revive
	t.Helper()

	encoded, err := json.Marshal(input)
	if err != nil {
		t.Fatal(err)
	}

	return registryOf(t).Stream(ctx, nativefx.WorkflowStepsName, encoded)
}

type stepsOutcome struct {
	names []string
	steps []nativefx.WorkflowStep
	err   error
}

func drain(t *testing.T, ctx context.Context, input *nativefx.WorkflowStepsInput) stepsOutcome { //nolint:revive
	t.Helper()

	items, err := openSteps(t, ctx, input)
	if err != nil {
		return stepsOutcome{err: err} //nolint:exhaustruct
	}

	var outcome stepsOutcome

	for raw, itemErr := range items {
		if itemErr != nil {
			outcome.err = itemErr

			return outcome
		}

		var step nativefx.WorkflowStep
		if err := json.Unmarshal(raw, &step); err != nil {
			t.Fatalf("an item is not a step: %v (%s)", err, raw)
		}

		outcome.names = append(outcome.names, step.Name)
		outcome.steps = append(outcome.steps, step)
	}

	return outcome
}

func TestWorkflowStepsIsRegisteredAsAStreamOwnedByWorkflows(t *testing.T) {
	t.Parallel()

	descriptors := registryOf(t).List()

	for i := range descriptors {
		if descriptors[i].Name != nativefx.WorkflowStepsName {
			continue
		}

		if !descriptors[i].Stream || descriptors[i].Owner != "@eserstack/workflows" {
			t.Errorf("descriptor = %+v", descriptors[i])
		}

		if len(descriptors[i].InputSchema) == 0 || len(descriptors[i].OutputSchema) == 0 {
			t.Error("the function has no schemas, so no types can be generated")
		}

		return
	}

	t.Fatal("workflow-steps is not in the catalog")
}

func TestEachStepIsAnItemInTheOrderTheyRun(t *testing.T) {
	t.Parallel()

	outcome := drain(t, t.Context(), &nativefx.WorkflowStepsInput{ //nolint:exhaustruct
		Manifest: twoStepManifest,
		Workflow: "check",
		Root:     t.TempDir(),
	})

	if outcome.err != nil {
		t.Fatalf("the stream failed: %v", outcome.err)
	}

	if !reflect.DeepEqual(outcome.names, []string{"first", "second"}) {
		t.Errorf("steps = %v", outcome.names)
	}

	for _, step := range outcome.steps {
		if !step.Passed {
			t.Errorf("step %q failed: %+v", step.Name, step)
		}
	}
}

func TestAFailedStepIsAnItemAndTheRunGoesOn(t *testing.T) {
	t.Parallel()

	outcome := drain(t, t.Context(), &nativefx.WorkflowStepsInput{ //nolint:exhaustruct
		Manifest: `workflows:
  - id: check
    on: [precommit]
    steps:
      - shell:
          name: breaks
          command: exit 3
      - shell:
          name: after
          command: echo still-runs
`,
		Workflow: "check",
		Root:     t.TempDir(),
	})

	if outcome.err != nil {
		t.Fatalf("a failed step is a result, not an error of the function: %v", outcome.err)
	}

	if len(outcome.steps) != 2 || outcome.steps[0].Name != "breaks" || outcome.steps[0].Passed ||
		outcome.steps[1].Name != "after" || !outcome.steps[1].Passed {
		t.Errorf("steps = %+v, want the failed step and then the one after it", outcome.steps)
	}
}

func TestOnlyRunsTheStepItNames(t *testing.T) {
	t.Parallel()

	outcome := drain(t, t.Context(), &nativefx.WorkflowStepsInput{ //nolint:exhaustruct
		Manifest: twoStepManifest,
		Workflow: "check",
		Only:     "second",
		Root:     t.TempDir(),
	})

	if outcome.err != nil || !reflect.DeepEqual(outcome.names, []string{"second"}) {
		t.Errorf("steps = %v, error = %v", outcome.names, outcome.err)
	}
}

func TestWhatTheCallerGotWrongIsAValidationError(t *testing.T) {
	t.Parallel()

	for name, input := range map[string]nativefx.WorkflowStepsInput{
		"a workflow the manifest lacks": {Manifest: twoStepManifest, Workflow: "missing"},                //nolint:exhaustruct
		"a step filter that matches":    {Manifest: twoStepManifest, Workflow: "check", Only: "nothing"}, //nolint:exhaustruct
		"a manifest that is not YAML":   {Manifest: "workflows: [", Workflow: "check"},                   //nolint:exhaustruct
		"a manifest that breaks schema": {Manifest: "workflows: 3", Workflow: "check"},                   //nolint:exhaustruct
		"no workflow id":                {Manifest: twoStepManifest},                                     //nolint:exhaustruct
	} {
		outcome := drain(t, t.Context(), &input)

		if !functionsfx.IsKind(outcome.err, functionsfx.KindValidation) {
			t.Errorf("%s: error = %v, want a ValidationError", name, outcome.err)
		}

		if len(outcome.steps) != 0 {
			t.Errorf("%s: ran %v", name, outcome.names)
		}
	}
}

func TestAnInputTheSchemaRefusesNeverOpens(t *testing.T) {
	t.Parallel()

	_, err := registryOf(t).Stream(t.Context(), nativefx.WorkflowStepsName, json.RawMessage(`{"workflow":"check"}`))

	if !functionsfx.IsKind(err, functionsfx.KindValidation) {
		t.Errorf("error = %v, want a ValidationError for the missing manifest", err)
	}
}

func TestAStepThatCannotRunEndsTheStreamWithItsError(t *testing.T) {
	t.Parallel()

	outcome := drain(t, t.Context(), &nativefx.WorkflowStepsInput{ //nolint:exhaustruct
		Manifest: `workflows:
  - id: check
    on: [precommit]
    steps:
      - shell:
          name: fine
          command: echo ok
      - no-such-tool
`,
		Workflow: "check",
		Root:     t.TempDir(),
	})

	if outcome.err == nil || !strings.Contains(outcome.err.Error(), "no-such-tool") {
		t.Errorf("error = %v, want the unknown tool", outcome.err)
	}

	if !reflect.DeepEqual(outcome.names, []string{"fine"}) {
		t.Errorf("steps before the failure = %v", outcome.names)
	}
}

func TestStoppingTheReaderStopsTheRun(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	marker := filepath.Join(root, "second-ran")

	items, err := openSteps(t, t.Context(), &nativefx.WorkflowStepsInput{ //nolint:exhaustruct
		Manifest: `workflows:
  - id: check
    on: [precommit]
    steps:
      - shell:
          name: first
          command: echo one
      - shell:
          name: second
          command: touch second-ran
`,
		Workflow: "check",
		Root:     root,
	})
	if err != nil {
		t.Fatal(err)
	}

	for _, itemErr := range items {
		if itemErr != nil {
			t.Fatalf("the stream failed: %v", itemErr)
		}

		break
	}

	// Breaking the loop returns only once the run is over, so the marker says
	// whether the second step ever started.
	if _, err := os.Stat(marker); err == nil {
		t.Error("a step ran after the reader stopped")
	}
}

func TestACancelledContextEndsALongStepWithAnAbort(t *testing.T) {
	t.Parallel()

	ctx, cancel := context.WithTimeout(t.Context(), 300*time.Millisecond)
	defer cancel()

	started := time.Now()

	outcome := drain(t, ctx, &nativefx.WorkflowStepsInput{ //nolint:exhaustruct
		Manifest: `workflows:
  - id: check
    on: [precommit]
    steps:
      - shell:
          name: slow
          command: sleep 30
`,
		Workflow: "check",
		Root:     t.TempDir(),
	})

	if elapsed := time.Since(started); elapsed > 10*time.Second {
		t.Errorf("the run took %v after the context ended", elapsed)
	}

	if !functionsfx.IsKind(outcome.err, functionsfx.KindAbort) && len(outcome.steps) == 0 {
		t.Errorf("error = %v, steps = %v: want an abort or the cut step", outcome.err, outcome.names)
	}

	if errors.Is(outcome.err, nativefx.ErrWorkflowPanic) {
		t.Errorf("the run panicked: %v", outcome.err)
	}
}
