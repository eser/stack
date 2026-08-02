// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
// Phase B tests: If predicate, Loop, Variables, NextSteps, Expr context.

package workflowfx_test

import (
	"context"
	"testing"

	"github.com/eser/stack/pkg/ajan/workflowfx"
)

// ─── If predicate ─────────────────────────────────────────────────────────────

func TestStepIf_TrueRuns(t *testing.T) {
	r := reg(&passingTool{name: "a"})
	wf := workflowfx.Create("wf").On("push").
		Step("a", workflowfx.StepOpts{"if": "fix == true"}).
		MustBuild()

	result, err := workflowfx.RunWorkflow(context.Background(), wf, r, &workflowfx.RunOptions{Fix: true})
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Steps) != 1 {
		t.Fatalf("expected 1 step result (step ran), got %d", len(result.Steps))
	}
}

func TestStepIf_FalseSkips(t *testing.T) {
	r := reg(&passingTool{name: "a"})
	wf := workflowfx.Create("wf").On("push").
		Step("a", workflowfx.StepOpts{"if": "fix == true"}).
		MustBuild()

	result, err := workflowfx.RunWorkflow(context.Background(), wf, r, &workflowfx.RunOptions{Fix: false})
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Steps) != 0 {
		t.Fatalf("expected 0 step results (step skipped), got %d", len(result.Steps))
	}
}

func TestStepIf_ContextRoot(t *testing.T) {
	r := reg(&passingTool{name: "a"})
	wf := workflowfx.Create("wf").On("push").
		Step("a", workflowfx.StepOpts{"if": `root == "/myproject"`}).
		MustBuild()

	result, err := workflowfx.RunWorkflow(context.Background(), wf, r, &workflowfx.RunOptions{Root: "/myproject"})
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Steps) != 1 {
		t.Fatal("expected step to run when root matches")
	}
}

func TestStepIf_ContextFix(t *testing.T) {
	r := reg(&passingTool{name: "a"}, &passingTool{name: "b"})
	wf := workflowfx.Create("wf").On("push").
		Step("a", workflowfx.StepOpts{"if": "!fix"}).
		Step("b", workflowfx.StepOpts{"if": "fix"}).
		MustBuild()

	// fix=true: only "b" should run
	result, err := workflowfx.RunWorkflow(context.Background(), wf, r, &workflowfx.RunOptions{Fix: true})
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Steps) != 1 || result.Steps[0].Name != "b" {
		t.Fatalf("expected only step 'b', got %v", result.Steps)
	}
}

func TestStepIf_ContextChangedFiles(t *testing.T) {
	r := reg(&passingTool{name: "a"})
	wf := workflowfx.Create("wf").On("push").
		Step("a", workflowfx.StepOpts{"if": `len(changedFiles) > 0`}).
		MustBuild()

	// with changed files
	result, err := workflowfx.RunWorkflow(context.Background(), wf, r, &workflowfx.RunOptions{
		ChangedFiles: []string{"main.go"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Steps) != 1 {
		t.Fatal("expected step to run when changedFiles non-empty")
	}

	// without changed files
	result2, err := workflowfx.RunWorkflow(context.Background(), wf, r, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(result2.Steps) != 0 {
		t.Fatal("expected step to be skipped when changedFiles is nil/empty")
	}
}

func TestStepIf_ContextVars(t *testing.T) {
	r := reg(&passingTool{name: "a"})
	wf := workflowfx.Create("wf").On("push").
		Vars(map[string]any{"env": "prod"}).
		Step("a", workflowfx.StepOpts{"if": `vars["env"] == "prod"`}).
		MustBuild()

	result, err := workflowfx.RunWorkflow(context.Background(), wf, r, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Steps) != 1 {
		t.Fatal("expected step to run when vars[env]==prod")
	}
}

func TestStepIf_ContextEvent(t *testing.T) {
	r := reg(&passingTool{name: "a"})
	wf := workflowfx.Create("wf").On("precommit").
		Step("a", workflowfx.StepOpts{"if": `event == "precommit"`}).
		MustBuild()

	result, err := workflowfx.RunWorkflow(context.Background(), wf, r, &workflowfx.RunOptions{Event: "precommit"})
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Steps) != 1 {
		t.Fatal("expected step to run when event matches")
	}
}

func TestStepIf_ContextPrev(t *testing.T) {
	// first step always runs (prev==nil), second step runs only if prev.Passed
	r := reg(&passingTool{name: "first"}, &passingTool{name: "second"})
	wf := workflowfx.Create("wf").On("push").
		Step("first").
		Step("second", workflowfx.StepOpts{"if": "prev != nil && prev.Passed"}).
		MustBuild()

	result, err := workflowfx.RunWorkflow(context.Background(), wf, r, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Steps) != 2 {
		t.Fatalf("expected both steps to run, got %d", len(result.Steps))
	}
}

func TestStepIf_PrevNilOnFirstStep(t *testing.T) {
	// Verify prev==nil on first step (predicate "prev == nil" must be true)
	r := reg(&passingTool{name: "a"})
	wf := workflowfx.Create("wf").On("push").
		Step("a", workflowfx.StepOpts{"if": "prev == nil"}).
		MustBuild()

	result, err := workflowfx.RunWorkflow(context.Background(), wf, r, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Steps) != 1 {
		t.Fatal("prev must be nil before first step runs")
	}
}

func TestStepIf_SyntaxError_ReturnsError(t *testing.T) {
	r := reg(&passingTool{name: "a"})
	wf := workflowfx.Create("wf").On("push").
		Step("a", workflowfx.StepOpts{"if": "((( invalid expr"}).
		MustBuild()

	_, err := workflowfx.RunWorkflow(context.Background(), wf, r, nil)
	if err == nil {
		t.Fatal("expected error for invalid if-expression")
	}
}

func TestStepIf_NonBoolExpr_ReturnsError(t *testing.T) {
	r := reg(&passingTool{name: "a"})
	wf := workflowfx.Create("wf").On("push").
		Step("a", workflowfx.StepOpts{"if": `"not a bool"`}).
		MustBuild()

	_, err := workflowfx.RunWorkflow(context.Background(), wf, r, nil)
	if err == nil {
		t.Fatal("expected error when if-expression returns non-bool")
	}
}

// ─── builder: If and Loop extraction ─────────────────────────────────────────

func TestBuilder_StepIf_Extracted(t *testing.T) {
	wf := workflowfx.Create("wf").On("push").
		Step("a", workflowfx.StepOpts{"if": "fix"}).
		MustBuild()
	if wf.Steps[0].If != "fix" {
		t.Fatalf("expected If='fix', got %q", wf.Steps[0].If)
	}
	if _, present := wf.Steps[0].Options["if"]; present {
		t.Fatal("'if' must not remain in Options after extraction")
	}
}

func TestBuilder_StepLoop_Extracted(t *testing.T) {
	lc := &workflowfx.LoopConfig{Over: "vars[\"items\"]", As: "item", AsIndex: "idx"}
	wf := workflowfx.Create("wf").On("push").
		Step("a", workflowfx.StepOpts{"loop": lc}).
		MustBuild()
	if wf.Steps[0].Loop == nil {
		t.Fatal("expected Loop to be set")
	}
	if wf.Steps[0].Loop.As != "item" || wf.Steps[0].Loop.AsIndex != "idx" {
		t.Fatalf("unexpected Loop: %+v", wf.Steps[0].Loop)
	}
	if _, present := wf.Steps[0].Options["loop"]; present {
		t.Fatal("'loop' must not remain in Options after extraction")
	}
}

func TestBuilder_Vars_SetInDefinition(t *testing.T) {
	vars := map[string]any{"tier": "gold"}
	wf := workflowfx.Create("wf").On("push").Step("a").Vars(vars).MustBuild()
	if wf.Variables == nil || wf.Variables["tier"] != "gold" {
		t.Fatalf("expected Variables[tier]=gold, got %v", wf.Variables)
	}
}

// ─── Loop ─────────────────────────────────────────────────────────────────────

func TestLoop_Basic_ThreeIterations(t *testing.T) {
	cap := &captureTool{name: "printer"}
	r := reg(cap)
	lc := &workflowfx.LoopConfig{Over: "vars[\"items\"]", As: "item"}
	wf := workflowfx.Create("wf").On("push").
		Vars(map[string]any{"items": []any{"x", "y", "z"}}).
		Step("printer", workflowfx.StepOpts{"loop": lc}).
		MustBuild()

	result, err := workflowfx.RunWorkflow(context.Background(), wf, r, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Steps) != 3 {
		t.Fatalf("expected 3 loop iterations, got %d", len(result.Steps))
	}
}

func TestLoop_As_InjectedIntoOptions(t *testing.T) {
	cap := &captureTool{name: "printer"}
	r := reg(cap)
	lc := &workflowfx.LoopConfig{Over: `["alpha"]`, As: "item"}
	wf := workflowfx.Create("wf").On("push").
		Step("printer", workflowfx.StepOpts{"loop": lc}).
		MustBuild()

	_, err := workflowfx.RunWorkflow(context.Background(), wf, r, nil)
	if err != nil {
		t.Fatal(err)
	}
	if cap.captured["item"] != "alpha" {
		t.Fatalf("expected item='alpha', got %v", cap.captured["item"])
	}
}

func TestLoop_AsIndex_Injected(t *testing.T) {
	cap := &captureTool{name: "printer"}
	r := reg(cap)
	lc := &workflowfx.LoopConfig{Over: `["a", "b"]`, As: "item", AsIndex: "idx"}
	wf := workflowfx.Create("wf").On("push").
		Step("printer", workflowfx.StepOpts{"loop": lc}).
		MustBuild()

	result, err := workflowfx.RunWorkflow(context.Background(), wf, r, nil)
	if err != nil {
		t.Fatal(err)
	}
	// Last captured is index 1 (second iteration)
	if len(result.Steps) != 2 {
		t.Fatalf("expected 2 steps, got %d", len(result.Steps))
	}
	if cap.captured["idx"] != 1 {
		t.Fatalf("expected idx=1 on last iteration, got %v", cap.captured["idx"])
	}
}

func TestLoop_EmptySlice_ZeroIterations(t *testing.T) {
	r := reg(&passingTool{name: "a"})
	lc := &workflowfx.LoopConfig{Over: "[]", As: "item"}
	wf := workflowfx.Create("wf").On("push").
		Step("a", workflowfx.StepOpts{"loop": lc}).
		MustBuild()

	result, err := workflowfx.RunWorkflow(context.Background(), wf, r, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Steps) != 0 {
		t.Fatalf("expected 0 steps for empty loop, got %d", len(result.Steps))
	}
}

func TestLoop_OverSyntaxError_ReturnsError(t *testing.T) {
	r := reg(&passingTool{name: "a"})
	lc := &workflowfx.LoopConfig{Over: "((( invalid", As: "item"}
	wf := workflowfx.Create("wf").On("push").
		Step("a", workflowfx.StepOpts{"loop": lc}).
		MustBuild()

	_, err := workflowfx.RunWorkflow(context.Background(), wf, r, nil)
	if err == nil {
		t.Fatal("expected error for invalid loop.over expression")
	}
}

// ─── NextSteps ────────────────────────────────────────────────────────────────

// nextStepsTool returns NextSteps on its first call, then acts as a passthrough.
type nextStepsTool struct {
	name  string
	extra []workflowfx.StepConfig
	calls int
}

func (t *nextStepsTool) Name() string        { return t.name }
func (t *nextStepsTool) Description() string { return "injects NextSteps" }
func (t *nextStepsTool) Run(_ context.Context, _ map[string]any) (*workflowfx.WorkflowToolResult, error) {
	t.calls++
	var next []workflowfx.StepConfig
	if t.calls == 1 {
		next = t.extra
	}
	return &workflowfx.WorkflowToolResult{Name: t.name, Passed: true, NextSteps: next}, nil
}

func TestNextSteps_PrependedBeforeRemainingQueue(t *testing.T) {
	var order []string
	injector := &nextStepsTool{
		name: "injector",
		extra: []workflowfx.StepConfig{
			{Name: "injected", Options: map[string]any{}},
		},
	}
	r := reg(injector, &passingTool{name: "injected"}, &passingTool{name: "after"})
	wf := workflowfx.Create("wf").On("push").Step("injector").Step("after").MustBuild()

	_, err := workflowfx.RunWorkflow(context.Background(), wf, r, &workflowfx.RunOptions{
		OnStepEnd: func(name string, _ workflowfx.StepResult) { order = append(order, name) },
	})
	if err != nil {
		t.Fatal(err)
	}
	// injector runs, then injected (prepended), then after
	want := []string{"injector", "injected", "after"}
	if len(order) != 3 {
		t.Fatalf("expected order %v, got %v", want, order)
	}
	for i, n := range want {
		if order[i] != n {
			t.Fatalf("step[%d]: want %q, got %q", i, n, order[i])
		}
	}
}
