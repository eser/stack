// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package validatortools_test

import (
	"context"
	"encoding/json"
	"errors"
	"slices"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/codebasefx/validatortools"
	"github.com/eser/stack/pkg/ajan/functionsfx"
	"github.com/eser/stack/pkg/ajan/workflowfx"
)

func manifestFunctions(t *testing.T) *functionsfx.Registry {
	t.Helper()

	functions := functionsfx.NewRegistry()
	if err := validatortools.RegisterManifestFunctions(functions); err != nil {
		t.Fatalf("RegisterManifestFunctions: %v", err)
	}

	return functions
}

// toolsFromFunctions is the registry the Go engine would have if it ran the
// validators through RegisterFunctions instead of registering the tools.
func toolsFromFunctions(t *testing.T) *workflowfx.Registry {
	t.Helper()

	tools := workflowfx.NewRegistry()
	if err := workflowfx.RegisterFunctions(tools, manifestFunctions(t)); err != nil {
		t.Fatalf("RegisterFunctions: %v", err)
	}

	return tools
}

func TestEveryManifestToolIsAFunctionOfTheSameName(t *testing.T) {
	t.Parallel()

	tools := workflowfx.NewRegistry()
	validatortools.RegisterManifestTools(tools)

	functions := manifestFunctions(t)

	if got, want := functions.Names(), tools.Names(); !slices.Equal(got, want) {
		t.Errorf("function names differ from tool names:\n got  %v\n want %v", got, want)
	}
}

func TestEveryValidatorFunctionDescribesItsInputAndOutput(t *testing.T) {
	t.Parallel()

	for _, descriptor := range manifestFunctions(t).List() {
		t.Run(descriptor.Name, func(t *testing.T) {
			t.Parallel()

			for label, raw := range map[string]json.RawMessage{"input": descriptor.InputSchema, "output": descriptor.OutputSchema} {
				var decoded map[string]any
				if err := json.Unmarshal(raw, &decoded); err != nil || decoded["type"] != "object" {
					t.Errorf("%s schema = %s, want a JSON object schema (%v)", label, raw, err)
				}
			}

			if !slices.Equal(descriptor.Triggers, []functionsfx.TriggerKind{functionsfx.TriggerWorkflow}) {
				t.Errorf("triggers = %v, want the workflow trigger", descriptor.Triggers)
			}

			if descriptor.Description == "" {
				t.Error("description is empty")
			}

			if descriptor.WASM {
				t.Error("a validator walks the file system and does not run in the WASM profile")
			}
		})
	}
}

func TestEveryValidateStepOfTheManifestResolves(t *testing.T) {
	t.Parallel()

	config, err := workflowfx.LoadManifest("../../../..")
	if err != nil {
		t.Fatalf("LoadManifest: %v", err)
	}

	tools := workflowfx.NewRegistry()
	validatortools.RegisterManifestTools(tools)

	asFunctions := toolsFromFunctions(t)

	seen := map[string]bool{}

	for _, definition := range config.Workflows {
		for _, step := range definition.Steps {
			if !strings.HasPrefix(step.Name, "validate-") || seen[step.Name] {
				continue
			}

			seen[step.Name] = true

			if _, ok := tools.Get(step.Name); !ok {
				t.Errorf("step %q is not a tool", step.Name)
			}

			if _, ok := asFunctions.Get(step.Name); !ok {
				t.Errorf("step %q is not a function", step.Name)
			}
		}
	}

	if len(seen) < 20 {
		t.Errorf("found %d validate-* steps in the manifest, want the 20 or more it has", len(seen))
	}
}

// resultJSON is the comparable form of a tool result: the JSON of the whole
// struct, so a number in the stats reads the same as the float64 a function
// gives it.
func resultJSON(t *testing.T, result *workflowfx.WorkflowToolResult) string {
	t.Helper()

	encoded, err := json.Marshal(result)
	if err != nil {
		t.Fatalf("encode the result: %v", err)
	}

	return string(encoded)
}

func TestAValidatorGivesTheSameResultAsAToolAndAsAFunction(t *testing.T) {
	t.Parallel()

	tree := map[string]string{
		"a.txt":            "no newline at the end",
		"b.txt":            "fine\n",
		"c.txt":            "trailing   \nspaces \n",
		"bad.json":         "{ not json",
		"good.json":        "{}\n",
		"big.txt":          strings.Repeat("x", 3000) + "\n",
		"Bad_Name.txt":     "x\n",
		"skip/Bad_One.txt": "x\n",
		"main.ts":          "const snake_case_name = 1;\n",
	}

	tests := []struct {
		name    string
		options map[string]any
	}{
		{"validate-eof", nil},
		{"validate-eof", map[string]any{"fix": true}},
		{"validate-trailing-whitespace", map[string]any{"fix": true}},
		{"validate-json", nil},
		{"validate-large-files", map[string]any{"maxKb": 1}},
		{"validate-filenames", map[string]any{
			"rules":          []any{map[string]any{"directory": "*", "convention": "kebab-case"}},
			"globalExcludes": []string{"skip/"},
		}},
		{"codebase-filenames", map[string]any{
			"rules":          []any{map[string]any{"directory": "*", "convention": "kebab-case"}},
			"globalExcludes": []string{"skip/"},
		}},
		{"codebase-eof", map[string]any{"extensions": []string{".txt"}, "exclude": []string{"c.txt"}}},
		{"validate-naming-and-todos", map[string]any{"allowNames": []string{"snake_case_name"}}},
		{"validate-naming-and-todos", nil},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			root := writeTree(t, tree)

			options := map[string]any{"root": root}
			for key, value := range tc.options {
				options[key] = value
			}

			asTool, err := mustTool(t, directTools(), tc.name).Run(context.Background(), options)
			if err != nil {
				t.Fatalf("tool: %v", err)
			}

			asFunction, err := mustTool(t, toolsFromFunctions(t), tc.name).Run(context.Background(), options)
			if err != nil {
				t.Fatalf("function: %v", err)
			}

			if got, want := resultJSON(t, asFunction), resultJSON(t, asTool); got != want {
				t.Errorf("the function and the tool disagree:\n function %s\n tool     %s", got, want)
			}
		})
	}
}

func directTools() *workflowfx.Registry {
	tools := workflowfx.NewRegistry()
	validatortools.RegisterManifestTools(tools)

	return tools
}

func mustTool(t *testing.T, registry *workflowfx.Registry, name string) workflowfx.WorkflowTool { //nolint:ireturn
	t.Helper()

	tool, ok := registry.Get(name)
	if !ok {
		t.Fatalf("%s is not registered", name)
	}

	return tool
}

func TestAFunctionCalledWithJSONStillReadsItsStringLists(t *testing.T) {
	t.Parallel()

	root := writeTree(t, map[string]string{"skip/Bad_One.txt": "x\n", "Bad_Two.txt": "x\n"})
	functions := manifestFunctions(t)

	input, err := json.Marshal(map[string]any{
		"root":           root,
		"rules":          []map[string]any{{"directory": "*", "convention": "kebab-case"}},
		"globalExcludes": []string{"skip/"},
	})
	if err != nil {
		t.Fatal(err)
	}

	output, err := functions.Call(t.Context(), "codebase-filenames", input)
	if err != nil {
		t.Fatalf("Call: %v", err)
	}

	var decoded workflowfx.ToolOutput
	if err := json.Unmarshal(output, &decoded); err != nil {
		t.Fatalf("decode %s: %v", output, err)
	}

	for _, issue := range decoded.Issues {
		if strings.Contains(issue.Message, "Bad_One") {
			t.Errorf("globalExcludes was ignored after crossing JSON: %q", issue.Message)
		}
	}

	if decoded.Passed || len(decoded.Issues) == 0 {
		t.Errorf("output = %+v, want the issue of Bad_Two.txt", decoded)
	}
}

func TestAValidatorWithoutItsRequiredOptionIsAValidationError(t *testing.T) {
	t.Parallel()

	functions := manifestFunctions(t)

	for _, name := range []string{"validate-server-loc", "validate-error-coverage"} {
		_, err := functions.Call(t.Context(), name, json.RawMessage(`{"root":"."}`))

		if !functionsfx.IsKind(err, functionsfx.KindValidation) {
			t.Errorf("%s: error = %v, want a ValidationError for the missing option", name, err)
		}
	}
}

func TestAValidatorRunsFromAManifestStepThroughFunctions(t *testing.T) {
	t.Parallel()

	root := writeTree(t, map[string]string{"a.txt": "no newline", "b.txt": "fine\n"})

	config, err := workflowfx.ParseManifest("validators.yml", []byte(`
workflows:
  - id: check
    on: [precommit]
    steps:
      - validate-eof
`))
	if err != nil {
		t.Fatalf("ParseManifest: %v", err)
	}

	run := func(tools *workflowfx.Registry) *workflowfx.WorkflowResult {
		result, runErr := workflowfx.RunWorkflowWithConfig(t.Context(), "check", config, tools, &workflowfx.RunOptions{Root: root})
		if runErr != nil {
			t.Fatalf("run: %v", runErr)
		}

		return result
	}

	direct := workflowfx.NewRegistry()
	validatortools.RegisterManifestTools(direct)

	asTool, asFunction := run(direct), run(toolsFromFunctions(t))

	if asTool.Passed || asFunction.Passed {
		t.Fatalf("passed: tool %v, function %v, want both to fail on a.txt", asTool.Passed, asFunction.Passed)
	}

	strip := func(result *workflowfx.WorkflowResult) string {
		return resultJSON(t, &result.Steps[0].WorkflowToolResult)
	}

	if got, want := strip(asFunction), strip(asTool); got != want {
		t.Errorf("the step differs:\n function %s\n tool     %s", got, want)
	}
}

func TestToolOutputOfRefusesNextSteps(t *testing.T) {
	t.Parallel()

	_, err := workflowfx.ToolOutputOf(&workflowfx.WorkflowToolResult{
		Name:      "adds-steps",
		NextSteps: []workflowfx.StepConfig{{Name: "shell"}},
	})
	if !errors.Is(err, workflowfx.ErrNextSteps) {
		t.Errorf("error = %v, want ErrNextSteps", err)
	}
}
