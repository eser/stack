// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package workflowfx_test

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"sync"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/functionsfx"
	"github.com/eser/stack/pkg/ajan/workflowfx"
)

type shoutInput struct {
	Text string `json:"text"`
	Root string `json:"root"`
	Fix  bool   `json:"fix"`
}

// calls records the texts a function ran with, in order.
type calls struct {
	texts []string
	mu    sync.Mutex
}

func (c *calls) add(text string) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.texts = append(c.texts, text)
}

func (c *calls) snapshot() []string {
	c.mu.Lock()
	defer c.mu.Unlock()

	return slices.Clone(c.texts)
}

func mustFunction(t *testing.T, name string, handler functionsfx.Handler[shoutInput, any], options ...functionsfx.Option) functionsfx.Function {
	t.Helper()

	function, err := functionsfx.NewFunction(name, handler, options...)
	if err != nil {
		t.Fatalf("NewFunction(%q): %v", name, err)
	}

	return function
}

// fixtureFunctions returns the registry the tests run on and what "shout"
// recorded.
func fixtureFunctions(t *testing.T) (*functionsfx.Registry, *calls) {
	t.Helper()

	recorded := &calls{}
	registry := functionsfx.NewRegistry()

	functions := []functionsfx.Function{
		mustFunction(t, "shout", func(_ context.Context, input shoutInput) (any, error) {
			recorded.add(input.Text)

			return map[string]any{"text": input.Text + "!", "root": input.Root, "fix": input.Fix}, nil
		}, functionsfx.WithDescription("Adds an exclamation mark")),

		mustFunction(t, "strict-shout", func(_ context.Context, input shoutInput) (any, error) {
			return input.Text + "!", nil
		}, functionsfx.WithInputSchema(json.RawMessage(`{
			"type": "object",
			"properties": {"text": {"type": "string", "minLength": 1}},
			"required": ["text"]
		}`))),

		mustFunction(t, "check-text", func(_ context.Context, input shoutInput) (any, error) {
			if input.Text == "" {
				return workflowfx.ToolOutput{
					Passed: false,
					Issues: []workflowfx.ToolIssue{{Path: "a.txt", Line: 3, Message: "text is empty"}},
					Stats:  map[string]any{"checked": 1},
				}, nil
			}

			return workflowfx.ToolOutput{Passed: true, Stats: map[string]any{"checked": 1}}, nil
		}, functionsfx.WithTriggers(functionsfx.TriggerWorkflow)),

		mustFunction(t, "fix-text", func(_ context.Context, input shoutInput) (any, error) {
			return workflowfx.ToolOutput{
				Passed:    true,
				Mutations: []workflowfx.ToolMutation{{Path: "a.txt", OldContent: input.Text, NewContent: input.Text + "!"}},
			}, nil
		}, functionsfx.WithTriggers(functionsfx.TriggerWorkflow)),

		mustFunction(t, "wrong-shape", func(context.Context, shoutInput) (any, error) {
			return map[string]any{"passed": true, "isses": []string{}}, nil
		}, functionsfx.WithTriggers(functionsfx.TriggerWorkflow)),

		mustFunction(t, "disk-full", func(context.Context, shoutInput) (any, error) {
			return nil, errors.New("disk full")
		}),

		mustFunction(t, "slow", func(ctx context.Context, _ shoutInput) (any, error) {
			<-ctx.Done()

			return nil, fmt.Errorf("slow: %w", ctx.Err())
		}),
	}

	for _, function := range functions {
		if err := registry.Register(function); err != nil {
			t.Fatalf("Register: %v", err)
		}
	}

	return registry, recorded
}

func toolsOf(t *testing.T, functions *functionsfx.Registry) *workflowfx.Registry {
	t.Helper()

	tools := workflowfx.NewRegistry()
	if err := workflowfx.RegisterFunctions(tools, functions); err != nil {
		t.Fatalf("RegisterFunctions: %v", err)
	}

	return tools
}

func runFunctionManifest(t *testing.T, manifest string, tools *workflowfx.Registry, opts *workflowfx.RunOptions) (*workflowfx.WorkflowResult, error) {
	t.Helper()

	config, err := workflowfx.ParseManifest("functions.yml", []byte(manifest))
	if err != nil {
		t.Fatalf("ParseManifest: %v", err)
	}

	return workflowfx.RunWorkflowWithConfig(t.Context(), "demo", config, tools, opts)
}

func TestRegisterFunctionsRegistersEveryFunctionAsATool(t *testing.T) {
	t.Parallel()

	functions, _ := fixtureFunctions(t)
	tools := toolsOf(t, functions)

	for _, name := range functions.Names() {
		if _, ok := tools.Get(name); !ok {
			t.Errorf("function %q is not a tool", name)
		}
	}

	shout := tools.MustGet("shout")
	if shout.Name() != "shout" || shout.Description() != "Adds an exclamation mark" {
		t.Errorf("tool = (%q, %q)", shout.Name(), shout.Description())
	}
}

func TestRegisterFunctionsRefusesANameThatIsAlreadyATool(t *testing.T) {
	t.Parallel()

	functions, _ := fixtureFunctions(t)
	tools := workflowfx.NewRegistry()
	tools.Register(workflowfx.NewShellTool())

	clash, err := functionsfx.NewFunction("shell",
		functionsfx.Handler[shoutInput, any](func(context.Context, shoutInput) (any, error) { return nil, nil }), //nolint:nilnil
	)
	if err != nil {
		t.Fatalf("NewFunction: %v", err)
	}

	if err := functions.Register(clash); err != nil {
		t.Fatalf("Register: %v", err)
	}

	if err := workflowfx.RegisterFunctions(tools, functions); !errors.Is(err, workflowfx.ErrToolExists) {
		t.Fatalf("RegisterFunctions error = %v, want ErrToolExists", err)
	}

	if _, ok := tools.Get("shout"); ok {
		t.Error("a function was registered although another one clashed: the call must register nothing")
	}

	if got := tools.MustGet("shell").Description(); got == "" || got == clash.Descriptor().Description {
		t.Errorf("the shell tool was replaced (description %q)", got)
	}
}

func TestAManifestStepRunsAFunctionAndKeepsItsOutput(t *testing.T) {
	t.Parallel()

	functions, recorded := fixtureFunctions(t)

	result, err := runFunctionManifest(t, `
workflows:
  - id: demo
    on: [precommit]
    steps:
      - shout:
          text: hello
`, toolsOf(t, functions), &workflowfx.RunOptions{Root: "/work", Fix: true})
	if err != nil {
		t.Fatalf("run: %v", err)
	}

	if !result.Passed || len(result.Steps) != 1 {
		t.Fatalf("result = %+v, want one passed step", result)
	}

	output, _ := result.Steps[0].Stats["output"].(map[string]any)
	if output["text"] != "hello!" {
		t.Errorf("stats.output = %v, want text %q", output, "hello!")
	}

	if output["root"] != "/work" || output["fix"] != true {
		t.Errorf("the options the engine adds did not reach the function: %v", output)
	}

	if got := recorded.snapshot(); !slices.Equal(got, []string{"hello"}) {
		t.Errorf("function ran with %v, want [hello]", got)
	}
}

func TestAWorkflowTriggerFunctionFillsTheToolResult(t *testing.T) {
	t.Parallel()

	functions, _ := fixtureFunctions(t)

	result, err := runFunctionManifest(t, `
workflows:
  - id: demo
    on: [precommit]
    steps:
      - check-text:
          text: ""
      - check-text:
          text: fine
`, toolsOf(t, functions), nil)
	if err != nil {
		t.Fatalf("run: %v", err)
	}

	if result.Passed || len(result.Steps) != 2 {
		t.Fatalf("result = %+v, want two steps and a failed run", result)
	}

	failed := result.Steps[0]
	if failed.Passed || len(failed.Issues) != 1 || failed.Issues[0] != (workflowfx.WorkflowIssue{Path: "a.txt", Line: 3, Message: "text is empty"}) {
		t.Errorf("first step = %+v, want the issue of the function", failed.WorkflowToolResult)
	}

	if failed.Stats["checked"] != float64(1) {
		t.Errorf("stats = %v, want checked 1", failed.Stats)
	}

	if !result.Steps[1].Passed || len(result.Steps[1].Issues) != 0 {
		t.Errorf("second step = %+v, want it to pass", result.Steps[1].WorkflowToolResult)
	}
}

func TestAWorkflowTriggerFunctionCanReportMutations(t *testing.T) {
	t.Parallel()

	functions, _ := fixtureFunctions(t)

	var got []workflowfx.WorkflowFileMutation

	_, err := runFunctionManifest(t, `
workflows:
  - id: demo
    on: [precommit]
    steps:
      - fix-text:
          text: draft
`, toolsOf(t, functions), &workflowfx.RunOptions{
		OnMutations: func(mutations []workflowfx.WorkflowFileMutation) error {
			got = mutations

			return nil
		},
	})
	if err != nil {
		t.Fatalf("run: %v", err)
	}

	want := []workflowfx.WorkflowFileMutation{{Path: "a.txt", OldContent: "draft", NewContent: "draft!"}}
	if !slices.Equal(got, want) {
		t.Errorf("mutations = %+v, want %+v", got, want)
	}
}

func TestAWorkflowTriggerFunctionWithAWrongShapeIsAnError(t *testing.T) {
	t.Parallel()

	functions, _ := fixtureFunctions(t)

	_, err := runFunctionManifest(t, `
workflows:
  - id: demo
    on: [precommit]
    steps:
      - wrong-shape
`, toolsOf(t, functions), nil)
	if err == nil {
		t.Fatal("run succeeded, want an error for an output that is not a ToolOutput")
	}
}

func TestTheEngineDirectivesWorkOnAFunctionStep(t *testing.T) {
	t.Parallel()

	functions, recorded := fixtureFunctions(t)

	// if and includes come from the manifest; loop needs variables, which the
	// manifest has no key for, so that case builds its definition below.
	result, err := runFunctionManifest(t, `
workflows:
  - id: base
    on: [precommit]
    steps:
      - shout:
          text: from-base
  - id: demo
    on: [precommit]
    includes: [base]
    steps:
      - shout:
          if: event == "precommit"
          text: runs
      - shout:
          if: event == "prepush"
          text: skipped
`, toolsOf(t, functions), &workflowfx.RunOptions{Event: "precommit"})
	if err != nil {
		t.Fatalf("run: %v", err)
	}

	if got := recorded.snapshot(); !slices.Equal(got, []string{"from-base", "runs"}) {
		t.Errorf("function ran with %v, want the included step then the step whose if holds", got)
	}

	if len(result.Steps) != 2 {
		t.Errorf("steps = %d, want 2", len(result.Steps))
	}
}

func TestALoopRunsTheFunctionOncePerItem(t *testing.T) {
	t.Parallel()

	functions, recorded := fixtureFunctions(t)

	definition := &workflowfx.WorkflowDefinition{
		ID:        "demo",
		On:        []string{"precommit"},
		Variables: map[string]any{"words": []any{"a", "b", "c"}},
		Steps: []workflowfx.StepConfig{{
			Name:    "shout",
			Options: map[string]any{},
			Loop:    &workflowfx.LoopConfig{Over: "vars.words", As: "text", AsIndex: "index"},
		}},
	}

	result, err := workflowfx.RunWorkflow(t.Context(), definition, toolsOf(t, functions), nil)
	if err != nil {
		t.Fatalf("run: %v", err)
	}

	if got := recorded.snapshot(); !slices.Equal(got, []string{"a", "b", "c"}) {
		t.Errorf("function ran with %v, want one run per item", got)
	}

	if len(result.Steps) != 3 {
		t.Errorf("steps = %d, want 3", len(result.Steps))
	}
}

func TestTheInputSchemaDirectiveOfAStepAppliesToAFunction(t *testing.T) {
	t.Parallel()

	functions, recorded := fixtureFunctions(t)

	_, err := runFunctionManifest(t, `
workflows:
  - id: demo
    on: [precommit]
    steps:
      - shout:
          inputSchema:
            type: object
            required: [text]
          other: value
`, toolsOf(t, functions), nil)
	if err == nil {
		t.Fatal("run succeeded, want the step's inputSchema to refuse options without text")
	}

	if got := recorded.snapshot(); len(got) != 0 {
		t.Errorf("function ran with %v although the schema refused the step", got)
	}
}

func TestAValidationErrorFailsTheStepWithItsMessageAndTheRunGoesOn(t *testing.T) {
	t.Parallel()

	functions, recorded := fixtureFunctions(t)

	result, err := runFunctionManifest(t, `
workflows:
  - id: demo
    on: [precommit]
    steps:
      - strict-shout:
          other: value
      - shout:
          text: after
`, toolsOf(t, functions), nil)
	if err != nil {
		t.Fatalf("run error = %v, want a failed step and not a failed run", err)
	}

	if result.Passed || len(result.Steps) != 2 {
		t.Fatalf("result = %+v, want two steps and a failed run", result)
	}

	failed := result.Steps[0]
	if failed.Passed || len(failed.Issues) != 1 || failed.Issues[0].Message == "" {
		t.Errorf("first step = %+v, want a failure that carries the message of the schema", failed.WorkflowToolResult)
	}

	if got := recorded.snapshot(); !slices.Equal(got, []string{"after"}) {
		t.Errorf("the run did not go on: shout ran with %v", got)
	}
}

func TestAnotherErrorStopsTheRunUnlessTheStepContinues(t *testing.T) {
	t.Parallel()

	functions, _ := fixtureFunctions(t)
	tools := toolsOf(t, functions)

	_, err := runFunctionManifest(t, `
workflows:
  - id: demo
    on: [precommit]
    steps:
      - disk-full
`, tools, nil)
	if err == nil || !errors.Is(err, workflowfx.ErrWorkflow) {
		t.Fatalf("run error = %v, want a workflow error", err)
	}

	result, err := runFunctionManifest(t, `
workflows:
  - id: demo
    on: [precommit]
    steps:
      - disk-full:
          continueOnError: true
`, tools, nil)
	if err != nil {
		t.Fatalf("run error = %v, want the step to continue", err)
	}

	if result.Passed || len(result.Steps[0].Issues) != 1 {
		t.Errorf("result = %+v, want a failed step with the error as its issue", result)
	}
}

func TestTheTimeoutOfAStepEndsTheFunction(t *testing.T) {
	t.Parallel()

	functions, _ := fixtureFunctions(t)

	start := time.Now()

	_, err := runFunctionManifest(t, `
workflows:
  - id: demo
    on: [precommit]
    steps:
      - slow:
          timeout: 0.05
`, toolsOf(t, functions), nil)
	if err == nil {
		t.Fatal("run succeeded, want the step to time out")
	}

	if !errors.Is(err, context.DeadlineExceeded) {
		t.Errorf("run error = %v, want it to reach context.DeadlineExceeded", err)
	}

	if elapsed := time.Since(start); elapsed > 5*time.Second {
		t.Errorf("the run took %v, the function did not stop at its step's timeout", elapsed)
	}
}

func TestTheManifestSchemaIsUnchanged(t *testing.T) {
	t.Parallel()

	// A function is named in a step like any tool, so a manifest that names one
	// needs no key the schema lacks: ParseManifest accepted every manifest above.
	// This one adds a step with options only, the form the schema had before.
	config, err := workflowfx.ParseManifest("plain.yml", []byte(`
workflows:
  - id: demo
    on: [precommit]
    steps:
      - shout
      - check-text:
          text: x
`))
	if err != nil {
		t.Fatalf("ParseManifest: %v", err)
	}

	if len(config.Workflows[0].Steps) != 2 {
		t.Errorf("steps = %d, want 2", len(config.Workflows[0].Steps))
	}
}
