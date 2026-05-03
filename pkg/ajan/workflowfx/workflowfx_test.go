// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package workflowfx_test

import (
	"context"
	"errors"
	"sync/atomic"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/workflowfx"
)

// ─── test helpers ─────────────────────────────────────────────────────────────

type passingTool struct{ name string }

func (t *passingTool) Name() string        { return t.name }
func (t *passingTool) Description() string { return "always passes" }
func (t *passingTool) Run(_ context.Context, _ map[string]any) (*workflowfx.WorkflowToolResult, error) {
	return &workflowfx.WorkflowToolResult{Name: t.name, Passed: true}, nil
}

type failingTool struct{ name string }

func (t *failingTool) Name() string        { return t.name }
func (t *failingTool) Description() string { return "always fails" }
func (t *failingTool) Run(_ context.Context, _ map[string]any) (*workflowfx.WorkflowToolResult, error) {
	return &workflowfx.WorkflowToolResult{
		Name:   t.name,
		Passed: false,
		Issues: []workflowfx.WorkflowIssue{{Message: "test failure"}},
	}, nil
}

type throwingTool struct{ name string }

func (t *throwingTool) Name() string        { return t.name }
func (t *throwingTool) Description() string { return "always errors" }
func (t *throwingTool) Run(_ context.Context, _ map[string]any) (*workflowfx.WorkflowToolResult, error) {
	return nil, errors.New("tool error")
}

type mutatingTool struct{ name string }

func (t *mutatingTool) Name() string        { return t.name }
func (t *mutatingTool) Description() string { return "produces mutations" }
func (t *mutatingTool) Run(_ context.Context, _ map[string]any) (*workflowfx.WorkflowToolResult, error) {
	return &workflowfx.WorkflowToolResult{
		Name:   t.name,
		Passed: true,
		Mutations: []workflowfx.WorkflowFileMutation{
			{Path: "file.txt", OldContent: "old", NewContent: "new"},
		},
	}, nil
}

type slowTool struct {
	name  string
	delay time.Duration
}

func (t *slowTool) Name() string        { return t.name }
func (t *slowTool) Description() string { return "sleeps for delay" }
func (t *slowTool) Run(ctx context.Context, _ map[string]any) (*workflowfx.WorkflowToolResult, error) {
	select {
	case <-time.After(t.delay):
		return &workflowfx.WorkflowToolResult{Name: t.name, Passed: true}, nil
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

type captureTool struct {
	name     string
	captured map[string]any
}

func (t *captureTool) Name() string        { return t.name }
func (t *captureTool) Description() string { return "captures options map" }
func (t *captureTool) Run(_ context.Context, opts map[string]any) (*workflowfx.WorkflowToolResult, error) {
	t.captured = opts
	return &workflowfx.WorkflowToolResult{Name: t.name, Passed: true}, nil
}

func reg(tools ...workflowfx.WorkflowTool) *workflowfx.Registry {
	r := workflowfx.NewRegistry()
	for _, tool := range tools {
		r.Register(tool)
	}
	return r
}

// ─── builder: contract #14 #15 ─────────────────────────────────────────────────

func TestBuilder_IDRequired(t *testing.T) {
	_, err := workflowfx.Create("").On("push").Step("tool").Build()
	if err == nil {
		t.Fatal("expected error for empty id")
	}
}

func TestBuilder_OnRequired(t *testing.T) {
	_, err := workflowfx.Create("wf").Step("tool").Build()
	if err == nil {
		t.Fatal("expected error when no events set")
	}
}

func TestBuilder_StepsOrIncludesRequired(t *testing.T) {
	_, err := workflowfx.Create("wf").On("push").Build()
	if err == nil {
		t.Fatal("expected error when neither steps nor includes present")
	}
}

// ─── builder: contract #14 step order ─────────────────────────────────────────

func TestBuilder_StepOrder(t *testing.T) {
	wf := workflowfx.Create("wf").On("push").Step("a").Step("b").Step("c").MustBuild()
	want := []string{"a", "b", "c"}
	for i, s := range wf.Steps {
		if s.Name != want[i] {
			t.Fatalf("step[%d]: want %q, got %q", i, want[i], s.Name)
		}
	}
}

// ─── builder: contract #14 engine directive extraction ────────────────────────

func TestBuilder_TimeoutExtraction_Duration(t *testing.T) {
	wf := workflowfx.Create("wf").On("push").
		Step("a", workflowfx.StepOpts{"timeout": 5 * time.Second}).
		MustBuild()
	if wf.Steps[0].Timeout != 5*time.Second {
		t.Fatalf("expected Timeout=5s, got %v", wf.Steps[0].Timeout)
	}
	if _, present := wf.Steps[0].Options["timeout"]; present {
		t.Fatal("timeout must be removed from Options after extraction")
	}
}

func TestBuilder_TimeoutExtraction_Int(t *testing.T) {
	wf := workflowfx.Create("wf").On("push").
		Step("a", workflowfx.StepOpts{"timeout": 10}).
		MustBuild()
	if wf.Steps[0].Timeout != 10*time.Second {
		t.Fatalf("expected Timeout=10s, got %v", wf.Steps[0].Timeout)
	}
}

func TestBuilder_ContinueOnErrorExtraction(t *testing.T) {
	wf := workflowfx.Create("wf").On("push").
		Step("a", workflowfx.StepOpts{"continueOnError": true}).
		MustBuild()
	if !wf.Steps[0].ContinueOnError {
		t.Fatal("expected ContinueOnError=true")
	}
	if _, present := wf.Steps[0].Options["continueOnError"]; present {
		t.Fatal("continueOnError must be removed from Options after extraction")
	}
}

// ─── registry: contract #13 #19 ───────────────────────────────────────────────

func TestRegistry_CaseSensitive(t *testing.T) {
	r := workflowfx.NewRegistry()
	r.Register(&passingTool{name: "Tool"})
	r.Register(&passingTool{name: "tool"})

	_, okUpper := r.Get("Tool")
	_, okLower := r.Get("tool")
	_, okMissing := r.Get("TOOL")

	if !okUpper || !okLower || okMissing {
		t.Fatalf("case-sensitive: upper=%v lower=%v TOOL(absent)=%v", okUpper, okLower, okMissing)
	}
}

func TestRegistry_Names_ReturnsSorted(t *testing.T) {
	r := workflowfx.NewRegistry()
	r.Register(&passingTool{name: "zebra"})
	r.Register(&passingTool{name: "alpha"})
	r.Register(&passingTool{name: "mango"})

	names := r.Names()
	if len(names) != 3 || names[0] != "alpha" || names[1] != "mango" || names[2] != "zebra" {
		t.Fatalf("expected [alpha mango zebra], got %v", names)
	}
}

func TestRegistry_GetAll_ReturnsAllRegistered(t *testing.T) {
	r := workflowfx.NewRegistry()
	r.Register(&passingTool{name: "x"})
	r.Register(&passingTool{name: "y"})

	names := r.Names()
	if len(names) != 2 {
		t.Fatalf("expected 2 registered tools, got %d", len(names))
	}
}

// ─── ResolveIncludes: contract #8 #9 ──────────────────────────────────────────

func TestResolveIncludes_Prepend(t *testing.T) {
	base := &workflowfx.WorkflowDefinition{
		ID: "base", On: []string{"push"},
		Steps: []workflowfx.StepConfig{{Name: "b1"}, {Name: "b2"}},
	}
	child := &workflowfx.WorkflowDefinition{
		ID: "child", On: []string{"push"},
		Steps:    []workflowfx.StepConfig{{Name: "c1"}},
		Includes: []string{"base"},
	}
	all := []*workflowfx.WorkflowDefinition{base, child}

	resolved, err := workflowfx.ResolveIncludes(child, all)
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"b1", "b2", "c1"}
	if len(resolved.Steps) != len(want) {
		t.Fatalf("expected %d steps, got %d", len(want), len(resolved.Steps))
	}
	for i, name := range want {
		if resolved.Steps[i].Name != name {
			t.Fatalf("step[%d]: want %q, got %q", i, name, resolved.Steps[i].Name)
		}
	}
}

func TestResolveIncludes_Diamond(t *testing.T) {
	// A → B, C; B → D; C → D (diamond)
	d := &workflowfx.WorkflowDefinition{ID: "d", On: []string{"push"}, Steps: []workflowfx.StepConfig{{Name: "d1"}}}
	b := &workflowfx.WorkflowDefinition{ID: "b", On: []string{"push"}, Steps: []workflowfx.StepConfig{{Name: "b1"}}, Includes: []string{"d"}}
	c := &workflowfx.WorkflowDefinition{ID: "c", On: []string{"push"}, Steps: []workflowfx.StepConfig{{Name: "c1"}}, Includes: []string{"d"}}
	a := &workflowfx.WorkflowDefinition{ID: "a", On: []string{"push"}, Steps: []workflowfx.StepConfig{{Name: "a1"}}, Includes: []string{"b", "c"}}

	// diamond must not error; steps are: [d1 b1] + [d1 c1] + [a1] = 5
	resolved, err := workflowfx.ResolveIncludes(a, []*workflowfx.WorkflowDefinition{d, b, c, a})
	if err != nil {
		t.Fatalf("diamond includes must be allowed, got: %v", err)
	}
	if len(resolved.Steps) != 5 {
		t.Fatalf("expected 5 steps for diamond, got %d", len(resolved.Steps))
	}
}

func TestResolveIncludes_Cycle(t *testing.T) {
	a := &workflowfx.WorkflowDefinition{ID: "a", On: []string{"push"}, Steps: []workflowfx.StepConfig{{Name: "s"}}, Includes: []string{"b"}}
	b := &workflowfx.WorkflowDefinition{ID: "b", On: []string{"push"}, Steps: []workflowfx.StepConfig{{Name: "s"}}, Includes: []string{"a"}}

	_, err := workflowfx.ResolveIncludes(a, []*workflowfx.WorkflowDefinition{a, b})
	if !errors.Is(err, workflowfx.ErrCircularIncludes) {
		t.Fatalf("expected ErrCircularIncludes, got %v", err)
	}
}

func TestResolveIncludes_NotFound(t *testing.T) {
	wf := &workflowfx.WorkflowDefinition{
		ID: "wf", On: []string{"push"},
		Steps:    []workflowfx.StepConfig{{Name: "s"}},
		Includes: []string{"ghost"},
	}
	_, err := workflowfx.ResolveIncludes(wf, []*workflowfx.WorkflowDefinition{wf})
	if !errors.Is(err, workflowfx.ErrWorkflowNotFound) {
		t.Fatalf("expected ErrWorkflowNotFound, got %v", err)
	}
}

// ─── RunWorkflow: contract #7 sequential + onMutations ────────────────────────

func TestRun_SequentialExecution(t *testing.T) {
	var order []string
	r := reg(&passingTool{name: "a"}, &passingTool{name: "b"}, &passingTool{name: "c"})
	wf := workflowfx.Create("wf").On("push").Step("a").Step("b").Step("c").MustBuild()

	_, err := workflowfx.RunWorkflow(context.Background(), wf, r, &workflowfx.RunOptions{
		OnStepEnd: func(name string, _ workflowfx.StepResult) { order = append(order, name) },
	})
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"a", "b", "c"}
	for i, n := range want {
		if order[i] != n {
			t.Fatalf("step[%d]: want %q, got %q", i, n, order[i])
		}
	}
}

// ─── RunWorkflow: contract #18 OnStepEnd called per step ──────────────────────

func TestRun_OnStepEndCalled(t *testing.T) {
	var count int32
	r := reg(&passingTool{name: "t1"}, &passingTool{name: "t2"})
	wf := workflowfx.Create("wf").On("push").Step("t1").Step("t2").MustBuild()

	_, err := workflowfx.RunWorkflow(context.Background(), wf, r, &workflowfx.RunOptions{
		OnStepEnd: func(_ string, _ workflowfx.StepResult) { atomic.AddInt32(&count, 1) },
	})
	if err != nil {
		t.Fatal(err)
	}
	if atomic.LoadInt32(&count) != 2 {
		t.Fatalf("expected OnStepEnd called 2 times, got %d", count)
	}
}

// ─── RunWorkflow: contract #7 OnMutations between steps ───────────────────────

func TestRun_OnMutationsCalledBetweenSteps(t *testing.T) {
	var stepsDoneAtMutation int

	r := reg(&mutatingTool{name: "mutator"}, &passingTool{name: "next"})
	wf := workflowfx.Create("wf").On("push").Step("mutator").Step("next").MustBuild()

	var stepsDone int
	_, err := workflowfx.RunWorkflow(context.Background(), wf, r, &workflowfx.RunOptions{
		OnStepEnd: func(_ string, _ workflowfx.StepResult) { stepsDone++ },
		OnMutations: func(_ []workflowfx.WorkflowFileMutation) error {
			stepsDoneAtMutation = stepsDone
			return nil
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	// OnMutations fires after step 1 completes (stepsDone=1) but before step 2 runs
	if stepsDoneAtMutation != 1 {
		t.Fatalf("OnMutations must fire between steps; stepsDone was %d (want 1)", stepsDoneAtMutation)
	}
}

func TestRun_OnMutationsError_Aborts(t *testing.T) {
	var secondStepRan bool
	r := reg(&mutatingTool{name: "mutator"}, &passingTool{name: "shouldNotRun"})
	wf := workflowfx.Create("wf").On("push").Step("mutator").Step("shouldNotRun").MustBuild()

	_, err := workflowfx.RunWorkflow(context.Background(), wf, r, &workflowfx.RunOptions{
		OnMutations: func(_ []workflowfx.WorkflowFileMutation) error {
			return errors.New("disk full")
		},
		OnStepEnd: func(name string, _ workflowfx.StepResult) {
			if name == "shouldNotRun" {
				secondStepRan = true
			}
		},
	})
	if err == nil {
		t.Fatal("expected error when OnMutations returns error")
	}
	if secondStepRan {
		t.Fatal("second step must not run after OnMutations error")
	}
}

// ─── RunWorkflow: contract #6 unknown tool ────────────────────────────────────

func TestRun_UnknownTool_ReturnsError(t *testing.T) {
	r := workflowfx.NewRegistry() // empty registry
	wf := workflowfx.Create("wf").On("push").Step("ghost").MustBuild()

	_, err := workflowfx.RunWorkflow(context.Background(), wf, r, nil)
	if err == nil {
		t.Fatal("expected error for unknown tool")
	}
	if !errors.Is(err, workflowfx.ErrToolNotFound) {
		t.Fatalf("expected ErrToolNotFound in error chain, got %v", err)
	}
}

// ─── RunWorkflow: contract #10 ContinueOnError ────────────────────────────────

func TestRun_ContinueOnError_CapturesAsFailedStep(t *testing.T) {
	r := reg(&throwingTool{name: "thrower"}, &passingTool{name: "after"})
	wf := workflowfx.Create("wf").On("push").
		Step("thrower", workflowfx.StepOpts{"continueOnError": true}).
		Step("after").
		MustBuild()

	result, err := workflowfx.RunWorkflow(context.Background(), wf, r, nil)
	if err != nil {
		t.Fatalf("ContinueOnError must not propagate tool error: %v", err)
	}
	if len(result.Steps) != 2 {
		t.Fatalf("expected 2 step results, got %d", len(result.Steps))
	}
	if result.Steps[0].Passed {
		t.Fatal("erroring step must be marked Passed=false")
	}
	if !result.Steps[1].Passed {
		t.Fatal("subsequent step must still pass")
	}
	if result.Passed {
		t.Fatal("workflow Passed must be false when any step fails")
	}
}

// ─── RunWorkflow: contract #10 per-step timeout overrides default ──────────────

func TestRun_StepTimeout_PerStepOverride(t *testing.T) {
	// slow tool sleeps 200ms; per-step timeout = 5s; default = 10ms
	// Without per-step override, 10ms default would fire first.
	slow := &slowTool{name: "slow", delay: 200 * time.Millisecond}
	r := reg(slow)
	wf := workflowfx.Create("wf").On("push").
		Step("slow", workflowfx.StepOpts{"timeout": 5}).
		MustBuild()

	_, err := workflowfx.RunWorkflow(context.Background(), wf, r, &workflowfx.RunOptions{
		DefaultTimeout: 10 * time.Millisecond,
	})
	if err != nil {
		t.Fatalf("per-step timeout (5s) must override short default (10ms): %v", err)
	}
}

func TestRun_DefaultTimeout_Fallback(t *testing.T) {
	// slow tool sleeps 200ms; no per-step timeout; default = 10ms → should timeout
	slow := &slowTool{name: "slow", delay: 200 * time.Millisecond}
	r := reg(slow)
	wf := workflowfx.Create("wf").On("push").Step("slow").MustBuild()

	_, err := workflowfx.RunWorkflow(context.Background(), wf, r, &workflowfx.RunOptions{
		DefaultTimeout: 10 * time.Millisecond,
	})
	if err == nil {
		t.Fatal("expected timeout error with 10ms default and 200ms tool")
	}
	if !errors.Is(err, workflowfx.ErrWorkflow) {
		t.Fatalf("expected ErrWorkflow wrapping, got %v", err)
	}
}

func TestRun_DefaultTimeout_SixtySecondsDefault(t *testing.T) {
	if workflowfx.DefaultStepTimeout != 60*time.Second {
		t.Fatalf("DefaultStepTimeout must be 60s, got %v", workflowfx.DefaultStepTimeout)
	}
}

// ─── RunWorkflow: contract #2 #3 #4 #5 result shape ──────────────────────────

func TestRun_ResultFields_PassedTrue(t *testing.T) {
	r := reg(&passingTool{name: "a"}, &passingTool{name: "b"})
	wf := workflowfx.Create("my-workflow").On("push").Step("a").Step("b").MustBuild()

	result, err := workflowfx.RunWorkflow(context.Background(), wf, r, nil)
	if err != nil {
		t.Fatal(err)
	}
	if result.ID != "my-workflow" {
		t.Fatalf("expected ID='my-workflow', got %q", result.ID)
	}
	if !result.Passed {
		t.Fatal("expected Passed=true when all steps pass")
	}
	if result.TotalDurationMs < 0 {
		t.Fatalf("TotalDurationMs must be >= 0, got %f", result.TotalDurationMs)
	}
}

func TestRun_ResultFields_PassedFalse(t *testing.T) {
	r := reg(&failingTool{name: "a"})
	wf := workflowfx.Create("wf").On("push").Step("a").MustBuild()

	result, err := workflowfx.RunWorkflow(context.Background(), wf, r, nil)
	if err != nil {
		t.Fatal(err)
	}
	if result.Passed {
		t.Fatal("expected Passed=false when a step returns Passed=false")
	}
}

func TestRun_StepResult_DurationMs_NonNegative(t *testing.T) {
	r := reg(&passingTool{name: "a"})
	wf := workflowfx.Create("wf").On("push").Step("a").MustBuild()

	result, err := workflowfx.RunWorkflow(context.Background(), wf, r, nil)
	if err != nil {
		t.Fatal(err)
	}
	if result.Steps[0].DurationMs < 0 {
		t.Fatalf("StepResult.DurationMs must be >= 0, got %f", result.Steps[0].DurationMs)
	}
}

// ─── buildStepOptions: contract #17 ───────────────────────────────────────────

func TestBuildStepOptions_InjectsRoot(t *testing.T) {
	cap := &captureTool{name: "cap"}
	r := reg(cap)
	wf := workflowfx.Create("wf").On("push").Step("cap").MustBuild()

	_, err := workflowfx.RunWorkflow(context.Background(), wf, r, &workflowfx.RunOptions{Root: "/project"})
	if err != nil {
		t.Fatal(err)
	}
	if cap.captured["root"] != "/project" {
		t.Fatalf("expected root='/project', got %v", cap.captured["root"])
	}
}

func TestBuildStepOptions_InjectsFix(t *testing.T) {
	cap := &captureTool{name: "cap"}
	r := reg(cap)
	wf := workflowfx.Create("wf").On("push").Step("cap").MustBuild()

	_, err := workflowfx.RunWorkflow(context.Background(), wf, r, &workflowfx.RunOptions{Fix: true})
	if err != nil {
		t.Fatal(err)
	}
	if cap.captured["fix"] != true {
		t.Fatalf("expected fix=true, got %v", cap.captured["fix"])
	}
}

func TestBuildStepOptions_InjectsArgs(t *testing.T) {
	cap := &captureTool{name: "cap"}
	r := reg(cap)
	wf := workflowfx.Create("wf").On("push").Step("cap").MustBuild()

	_, err := workflowfx.RunWorkflow(context.Background(), wf, r, &workflowfx.RunOptions{Args: []string{"--flag", "val"}})
	if err != nil {
		t.Fatal(err)
	}
	args, ok := cap.captured["_args"].([]string)
	if !ok || len(args) != 2 || args[0] != "--flag" || args[1] != "val" {
		t.Fatalf("expected _args=[--flag val], got %v", cap.captured["_args"])
	}
}

func TestBuildStepOptions_InjectsChangedFiles(t *testing.T) {
	cap := &captureTool{name: "cap"}
	r := reg(cap)
	wf := workflowfx.Create("wf").On("push").Step("cap").MustBuild()

	_, err := workflowfx.RunWorkflow(context.Background(), wf, r, &workflowfx.RunOptions{
		ChangedFiles: []string{"a.go", "b.go"},
	})
	if err != nil {
		t.Fatal(err)
	}
	cf, ok := cap.captured["_changedFiles"].([]string)
	if !ok || len(cf) != 2 || cf[0] != "a.go" {
		t.Fatalf("expected _changedFiles=[a.go b.go], got %v", cap.captured["_changedFiles"])
	}
}

func TestBuildStepOptions_NilChangedFiles_NotInjected(t *testing.T) {
	cap := &captureTool{name: "cap"}
	r := reg(cap)
	wf := workflowfx.Create("wf").On("push").Step("cap").MustBuild()

	_, err := workflowfx.RunWorkflow(context.Background(), wf, r, &workflowfx.RunOptions{Root: "."})
	if err != nil {
		t.Fatal(err)
	}
	if _, present := cap.captured["_changedFiles"]; present {
		t.Fatal("_changedFiles must not be injected when RunOptions.ChangedFiles is nil")
	}
}

// ─── RunWorkflow: contract #1 WorkflowTool duck shape ─────────────────────────

func TestWorkflowTool_DuckShape(t *testing.T) {
	// All three helper types fully satisfy WorkflowTool — compile-time check via assignment.
	var _ workflowfx.WorkflowTool = &passingTool{}
	var _ workflowfx.WorkflowTool = &failingTool{}
	var _ workflowfx.WorkflowTool = &throwingTool{}
	var _ workflowfx.WorkflowTool = &mutatingTool{}
	var _ workflowfx.WorkflowTool = &captureTool{}
}

// ─── RunWorkflow: Only filter ──────────────────────────────────────────────────

func TestRun_Only_SkipsOtherSteps(t *testing.T) {
	var ran []string
	r := reg(&passingTool{name: "a"}, &passingTool{name: "b"}, &passingTool{name: "c"})
	wf := workflowfx.Create("wf").On("push").Step("a").Step("b").Step("c").MustBuild()

	_, err := workflowfx.RunWorkflow(context.Background(), wf, r, &workflowfx.RunOptions{
		Only:      "b",
		OnStepEnd: func(name string, _ workflowfx.StepResult) { ran = append(ran, name) },
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(ran) != 1 || ran[0] != "b" {
		t.Fatalf("expected only [b] to run, got %v", ran)
	}
}

// ─── RunWorkflow: OnStepStart callback ────────────────────────────────────────

func TestRun_OnStepStart_Called(t *testing.T) {
	var started []string
	r := reg(&passingTool{name: "x"}, &passingTool{name: "y"})
	wf := workflowfx.Create("wf").On("push").Step("x").Step("y").MustBuild()

	_, err := workflowfx.RunWorkflow(context.Background(), wf, r, &workflowfx.RunOptions{
		OnStepStart: func(name string) { started = append(started, name) },
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(started) != 2 || started[0] != "x" || started[1] != "y" {
		t.Fatalf("expected OnStepStart [x y], got %v", started)
	}
}

// ─── RunWorkflow: nil tool result treated as passing ──────────────────────────

type nilResultTool struct{ name string }

func (t *nilResultTool) Name() string        { return t.name }
func (t *nilResultTool) Description() string { return "returns nil result" }
func (t *nilResultTool) Run(_ context.Context, _ map[string]any) (*workflowfx.WorkflowToolResult, error) {
	return nil, nil // engine must treat nil result as Passed=true
}

func TestRun_NilToolResult_TreatedAsPassed(t *testing.T) {
	r := reg(&nilResultTool{name: "nil-tool"})
	wf := workflowfx.Create("wf").On("push").Step("nil-tool").MustBuild()

	result, err := workflowfx.RunWorkflow(context.Background(), wf, r, nil)
	if err != nil {
		t.Fatal(err)
	}
	if !result.Passed {
		t.Fatal("nil tool result must be treated as Passed=true")
	}
}

// ─── RunByEvent ───────────────────────────────────────────────────────────────

func TestRunByEvent_MatchingWorkflows(t *testing.T) {
	r := reg(&passingTool{name: "lint"}, &passingTool{name: "test"})
	workflows := []*workflowfx.WorkflowDefinition{
		workflowfx.Create("ci").On("precommit").Step("lint").MustBuild(),
		workflowfx.Create("full").On("prepush").Step("test").MustBuild(),
	}

	results, err := workflowfx.RunByEvent(context.Background(), "precommit", workflows, r, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 1 || results[0].ID != "ci" {
		t.Fatalf("expected 1 result for 'ci', got %v", results)
	}
}

func TestRunByEvent_NoMatchReturnsError(t *testing.T) {
	r := reg(&passingTool{name: "lint"})
	workflows := []*workflowfx.WorkflowDefinition{
		workflowfx.Create("ci").On("precommit").Step("lint").MustBuild(),
	}

	_, err := workflowfx.RunByEvent(context.Background(), "nonexistent", workflows, r, nil)
	if !errors.Is(err, workflowfx.ErrNoMatchingEvent) {
		t.Fatalf("expected ErrNoMatchingEvent, got %v", err)
	}
}

// ─── RunWorkflowWithConfig ─────────────────────────────────────────────────────

func TestRunWorkflowWithConfig_ByID(t *testing.T) {
	r := reg(&passingTool{name: "lint"})
	cfg := &workflowfx.WorkflowsConfig{
		Workflows: []*workflowfx.WorkflowDefinition{
			workflowfx.Create("ci").On("push").Step("lint").MustBuild(),
		},
	}

	result, err := workflowfx.RunWorkflowWithConfig(context.Background(), "ci", cfg, r, nil)
	if err != nil {
		t.Fatal(err)
	}
	if result.ID != "ci" || !result.Passed {
		t.Fatalf("unexpected result: %+v", result)
	}
}

func TestRunWorkflowWithConfig_NotFoundReturnsError(t *testing.T) {
	r := workflowfx.NewRegistry()
	cfg := &workflowfx.WorkflowsConfig{
		Workflows: []*workflowfx.WorkflowDefinition{
			workflowfx.Create("ci").On("push").Step("lint").MustBuild(),
		},
	}

	_, err := workflowfx.RunWorkflowWithConfig(context.Background(), "ghost", cfg, r, nil)
	if !errors.Is(err, workflowfx.ErrWorkflowNotFound) {
		t.Fatalf("expected ErrWorkflowNotFound, got %v", err)
	}
}

// ─── registry: Unregister + MustGet ───────────────────────────────────────────

func TestRegistry_Unregister(t *testing.T) {
	r := workflowfx.NewRegistry()
	r.Register(&passingTool{name: "tool"})
	r.Unregister("tool")

	if _, ok := r.Get("tool"); ok {
		t.Fatal("expected tool to be absent after Unregister")
	}
}

func TestRegistry_MustGet_Panics(t *testing.T) {
	r := workflowfx.NewRegistry()

	defer func() {
		if recover() == nil {
			t.Fatal("expected MustGet to panic for missing tool")
		}
	}()
	r.MustGet("missing")
}

// ─── error types: Error() string ──────────────────────────────────────────────

func TestWorkflowError_ErrorString(t *testing.T) {
	r := workflowfx.NewRegistry()
	wf := workflowfx.Create("wf").On("push").Step("ghost").MustBuild()

	_, err := workflowfx.RunWorkflow(context.Background(), wf, r, nil)
	if err == nil {
		t.Fatal("expected error")
	}
	// WorkflowError.Error() must return a non-empty string
	if err.Error() == "" {
		t.Fatal("WorkflowError.Error() must not be empty")
	}
}

func TestWorkflowNotFoundError_ErrorString(t *testing.T) {
	wf := &workflowfx.WorkflowDefinition{
		ID: "wf", On: []string{"push"},
		Steps:    []workflowfx.StepConfig{{Name: "s"}},
		Includes: []string{"ghost"},
	}
	_, err := workflowfx.ResolveIncludes(wf, []*workflowfx.WorkflowDefinition{wf})
	if err == nil {
		t.Fatal("expected error")
	}
	if err.Error() == "" {
		t.Fatal("WorkflowNotFoundError.Error() must not be empty")
	}
}
