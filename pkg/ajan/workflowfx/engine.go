// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package workflowfx

import (
	"context"
	"fmt"
	"strings"
	"time"
)

// ResolveIncludes flattens a workflow's `Includes` list by prepending the steps
// of each referenced workflow. Circular references are detected and cause an error.
func ResolveIncludes(workflow *WorkflowDefinition, all []*WorkflowDefinition) (*WorkflowDefinition, error) {
	visited := make(map[string]bool)

	return resolveIncludesInner(workflow, all, visited)
}

func resolveIncludesInner(
	workflow *WorkflowDefinition,
	all []*WorkflowDefinition,
	visited map[string]bool,
) (*WorkflowDefinition, error) {
	if visited[workflow.ID] {
		return nil, fmt.Errorf("%w: '%s'", ErrCircularIncludes, workflow.ID)
	}

	visited[workflow.ID] = true
	defer func() { visited[workflow.ID] = false }()

	if len(workflow.Includes) == 0 {
		return workflow, nil
	}

	var prepended []StepConfig

	for _, id := range workflow.Includes {
		found := findWorkflow(id, all)
		if found == nil {
			return nil, &WorkflowNotFoundError{ID: id}
		}

		resolved, err := resolveIncludesInner(found, all, visited)
		if err != nil {
			return nil, err
		}

		prepended = append(prepended, resolved.Steps...)
	}

	flat := &WorkflowDefinition{
		ID:    workflow.ID,
		On:    workflow.On,
		Steps: append(prepended, workflow.Steps...),
	}

	return flat, nil
}

func findWorkflow(id string, all []*WorkflowDefinition) *WorkflowDefinition {
	for _, w := range all {
		if w.ID == id {
			return w
		}
	}

	return nil
}

// RunWorkflow executes all steps of a workflow against the provided registry.
func RunWorkflow(
	ctx context.Context,
	workflow *WorkflowDefinition,
	registry *Registry,
	opts *RunOptions,
) (*WorkflowResult, error) {
	start := time.Now()
	steps := make([]StepResult, 0, len(workflow.Steps))
	passed := true
	defaultTimeout := opts.defaultTimeout()

	// Mutable variable scope: initialized from workflow definition, updated by variable-set.
	variables := cloneStepOptions(workflow.Variables)

	// queue allows NextSteps injection and Loop expansion at runtime.
	queue := make([]StepConfig, len(workflow.Steps))
	copy(queue, workflow.Steps)

	var prev *WorkflowToolResult

	for len(queue) > 0 {
		step := queue[0]
		queue = queue[1:]

		if opts != nil && opts.Only != "" && step.Name != opts.Only {
			continue
		}

		// Build the Expr environment for this step.
		// steps contains results of all previously completed steps (0-based).
		// variables is the live mutable scope (updated by variable-set).
		env := buildExprEnv(workflow, opts, prev, steps, variables)

		// Evaluate If predicate; skip step when false.
		if step.If != "" {
			ok, err := evalBoolExpr(step.If, env)
			if err != nil {
				return nil, newWorkflowError(
					fmt.Sprintf("step '%s' if-predicate: %v", step.Name, err),
					err,
				)
			}

			if !ok {
				continue
			}
		}

		// Expand Loop into individual iterations prepended to the queue.
		if step.Loop != nil {
			items, err := evalSliceExpr(step.Loop.Over, env)
			if err != nil {
				return nil, newWorkflowError(
					fmt.Sprintf("step '%s' loop.over: %v", step.Name, err),
					err,
				)
			}

			expanded := make([]StepConfig, 0, len(items))
			for i, item := range items {
				iter := step
				iter.Loop = nil
				iter.Options = cloneStepOptions(step.Options)
				iter.Options[step.Loop.As] = item

				if step.Loop.AsIndex != "" {
					iter.Options[step.Loop.AsIndex] = i
				}

				expanded = append(expanded, iter)
			}

			queue = append(expanded, queue...)

			continue
		}

		// Bypass: skip tool execution; carry previous step's stats as output.
		if step.Bypass {
			var prevStats map[string]any
			if prev != nil && prev.Stats != nil {
				prevStats = cloneStepOptions(prev.Stats)
			} else {
				prevStats = map[string]any{}
			}

			bypassResult := &WorkflowToolResult{
				Name:      step.Name,
				Passed:    true,
				Issues:    []WorkflowIssue{},
				Mutations: nil,
				Stats:     prevStats,
			}
			sr := StepResult{WorkflowToolResult: *bypassResult, DurationMs: 0}
			steps = append(steps, sr)

			if opts != nil && opts.OnStepEnd != nil {
				opts.OnStepEnd(step.Name, sr)
			}

			prev = bypassResult

			continue
		}

		tool, ok := registry.Get(step.Name)
		if !ok {
			return nil, newWorkflowError(
				fmt.Sprintf(
					"unknown tool '%s' in workflow '%s'. registered: %s",
					step.Name, workflow.ID, strings.Join(registry.Names(), ", "),
				),
				ErrToolNotFound,
			)
		}

		rawOpts := buildStepOptions(&step, opts)

		mergedOpts, interpErr := InterpolateOptions(rawOpts, env)
		if interpErr != nil {
			return nil, newWorkflowError(
				fmt.Sprintf("step '%s' interpolation: %v", step.Name, interpErr),
				interpErr,
			)
		}

		// Input schema validation: runs on the post-interpolation merged options.
		if len(step.InputSchema) > 0 {
			if valErr := ValidateStepInput(step.InputSchema, mergedOpts); valErr != nil {
				schemaFailResult := failResult(step.Name, fmt.Sprintf("schema validation: %s", valErr.Error()))
				sr := StepResult{WorkflowToolResult: *schemaFailResult, DurationMs: 0}

				if !step.ContinueOnError {
					return nil, newWorkflowError(
						fmt.Sprintf("step '%s' input schema validation failed: %s", step.Name, valErr),
						valErr,
					)
				}

				passed = false
				steps = append(steps, sr)

				if opts != nil && opts.OnStepEnd != nil {
					opts.OnStepEnd(step.Name, sr)
				}

				prev = schemaFailResult

				continue
			}
		}

		if opts != nil && opts.OnStepStart != nil {
			opts.OnStepStart(step.Name)
		}

		timeout := step.Timeout
		if timeout == 0 {
			timeout = defaultTimeout
		}

		stepCtx, cancel := context.WithTimeout(ctx, timeout)
		stepStart := time.Now()

		toolResult, err := tool.Run(stepCtx, mergedOpts)
		cancel()

		durationMs := float64(time.Since(stepStart).Milliseconds())

		if err != nil {
			if !step.ContinueOnError {
				return nil, newWorkflowError(
					fmt.Sprintf("step '%s' failed: %v", step.Name, err),
					err,
				)
			}

			toolResult = &WorkflowToolResult{
				Name:      step.Name,
				Passed:    false,
				Issues:    []WorkflowIssue{{Message: err.Error()}},
				Mutations: nil,
				Stats:     map[string]any{},
			}
		}

		if toolResult == nil {
			toolResult = &WorkflowToolResult{
				Name:      step.Name,
				Passed:    true,
				Issues:    []WorkflowIssue{},
				Mutations: nil,
				Stats:     map[string]any{},
			}
		}

		// variable-set: promote Stats["name"]/Stats["value"] into the live variable scope.
		if step.Name == "variable-set" && toolResult.Passed {
			if name, ok := toolResult.Stats["name"].(string); ok && name != "" {
				variables[name] = toolResult.Stats["value"]
			}
		}

		// Prepend any dynamically generated steps before the remaining queue.
		if len(toolResult.NextSteps) > 0 {
			queue = append(toolResult.NextSteps, queue...)
		}

		if !toolResult.Passed {
			passed = false
		}

		stepResult := StepResult{
			WorkflowToolResult: *toolResult,
			DurationMs:         durationMs,
		}

		steps = append(steps, stepResult)

		if opts != nil && opts.OnStepEnd != nil {
			opts.OnStepEnd(step.Name, stepResult)
		}

		if len(toolResult.Mutations) > 0 && opts != nil && opts.OnMutations != nil {
			if err := opts.OnMutations(toolResult.Mutations); err != nil {
				return nil, newWorkflowError("mutation handler failed", err)
			}
		}

		prev = toolResult
	}

	return &WorkflowResult{
		ID:              workflow.ID,
		Passed:          passed,
		Steps:           steps,
		TotalDurationMs: float64(time.Since(start).Milliseconds()),
	}, nil
}

// buildStepOptions merges step-level options with run-level options.
func buildStepOptions(step *StepConfig, opts *RunOptions) map[string]any {
	merged := make(map[string]any, len(step.Options)+4)

	for k, v := range step.Options {
		merged[k] = v
	}

	root := "."
	fix := false
	args := []string{}

	if opts != nil {
		if opts.Root != "" {
			root = opts.Root
		}

		fix = opts.Fix
		args = opts.Args

		if opts.ChangedFiles != nil {
			merged["_changedFiles"] = opts.ChangedFiles
		}
	}

	merged["root"] = root
	merged["fix"] = fix
	merged["_args"] = args

	return merged
}

// RunByEvent runs all workflows whose On list includes the given event.
func RunByEvent(
	ctx context.Context,
	event string,
	workflows []*WorkflowDefinition,
	registry *Registry,
	opts *RunOptions,
) ([]*WorkflowResult, error) {
	var matching []*WorkflowDefinition

	for _, w := range workflows {
		for _, e := range w.On {
			if e == event {
				matching = append(matching, w)

				break
			}
		}
	}

	if len(matching) == 0 {
		available := make([]string, 0, len(workflows))

		for _, w := range workflows {
			available = append(available, fmt.Sprintf("%s (%s)", w.ID, strings.Join(w.On, ", ")))
		}

		return nil, fmt.Errorf(
			"%w '%s'. available: %s",
			ErrNoMatchingEvent,
			event,
			strings.Join(available, "; "),
		)
	}

	results := make([]*WorkflowResult, 0, len(matching))

	for _, w := range matching {
		resolved, err := ResolveIncludes(w, workflows)
		if err != nil {
			return nil, err
		}

		result, err := RunWorkflow(ctx, resolved, registry, opts)
		if err != nil {
			return nil, err
		}

		results = append(results, result)
	}

	return results, nil
}

// RunWorkflowWithConfig resolves and runs a workflow by ID from a full config.
func RunWorkflowWithConfig(
	ctx context.Context,
	workflowID string,
	cfg *WorkflowsConfig,
	registry *Registry,
	opts *RunOptions,
) (*WorkflowResult, error) {
	w := findWorkflow(workflowID, cfg.Workflows)
	if w == nil {
		available := make([]string, 0, len(cfg.Workflows))

		for _, wf := range cfg.Workflows {
			available = append(available, wf.ID)
		}

		return nil, fmt.Errorf(
			"%w '%s'. available: %s",
			ErrWorkflowNotFound,
			workflowID,
			strings.Join(available, ", "),
		)
	}

	resolved, err := ResolveIncludes(w, cfg.Workflows)
	if err != nil {
		return nil, err
	}

	return RunWorkflow(ctx, resolved, registry, opts)
}
