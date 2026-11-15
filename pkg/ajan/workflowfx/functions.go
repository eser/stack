// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package workflowfx

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/eser/stack/pkg/ajan/functionsfx"
)

// ErrToolExists is returned by RegisterFunctions when a tool of a function's
// name is already registered.
var ErrToolExists = errors.New("a tool of that name is already registered")

// ToolIssue is a problem a function reports, the wire form of WorkflowIssue.
type ToolIssue struct {
	Path    string `json:"path,omitempty"`
	Line    int    `json:"line,omitempty"`
	Message string `json:"message"`
	Fixed   bool   `json:"fixed,omitempty"`
}

// ToolMutation is a file change a function reports, the wire form of
// WorkflowFileMutation.
type ToolMutation struct {
	Path       string `json:"path"`
	OldContent string `json:"oldContent"`
	NewContent string `json:"newContent"`
}

// ToolOutput is the output of a function that declares the workflow trigger
// (functionsfx.TriggerWorkflow): the wire form of WorkflowToolResult. Passed is
// false unless the function sets it, so a function that forgets it fails its
// step where a reader can see it.
type ToolOutput struct {
	Stats     map[string]any `json:"stats,omitempty"`
	Issues    []ToolIssue    `json:"issues,omitempty"`
	Mutations []ToolMutation `json:"mutations,omitempty"`
	Passed    bool           `json:"passed"`
}

// ErrNextSteps is returned by ToolOutputOf for a result that adds steps to the
// run: a function answers its own step and cannot carry them.
var ErrNextSteps = errors.New("a tool result with next steps cannot be a function output")

// ToolOutputOf is the inverse of the reading RegisterFunctions does: it turns
// the result of a tool into the ToolOutput of a function that declares the
// workflow trigger, so a tool can be exposed as a function without rewriting
// it. Numbers in the stats come back as float64 once the output has crossed
// JSON, like any decoded number.
func ToolOutputOf(result *WorkflowToolResult) (ToolOutput, error) {
	if len(result.NextSteps) > 0 {
		return ToolOutput{}, fmt.Errorf("tool %q: %w", result.Name, ErrNextSteps)
	}

	issues := make([]ToolIssue, 0, len(result.Issues))
	for _, issue := range result.Issues {
		issues = append(issues, ToolIssue(issue))
	}

	mutations := make([]ToolMutation, 0, len(result.Mutations))
	for _, mutation := range result.Mutations {
		mutations = append(mutations, ToolMutation(mutation))
	}

	return ToolOutput{Passed: result.Passed, Issues: issues, Mutations: mutations, Stats: result.Stats}, nil
}

// functionTool runs a function as a workflow tool.
type functionTool struct {
	function    functionsfx.Function
	name        string
	description string
	// asToolOutput is set for a function that declares the workflow trigger.
	asToolOutput bool
}

func (t *functionTool) Name() string { return t.name }

func (t *functionTool) Description() string { return t.description }

// Run encodes the options of the step as the function's input and runs it.
//
// The options are the merged options of the step: the ones the manifest gives
// and the ones the engine adds (root, fix, dryRun, _args and _changedFiles). A
// function takes the fields it needs, so its input type or schema must not
// forbid additional properties.
//
// A ValidationError or an AdaptError fails the step with its message and lets
// the run go on, like a tool that refuses its options. Any other error is
// returned, which stops the run unless the step sets continueOnError.
func (t *functionTool) Run(ctx context.Context, options map[string]any) (*WorkflowToolResult, error) {
	input, err := json.Marshal(options)
	if err != nil {
		return nil, fmt.Errorf("function %q: encode the options of the step: %w", t.name, err)
	}

	output, err := t.function.Call(ctx, input)
	if err != nil {
		if functionsfx.IsKind(err, functionsfx.KindValidation) || functionsfx.IsKind(err, functionsfx.KindAdapt) {
			return failResult(t.name, functionsfx.MessageOf(err)), nil
		}

		return nil, fmt.Errorf("function %q: %w", t.name, err)
	}

	if t.asToolOutput {
		return toolResultOf(t.name, output)
	}

	var value any
	if err := json.Unmarshal(output, &value); err != nil {
		return nil, fmt.Errorf("function %q: decode the output: %w", t.name, err)
	}

	return &WorkflowToolResult{
		Name:      t.name,
		Passed:    true,
		Issues:    []WorkflowIssue{},
		Mutations: nil,
		Stats:     map[string]any{"output": value},
		NextSteps: nil,
	}, nil
}

// toolResultOf reads the output of a workflow-trigger function as a
// ToolOutput. A field it does not know is an error: the function declared the
// shape, so a typo is a bug to see.
func toolResultOf(name string, output json.RawMessage) (*WorkflowToolResult, error) {
	decoder := json.NewDecoder(bytes.NewReader(output))
	decoder.DisallowUnknownFields()

	var decoded ToolOutput
	if err := decoder.Decode(&decoded); err != nil {
		return nil, fmt.Errorf("function %q declares the workflow trigger but its output is not a ToolOutput: %w", name, err)
	}

	issues := make([]WorkflowIssue, 0, len(decoded.Issues))
	for _, issue := range decoded.Issues {
		issues = append(issues, WorkflowIssue(issue))
	}

	// nil when there are none, like the engine's own results.
	var mutations []WorkflowFileMutation

	if count := len(decoded.Mutations); count > 0 {
		mutations = make([]WorkflowFileMutation, 0, count)

		for _, mutation := range decoded.Mutations {
			mutations = append(mutations, WorkflowFileMutation(mutation))
		}
	}

	stats := decoded.Stats
	if stats == nil {
		stats = map[string]any{}
	}

	return &WorkflowToolResult{
		Name:      name,
		Passed:    decoded.Passed,
		Issues:    issues,
		Mutations: mutations,
		Stats:     stats,
		NextSteps: nil,
	}, nil
}

// RegisterFunctions registers every function of a functionsfx registry as a
// workflow tool under the function's name, so a manifest step names a function
// like any other tool and the engine's if, loop, includes and inputSchema work
// on it. The manifest syntax does not change. Go calls Go only.
//
// A function that declares functionsfx.TriggerWorkflow answers a ToolOutput,
// which fills the passed flag, the issues, the mutations and the stats of the
// step. Any other function passes its step and its output is Stats["output"].
//
// The tools are those of the registry at the time of the call. A name that is
// already a tool is ErrToolExists, and nothing is registered: a function must
// not replace the shell tool by sharing its name.
func RegisterFunctions(tools *Registry, functions *functionsfx.Registry) error {
	descriptors := functions.List()

	for i := range descriptors {
		if _, exists := tools.Get(descriptors[i].Name); exists {
			return fmt.Errorf("%w: %q", ErrToolExists, descriptors[i].Name)
		}
	}

	for i := range descriptors {
		function, ok := functions.Get(descriptors[i].Name)
		if !ok {
			continue
		}

		tools.Register(&functionTool{
			function:     function,
			name:         descriptors[i].Name,
			description:  descriptors[i].Description,
			asToolOutput: servesWorkflow(&descriptors[i]),
		})
	}

	return nil
}

func servesWorkflow(descriptor *functionsfx.Descriptor) bool {
	for _, trigger := range descriptor.Triggers {
		if trigger == functionsfx.TriggerWorkflow {
			return true
		}
	}

	return false
}
