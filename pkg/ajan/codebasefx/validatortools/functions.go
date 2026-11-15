// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package validatortools

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/eser/stack/pkg/ajan/functionsfx"
	"github.com/eser/stack/pkg/ajan/workflowfx"
)

// The validators as functionsfx functions (ADR 0011). Each function wraps the
// tool RegisterManifestTools registers under the same name, so a validator
// gives the same issues whether the Go engine runs it as a tool or TypeScript
// calls it through the bridge. The function adds what a tool does not have: an
// input schema and an output schema in its descriptor, and the workflow
// trigger, which says its output is a workflowfx.ToolOutput.

// ownerPackage is the workspace package that owns the validators: the
// TypeScript types of their functions are generated into it.
const ownerPackage = "@eserstack/codebase"

// stringListOptions are the options that hold a list of strings. Decoded from
// JSON they arrive as []any, while the engine and Go callers pass []string, and
// a few validators read only the second form, so the function converts them
// before it runs the tool.
var stringListOptions = []string{ //nolint:gochecknoglobals
	"_changedFiles", "_args", "extensions", "exclude", "globalExcludes",
	"allowNames", "ignoreWords", "types", "errorObjects", "requiredFields",
}

// normalizeOptions copies the options of a call and turns every list of
// strings from []any into []string. A list with another kind of element stays
// as it is, for the tool to refuse.
func normalizeOptions(options map[string]any) map[string]any {
	normalized := make(map[string]any, len(options))

	for key, value := range options {
		normalized[key] = value
	}

	for _, key := range stringListOptions {
		list, isList := normalized[key].([]any)
		if !isList {
			continue
		}

		strings := make([]string, 0, len(list))
		allStrings := true

		for _, item := range list {
			text, isString := item.(string)
			if !isString {
				allStrings = false

				break
			}

			strings = append(strings, text)
		}

		if allStrings {
			normalized[key] = strings
		}
	}

	return normalized
}

// toolFunction wraps a tool as a function that declares the workflow trigger.
func toolFunction(tool workflowfx.WorkflowTool) (functionsfx.Function, error) { //nolint:ireturn
	input, err := json.Marshal(inputSchemaOf(tool.Name()))
	if err != nil {
		return nil, fmt.Errorf("encode the input schema: %w", err)
	}

	// The output is workflowfx.ToolOutput, so its schema comes from the struct.
	output, err := functionsfx.SchemaOf[workflowfx.ToolOutput]()
	if err != nil {
		return nil, fmt.Errorf("derive the output schema: %w", err)
	}

	handler := functionsfx.Handler[map[string]any, workflowfx.ToolOutput](
		func(ctx context.Context, options map[string]any) (workflowfx.ToolOutput, error) {
			result, runErr := tool.Run(ctx, normalizeOptions(options))
			if runErr != nil {
				return workflowfx.ToolOutput{}, runErr //nolint:wrapcheck // the tool names itself
			}

			return workflowfx.ToolOutputOf(result) //nolint:wrapcheck // names the tool
		},
	)

	return functionsfx.NewFunction(tool.Name(), handler, //nolint:wrapcheck // names the function
		functionsfx.WithDescription(tool.Description()),
		functionsfx.WithOwner(ownerPackage),
		functionsfx.WithInputSchema(input),
		functionsfx.WithOutputSchema(output),
		functionsfx.WithTriggers(functionsfx.TriggerWorkflow),
	)
}

// RegisterManifestFunctions registers every tool of RegisterManifestTools (the
// codebase-* validators, the validate-* steps of .eser/manifest.yml and the
// whole-repository checks) as a function of the registry, under the same
// names. The Go engine keeps running them as tools, and the bridge serves these
// functions to TypeScript.
func RegisterManifestFunctions(functions *functionsfx.Registry) error {
	tools := workflowfx.NewRegistry()
	RegisterManifestTools(tools)

	for _, name := range tools.Names() {
		function, err := toolFunction(tools.MustGet(name))
		if err != nil {
			return fmt.Errorf("function %q: %w", name, err)
		}

		if err := functions.Register(function); err != nil {
			return fmt.Errorf("function %q: %w", name, err)
		}
	}

	return nil
}
