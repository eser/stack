// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package workflowfx

import "context"

// variableSetTool writes a named value into the workflow's live variable scope.
//
// Required options:
//   - "name"  (string) — variable key
//   - "value" (any)    — value to store
//
// The engine checks for this tool's name after each successful run and updates
// the mutable variables map accordingly. This makes the value immediately visible
// to subsequent step predicates, option interpolations, and loop expressions.
type variableSetTool struct{}

func (t *variableSetTool) Name() string { return "variable-set" }
func (t *variableSetTool) Description() string {
	return "write a named value into the workflow variable scope"
}

func (t *variableSetTool) Run(_ context.Context, opts map[string]any) (*WorkflowToolResult, error) {
	name, _ := opts["name"].(string)
	if name == "" {
		return failResult(t.Name(), `option "name" (string) is required`), nil
	}

	value := opts["value"]

	return &WorkflowToolResult{
		Name:   t.Name(),
		Passed: true,
		Stats:  map[string]any{"name": name, "value": value},
	}, nil
}
