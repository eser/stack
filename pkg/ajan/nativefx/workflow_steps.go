// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package nativefx

import (
	"context"
	"errors"
	"fmt"
	"iter"
	"time"

	"github.com/eser/stack/pkg/ajan/codebasefx/validatortools"
	"github.com/eser/stack/pkg/ajan/functionsfx"
	"github.com/eser/stack/pkg/ajan/workflowfx"
)

// WorkflowStepsName is the name of the function that streams a workflow run.
const WorkflowStepsName = "workflow-steps"

// workflowsPackage is the workspace package that owns the function: the
// TypeScript types of workflow-steps are generated into it.
const workflowsPackage = "@eserstack/workflows"

// ErrWorkflowPanic is the error of a workflow run that panicked. The run
// belongs to a goroutine of its own, so the panic is caught there and ends the
// stream as an error instead of the process.
var ErrWorkflowPanic = errors.New("workflow run panicked")

// WorkflowStepsInput is the input of workflow-steps: the text of a manifest, the
// workflow to run, and the options of the run. The fields of the run follow the
// bridge's workflowRun call.
type WorkflowStepsInput struct {
	// Manifest is the text of a .eser/manifest.yml.
	Manifest string `json:"manifest"`
	// Workflow is the id of the workflow to run.
	Workflow string `json:"workflow"`
	// Root is the working directory of the steps; empty is the process's.
	Root string `json:"root,omitempty"`
	// Only runs only the step it names, by its tool name or its name option.
	Only string `json:"only,omitempty"`
	// Args are passed to the tools as the option _args.
	Args []string `json:"args,omitempty"`
	// ChangedFiles limits the steps to the paths it lists.
	ChangedFiles []string `json:"changedFiles,omitempty"`
	// TimeoutMs is the default timeout of a step that sets none; zero keeps the
	// engine's default.
	TimeoutMs int `json:"timeoutMs,omitempty"`
	// Fix runs the fix command of the steps that have one.
	Fix bool `json:"fix,omitempty"`
	// DryRun reports what a run would do without changing anything.
	DryRun bool `json:"dryRun,omitempty"`
}

// WorkflowStep is one step of the run, answered as it ends. Mutations are
// reported and not applied: the caller decides what to write.
type WorkflowStep struct {
	Stats      map[string]any            `json:"stats,omitempty"`
	Name       string                    `json:"name"`
	Issues     []workflowfx.ToolIssue    `json:"issues,omitempty"`
	Mutations  []workflowfx.ToolMutation `json:"mutations,omitempty"`
	DurationMs float64                   `json:"durationMs"`
	Passed     bool                      `json:"passed"`
}

// workflowTools are the tools a streamed run can use: the shell tool and the
// codebase validators, the same set the bridge's workflowRun call registers.
func workflowTools() *workflowfx.Registry {
	registry := workflowfx.NewRegistry()
	registry.Register(workflowfx.NewShellTool())
	validatortools.RegisterManifestTools(registry)

	return registry
}

// stepOf is the wire form of a step result.
func stepOf(result *workflowfx.StepResult) WorkflowStep {
	issues := make([]workflowfx.ToolIssue, 0, len(result.Issues))
	for _, issue := range result.Issues {
		issues = append(issues, workflowfx.ToolIssue(issue))
	}

	mutations := make([]workflowfx.ToolMutation, 0, len(result.Mutations))
	for _, mutation := range result.Mutations {
		mutations = append(mutations, workflowfx.ToolMutation(mutation))
	}

	return WorkflowStep{
		Name:       result.Name,
		Passed:     result.Passed,
		DurationMs: result.DurationMs,
		Issues:     issues,
		Mutations:  mutations,
		Stats:      result.Stats,
	}
}

// refusal marks an error of the run that comes from what the caller asked for,
// a workflow or a step filter the manifest does not have, as a ValidationError.
func refusal(err error) error {
	if errors.Is(err, workflowfx.ErrWorkflowNotFound) || errors.Is(err, workflowfx.ErrNoStepSelected) {
		return functionsfx.NewValidationError(err.Error())
	}

	return err
}

// streamWorkflowSteps runs the workflow on the Go engine in a goroutine of its
// own and yields each step as it ends. The goroutine waits for the reader at
// every step, so a slow reader slows the run instead of buffering it. A reader
// that stops, or a context that ends, cancels the run and waits for it, so no
// step outlives the stream.
func streamWorkflowSteps(
	tools func() *workflowfx.Registry,
) functionsfx.StreamHandler[WorkflowStepsInput, WorkflowStep] {
	return func(ctx context.Context, input WorkflowStepsInput) iter.Seq2[WorkflowStep, error] {
		return func(yield func(WorkflowStep, error) bool) {
			if input.Workflow == "" {
				yield(WorkflowStep{}, functionsfx.NewValidationError("workflow: a workflow id is required")) //nolint:exhaustruct

				return
			}

			config, err := workflowfx.ParseManifest("manifest", []byte(input.Manifest))
			if err != nil {
				yield(WorkflowStep{}, functionsfx.NewValidationError(err.Error())) //nolint:exhaustruct

				return
			}

			runCtx, cancel := context.WithCancel(ctx)
			defer cancel()

			steps := make(chan WorkflowStep)
			// resume lets the run go on after a step: the next step starts only
			// once the reader took this one and asked for more.
			resume := make(chan struct{})
			finished := make(chan error, 1)

			options := &workflowfx.RunOptions{ //nolint:exhaustruct
				Root:           input.Root,
				Fix:            input.Fix,
				DryRun:         input.DryRun,
				Args:           input.Args,
				Only:           input.Only,
				ChangedFiles:   input.ChangedFiles,
				DefaultTimeout: time.Duration(input.TimeoutMs) * time.Millisecond,
				OnStepEnd: func(_ string, result workflowfx.StepResult) {
					select {
					case steps <- stepOf(&result):
					case <-runCtx.Done():
						return
					}

					select {
					case <-resume:
					case <-runCtx.Done():
					}
				},
			}

			go func() {
				var runErr error

				defer func() {
					if recovered := recover(); recovered != nil {
						runErr = fmt.Errorf("%w: %v", ErrWorkflowPanic, recovered)
					}

					finished <- runErr

					close(steps)
				}()

				_, runErr = workflowfx.RunWorkflowWithConfig(runCtx, input.Workflow, config, tools(), options)
			}()

			for step := range steps {
				if !yield(step, nil) {
					cancel()

					// The run closes the channel when it ends.
					for range steps { //nolint:revive // drains until the run is over
					}

					return
				}

				select {
				case resume <- struct{}{}:
				case <-runCtx.Done():
				}
			}

			runErr := <-finished

			switch {
			case ctx.Err() != nil:
				yield(WorkflowStep{}, functionsfx.NewAbortError(ctx.Err().Error())) //nolint:exhaustruct
			case runErr != nil:
				yield(WorkflowStep{}, refusal(runErr)) //nolint:exhaustruct
			}
		}
	}
}

// workflowStepsFunction is the function that streams a workflow run.
func workflowStepsFunction(tools func() *workflowfx.Registry) (functionsfx.StreamFunction, error) { //nolint:ireturn
	return functionsfx.NewStreamFunction(WorkflowStepsName, streamWorkflowSteps(tools), //nolint:wrapcheck // names the function
		functionsfx.WithDescription("Runs a workflow of a manifest on the Go engine and answers each step as it ends"),
		functionsfx.WithOwner(workflowsPackage),
		functionsfx.WithSchemasOf[WorkflowStepsInput, WorkflowStep](),
	)
}
