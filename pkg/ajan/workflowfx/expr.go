// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package workflowfx

import (
	"fmt"
	"reflect"

	"github.com/expr-lang/expr"
)

// buildExprEnv constructs the map passed to every Expr evaluation.
// Keys: root, fix, event, changedFiles, vars, variables, steps, prev.
// steps is a snapshot of completed step results (0-based).
// variables is the live mutable scope; vars is an alias to the same map for backward compat.
func buildExprEnv(workflow *WorkflowDefinition, opts *RunOptions, prev *WorkflowToolResult, steps []StepResult, variables map[string]any) map[string]any {
	root := "."
	fix := false
	event := ""
	var changedFiles []string

	if opts != nil {
		if opts.Root != "" {
			root = opts.Root
		}

		fix = opts.Fix
		event = opts.Event
		changedFiles = opts.ChangedFiles
	}

	_ = workflow // reserved for future workflow-level fields in env

	return map[string]any{
		"root":         root,
		"fix":          fix,
		"event":        event,
		"changedFiles": changedFiles,
		"vars":         variables, // backward-compat alias for the live variable scope
		"variables":    variables, // new name: mutable across steps via variable-set
		"steps":        stepsToEnvSlice(steps),
		"prev":         prev,
	}
}

// stepsToEnvSlice converts accumulated StepResults to a []map[string]any for
// clean key-based access in Expr expressions: steps[0].stats["key"], steps[0].passed, etc.
func stepsToEnvSlice(steps []StepResult) []map[string]any {
	result := make([]map[string]any, len(steps))

	for i, s := range steps {
		stats := s.Stats
		if stats == nil {
			stats = map[string]any{}
		}

		result[i] = map[string]any{
			"name":       s.Name,
			"passed":     s.Passed,
			"issues":     s.Issues,
			"stats":      stats,
			"durationMs": s.DurationMs,
		}
	}

	return result
}

// evalExprAny compiles and runs an Expr expression, returning the raw result.
func evalExprAny(expression string, env map[string]any) (any, error) {
	program, err := expr.Compile(expression)
	if err != nil {
		return nil, fmt.Errorf("compile: %w", err)
	}

	out, err := expr.Run(program, env)
	if err != nil {
		return nil, fmt.Errorf("eval: %w", err)
	}

	return out, nil
}

// evalBoolExpr compiles and runs an Expr expression, returning a bool result.
func evalBoolExpr(expression string, env map[string]any) (bool, error) {
	program, err := expr.Compile(expression)
	if err != nil {
		return false, fmt.Errorf("compile: %w", err)
	}

	out, err := expr.Run(program, env)
	if err != nil {
		return false, fmt.Errorf("eval: %w", err)
	}

	b, ok := out.(bool)
	if !ok {
		return false, fmt.Errorf("if-expression returned %T, expected bool", out)
	}

	return b, nil
}

// evalSliceExpr compiles and runs an Expr expression, returning a []any result.
// Handles both []any and any concrete slice type via reflection.
func evalSliceExpr(expression string, env map[string]any) ([]any, error) {
	program, err := expr.Compile(expression)
	if err != nil {
		return nil, fmt.Errorf("compile: %w", err)
	}

	out, err := expr.Run(program, env)
	if err != nil {
		return nil, fmt.Errorf("eval: %w", err)
	}

	if out == nil {
		return nil, nil
	}

	if s, ok := out.([]any); ok {
		return s, nil
	}

	// Handle typed slices ([]string, []int, etc.) via reflection.
	rv := reflect.ValueOf(out)
	if rv.Kind() != reflect.Slice {
		return nil, fmt.Errorf("loop.over expression returned %T, expected a slice", out)
	}

	result := make([]any, rv.Len())
	for i := range result {
		result[i] = rv.Index(i).Interface()
	}

	return result, nil
}

// cloneStepOptions returns a shallow copy of opts with no shared backing map.
func cloneStepOptions(opts map[string]any) map[string]any {
	clone := make(map[string]any, len(opts))
	for k, v := range opts {
		clone[k] = v
	}

	return clone
}
