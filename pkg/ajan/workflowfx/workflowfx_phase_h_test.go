// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
// Phase H tests: steps env, interpolation, variable-set, bypass, input schema validation.

package workflowfx_test

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/eser/stack/pkg/ajan/workflowfx"
)

// ─── helpers ──────────────────────────────────────────────────────────────────

// statsTool always passes and returns a fixed Stats map.
type statsTool struct {
	name  string
	stats map[string]any
}

func (t *statsTool) Name() string        { return t.name }
func (t *statsTool) Description() string { return "returns fixed stats" }
func (t *statsTool) Run(_ context.Context, _ map[string]any) (*workflowfx.WorkflowToolResult, error) {
	return &workflowfx.WorkflowToolResult{
		Name:   t.name,
		Passed: true,
		Stats:  t.stats,
	}, nil
}

// callCountTool counts how many times Run is called.
type callCountTool struct {
	name  string
	calls int
}

func (t *callCountTool) Name() string        { return t.name }
func (t *callCountTool) Description() string { return "counts calls" }
func (t *callCountTool) Run(_ context.Context, _ map[string]any) (*workflowfx.WorkflowToolResult, error) {
	t.calls++
	return &workflowfx.WorkflowToolResult{Name: t.name, Passed: true, Stats: map[string]any{}}, nil
}

// ─── Gap 1: steps env ─────────────────────────────────────────────────────────

func TestStepsEnv_EmptyBeforeFirstStep(t *testing.T) {
	t.Parallel()

	r := reg(&passingTool{name: "a"})
	wf := workflowfx.Create("wf").On("push").
		Step("a", workflowfx.StepOpts{"if": "len(steps) == 0"}).
		MustBuild()

	result, err := workflowfx.RunWorkflow(context.Background(), wf, r, nil)
	if err != nil {
		t.Fatal(err)
	}

	if len(result.Steps) != 1 {
		t.Fatalf("expected step to run when steps is empty at first step, got %d results", len(result.Steps))
	}
}

func TestStepsEnv_PrevStepStatsAccessible(t *testing.T) {
	t.Parallel()

	cap := &captureTool{name: "reader"}
	r := reg(
		&statsTool{name: "writer", stats: map[string]any{"count": 42}},
		cap,
	)

	wf := workflowfx.Create("wf").On("push").
		Step("writer").
		// The If expression accesses the stats of step 0 (0-based).
		Step("reader", workflowfx.StepOpts{"if": `steps[0]["stats"]["count"] == 42`}).
		MustBuild()

	result, err := workflowfx.RunWorkflow(context.Background(), wf, r, nil)
	if err != nil {
		t.Fatal(err)
	}

	if len(result.Steps) != 2 {
		t.Fatalf("expected both steps to run, got %d", len(result.Steps))
	}
}

func TestStepsEnv_PassedFlagAccessible(t *testing.T) {
	t.Parallel()

	r := reg(&passingTool{name: "a"}, &passingTool{name: "b"})
	wf := workflowfx.Create("wf").On("push").
		Step("a").
		Step("b", workflowfx.StepOpts{"if": "steps[0][\"passed\"] == true"}).
		MustBuild()

	result, err := workflowfx.RunWorkflow(context.Background(), wf, r, nil)
	if err != nil {
		t.Fatal(err)
	}

	if len(result.Steps) != 2 {
		t.Fatalf("expected both steps, got %d", len(result.Steps))
	}
}

func TestStepsEnv_LenGrowsPerStep(t *testing.T) {
	t.Parallel()

	r := reg(&passingTool{name: "a"}, &passingTool{name: "b"}, &passingTool{name: "c"})
	wf := workflowfx.Create("wf").On("push").
		Step("a").
		Step("b", workflowfx.StepOpts{"if": "len(steps) == 1"}).
		Step("c", workflowfx.StepOpts{"if": "len(steps) == 2"}).
		MustBuild()

	result, err := workflowfx.RunWorkflow(context.Background(), wf, r, nil)
	if err != nil {
		t.Fatal(err)
	}

	if len(result.Steps) != 3 {
		t.Fatalf("expected 3 steps, got %d", len(result.Steps))
	}
}

// ─── Gap 2: interpolation ─────────────────────────────────────────────────────

func TestInterpolate_FullExpression_PreservesType(t *testing.T) {
	t.Parallel()

	cap := &captureTool{name: "reader"}
	r := reg(
		&statsTool{name: "writer", stats: map[string]any{"count": 42}},
		cap,
	)

	// Full-value expression: the entire option value is ${{ }} — type preserved (int).
	wf := workflowfx.Create("wf").On("push").
		Step("writer").
		Step("reader", workflowfx.StepOpts{"n": `${{ steps[0]["stats"]["count"] }}`}).
		MustBuild()

	_, err := workflowfx.RunWorkflow(context.Background(), wf, r, nil)
	if err != nil {
		t.Fatal(err)
	}

	if cap.captured == nil {
		t.Fatal("captureTool never ran")
	}

	// The interpolated value should be the integer 42 (type preserved).
	if cap.captured["n"] != 42 {
		t.Fatalf("expected n=42 (int), got %T(%v)", cap.captured["n"], cap.captured["n"])
	}
}

func TestInterpolate_EmbeddedExpression_Stringified(t *testing.T) {
	t.Parallel()

	cap := &captureTool{name: "reader"}
	r := reg(
		&statsTool{name: "writer", stats: map[string]any{"count": 7}},
		cap,
	)

	wf := workflowfx.Create("wf").On("push").
		Step("writer").
		Step("reader", workflowfx.StepOpts{"msg": `value=${{ steps[0]["stats"]["count"] }}`}).
		MustBuild()

	_, err := workflowfx.RunWorkflow(context.Background(), wf, r, nil)
	if err != nil {
		t.Fatal(err)
	}

	if cap.captured["msg"] != "value=7" {
		t.Fatalf("expected msg='value=7', got %v", cap.captured["msg"])
	}
}

func TestInterpolate_VariableInterpolation(t *testing.T) {
	t.Parallel()

	cap := &captureTool{name: "consumer"}
	r := reg(cap)

	wf := workflowfx.Create("wf").On("push").
		Vars(map[string]any{"url": "https://example.com"}).
		Step("consumer", workflowfx.StepOpts{"endpoint": `${{ variables["url"] }}`}).
		MustBuild()

	_, err := workflowfx.RunWorkflow(context.Background(), wf, r, nil)
	if err != nil {
		t.Fatal(err)
	}

	if cap.captured["endpoint"] != "https://example.com" {
		t.Fatalf("expected endpoint='https://example.com', got %v", cap.captured["endpoint"])
	}
}

func TestInterpolate_NestedMapValue(t *testing.T) {
	t.Parallel()

	cap := &captureTool{name: "consumer"}
	r := reg(cap)

	wf := workflowfx.Create("wf").On("push").
		Vars(map[string]any{"host": "db.local"}).
		Step("consumer", workflowfx.StepOpts{
			"config": map[string]any{"dsn": `postgres://${{ variables["host"] }}/app`},
		}).
		MustBuild()

	_, err := workflowfx.RunWorkflow(context.Background(), wf, r, nil)
	if err != nil {
		t.Fatal(err)
	}

	cfg, ok := cap.captured["config"].(map[string]any)
	if !ok {
		t.Fatalf("expected config to be map[string]any, got %T", cap.captured["config"])
	}

	if cfg["dsn"] != "postgres://db.local/app" {
		t.Fatalf("expected dsn='postgres://db.local/app', got %v", cfg["dsn"])
	}
}

func TestInterpolate_Escape_PassesThroughLiteral(t *testing.T) {
	t.Parallel()

	cap := &captureTool{name: "consumer"}
	r := reg(cap)

	// \${{ should NOT be evaluated; it becomes literal ${{ in the output.
	wf := workflowfx.Create("wf").On("push").
		Step("consumer", workflowfx.StepOpts{"tmpl": `\${{ literally }}`}).
		MustBuild()

	_, err := workflowfx.RunWorkflow(context.Background(), wf, r, nil)
	if err != nil {
		t.Fatal(err)
	}

	if cap.captured["tmpl"] != "${{ literally }}" {
		t.Fatalf("expected literal '${{ literally }}', got %v", cap.captured["tmpl"])
	}
}

// ─── Gap 3: variable-set + mutable variables ──────────────────────────────────

func TestVariableSet_ValueVisibleToLaterStepIf(t *testing.T) {
	t.Parallel()

	r := reg(workflowfx.NewVariableSetTool(), &passingTool{name: "check"})

	wf := workflowfx.Create("wf").On("push").
		Step("variable-set", workflowfx.StepOpts{"name": "count", "value": 5}).
		Step("check", workflowfx.StepOpts{"if": `variables["count"] == 5`}).
		MustBuild()

	result, err := workflowfx.RunWorkflow(context.Background(), wf, r, nil)
	if err != nil {
		t.Fatal(err)
	}

	if len(result.Steps) != 2 {
		t.Fatalf("expected both steps to run, got %d", len(result.Steps))
	}
}

func TestVariableSet_ValueVisibleViaVarsAlias(t *testing.T) {
	t.Parallel()

	// "vars" is the backward-compat alias pointing to the same live scope.
	r := reg(workflowfx.NewVariableSetTool(), &passingTool{name: "check"})

	wf := workflowfx.Create("wf").On("push").
		Step("variable-set", workflowfx.StepOpts{"name": "mode", "value": "fast"}).
		Step("check", workflowfx.StepOpts{"if": `vars["mode"] == "fast"`}).
		MustBuild()

	result, err := workflowfx.RunWorkflow(context.Background(), wf, r, nil)
	if err != nil {
		t.Fatal(err)
	}

	if len(result.Steps) != 2 {
		t.Fatalf("expected both steps (vars alias works), got %d", len(result.Steps))
	}
}

func TestVariableSet_InterpolationSeesUpdatedValue(t *testing.T) {
	t.Parallel()

	cap := &captureTool{name: "reader"}
	r := reg(workflowfx.NewVariableSetTool(), cap)

	wf := workflowfx.Create("wf").On("push").
		Step("variable-set", workflowfx.StepOpts{"name": "greeting", "value": "hello"}).
		Step("reader", workflowfx.StepOpts{"msg": `${{ variables["greeting"] }}`}).
		MustBuild()

	_, err := workflowfx.RunWorkflow(context.Background(), wf, r, nil)
	if err != nil {
		t.Fatal(err)
	}

	if cap.captured["msg"] != "hello" {
		t.Fatalf("expected msg='hello', got %v", cap.captured["msg"])
	}
}

func TestVariableSet_NotVisibleToEarlierStep(t *testing.T) {
	t.Parallel()

	// Step 0 runs its If BEFORE variable-set (step 1) fires; so the variable is absent.
	r := reg(workflowfx.NewVariableSetTool(), &passingTool{name: "first"})

	wf := workflowfx.Create("wf").On("push").
		// If variables["x"] is set at step 0 time, we'd get 1 step; if not, 0 steps.
		Step("first", workflowfx.StepOpts{"if": `variables["x"] == nil`}).
		Step("variable-set", workflowfx.StepOpts{"name": "x", "value": 1}).
		MustBuild()

	result, err := workflowfx.RunWorkflow(context.Background(), wf, r, nil)
	if err != nil {
		t.Fatal(err)
	}

	// "first" should run (x is nil before variable-set fires) and variable-set should run.
	if len(result.Steps) != 2 {
		t.Fatalf("expected 2 steps, got %d — variable must not be visible before it is set", len(result.Steps))
	}
}

func TestVariableSet_LoopIterationUpdatesVariable(t *testing.T) {
	t.Parallel()

	// Three loop iterations each call variable-set with a static value.
	// After the loop, a fourth step reads the variable — proving it was set.
	r := reg(workflowfx.NewVariableSetTool(), &passingTool{name: "check"})

	wf := workflowfx.Create("wf").On("push").
		Vars(map[string]any{"items": []any{"a", "b", "c"}}).
		Step("variable-set", workflowfx.StepOpts{
			"loop":  &workflowfx.LoopConfig{Over: `vars["items"]`, As: "item"},
			"name":  "counter",
			"value": 42,
		}).
		Step("check", workflowfx.StepOpts{"if": `variables["counter"] == 42`}).
		MustBuild()

	result, err := workflowfx.RunWorkflow(context.Background(), wf, r, nil)
	if err != nil {
		t.Fatal(err)
	}

	// 3 loop iterations + 1 check step = 4 total steps.
	if len(result.Steps) != 4 {
		t.Fatalf("expected 4 steps (3 loop + 1 check), got %d", len(result.Steps))
	}

	if !result.Passed {
		t.Fatal("workflow should pass when counter variable is visible after loop")
	}
}

// ─── Gap 4: bypass ────────────────────────────────────────────────────────────

func TestBypass_ToolNotInvoked(t *testing.T) {
	t.Parallel()

	counter := &callCountTool{name: "counter"}
	r := reg(counter)

	wf := workflowfx.Create("wf").On("push").
		Step("counter", workflowfx.StepOpts{"bypass": true}).
		MustBuild()

	result, err := workflowfx.RunWorkflow(context.Background(), wf, r, nil)
	if err != nil {
		t.Fatal(err)
	}

	if counter.calls != 0 {
		t.Fatalf("expected tool never called (bypass), got %d calls", counter.calls)
	}

	if len(result.Steps) != 1 {
		t.Fatalf("expected 1 step result (bypass still appears), got %d", len(result.Steps))
	}

	if !result.Steps[0].Passed {
		t.Fatal("bypass step should pass")
	}
}

func TestBypass_CarriesPrevStats(t *testing.T) {
	t.Parallel()

	r := reg(
		&statsTool{name: "producer", stats: map[string]any{"bytes": 99}},
		&callCountTool{name: "sink"},
	)

	wf := workflowfx.Create("wf").On("push").
		Step("producer").
		Step("sink", workflowfx.StepOpts{"bypass": true}).
		MustBuild()

	result, err := workflowfx.RunWorkflow(context.Background(), wf, r, nil)
	if err != nil {
		t.Fatal(err)
	}

	if len(result.Steps) != 2 {
		t.Fatalf("expected 2 steps, got %d", len(result.Steps))
	}

	// Bypass step should carry the producer's stats.
	bypassStats := result.Steps[1].Stats
	if bypassStats["bytes"] != 99 {
		t.Fatalf("expected bypass stats bytes=99, got %v", bypassStats["bytes"])
	}
}

func TestBypass_FirstStepHasEmptyStats(t *testing.T) {
	t.Parallel()

	r := reg(&callCountTool{name: "target"})

	wf := workflowfx.Create("wf").On("push").
		Step("target", workflowfx.StepOpts{"bypass": true}).
		MustBuild()

	result, err := workflowfx.RunWorkflow(context.Background(), wf, r, nil)
	if err != nil {
		t.Fatal(err)
	}

	if len(result.Steps) != 1 {
		t.Fatal("expected 1 step")
	}

	// No prev step → stats should be empty map.
	if result.Steps[0].Stats == nil {
		t.Fatal("bypass step stats should be empty map, not nil")
	}

	if len(result.Steps[0].Stats) != 0 {
		t.Fatalf("expected empty stats for bypass with no prev, got %v", result.Steps[0].Stats)
	}
}

func TestBypass_WorkflowPassed(t *testing.T) {
	t.Parallel()

	r := reg(&passingTool{name: "a"}, &callCountTool{name: "b"})

	wf := workflowfx.Create("wf").On("push").
		Step("a").
		Step("b", workflowfx.StepOpts{"bypass": true}).
		MustBuild()

	result, err := workflowfx.RunWorkflow(context.Background(), wf, r, nil)
	if err != nil {
		t.Fatal(err)
	}

	if !result.Passed {
		t.Fatal("workflow should pass when only bypass steps after a passing step")
	}
}

func TestBypass_DurationIsZero(t *testing.T) {
	t.Parallel()

	r := reg(&callCountTool{name: "target"})

	wf := workflowfx.Create("wf").On("push").
		Step("target", workflowfx.StepOpts{"bypass": true}).
		MustBuild()

	result, err := workflowfx.RunWorkflow(context.Background(), wf, r, nil)
	if err != nil {
		t.Fatal(err)
	}

	if result.Steps[0].DurationMs != 0 {
		t.Fatalf("expected durationMs=0 for bypass, got %v", result.Steps[0].DurationMs)
	}
}

// ─── Gap 5: input schema validation ───────────────────────────────────────────

var schemaRequireURL = json.RawMessage(`{"type":"object","required":["url"]}`)

func TestInputSchema_ValidInputRunsTool(t *testing.T) {
	t.Parallel()

	counter := &callCountTool{name: "fetch"}
	r := reg(counter)

	wf := workflowfx.Create("wf").On("push").
		Step("fetch", workflowfx.StepOpts{
			"url":         "https://example.com",
			"inputSchema": schemaRequireURL,
		}).
		MustBuild()

	_, err := workflowfx.RunWorkflow(context.Background(), wf, r, nil)
	if err != nil {
		t.Fatal(err)
	}

	if counter.calls != 1 {
		t.Fatalf("expected tool called once (valid input), got %d", counter.calls)
	}
}

func TestInputSchema_InvalidInputFailsStep(t *testing.T) {
	t.Parallel()

	counter := &callCountTool{name: "fetch"}
	r := reg(counter)

	wf := workflowfx.Create("wf").On("push").
		Step("fetch", workflowfx.StepOpts{
			// url missing — schema requires it
			"inputSchema": schemaRequireURL,
		}).
		MustBuild()

	_, err := workflowfx.RunWorkflow(context.Background(), wf, r, nil)
	if err == nil {
		t.Fatal("expected engine error when schema validation fails and ContinueOnError=false")
	}

	if counter.calls != 0 {
		t.Fatalf("tool must not be called when schema validation fails, got %d calls", counter.calls)
	}
}

func TestInputSchema_InvalidInput_ContinueOnError(t *testing.T) {
	t.Parallel()

	counter := &callCountTool{name: "fetch"}
	r := reg(counter)

	wf := workflowfx.Create("wf").On("push").
		Step("fetch", workflowfx.StepOpts{
			"inputSchema":     schemaRequireURL,
			"continueOnError": true,
		}).
		MustBuild()

	result, err := workflowfx.RunWorkflow(context.Background(), wf, r, nil)
	if err != nil {
		t.Fatalf("unexpected error with ContinueOnError=true: %v", err)
	}

	if result.Passed {
		t.Fatal("workflow should not pass when schema validation fails")
	}

	if len(result.Steps) != 1 {
		t.Fatalf("expected 1 step result, got %d", len(result.Steps))
	}

	if result.Steps[0].Passed {
		t.Fatal("schema-failed step should not pass")
	}

	if counter.calls != 0 {
		t.Fatalf("tool must not run after schema failure, got %d calls", counter.calls)
	}
}

func TestInputSchema_InvalidSchema_ReturnsError(t *testing.T) {
	t.Parallel()

	r := reg(&passingTool{name: "a"})

	wf := workflowfx.Create("wf").On("push").
		Step("a", workflowfx.StepOpts{
			"inputSchema": json.RawMessage(`{not valid json`),
		}).
		MustBuild()

	_, err := workflowfx.RunWorkflow(context.Background(), wf, r, nil)
	if err == nil {
		t.Fatal("expected error for malformed JSON schema")
	}
}

// ─── builder: new field extraction ────────────────────────────────────────────

func TestBuilder_Bypass_Extracted(t *testing.T) {
	t.Parallel()

	wf := workflowfx.Create("wf").On("push").
		Step("a", workflowfx.StepOpts{"bypass": true}).
		MustBuild()

	if !wf.Steps[0].Bypass {
		t.Fatal("expected Bypass=true in StepConfig")
	}

	if _, present := wf.Steps[0].Options["bypass"]; present {
		t.Fatal("'bypass' must not remain in Options")
	}
}

func TestBuilder_InputSchema_Extracted(t *testing.T) {
	t.Parallel()

	schema := json.RawMessage(`{"type":"object"}`)
	wf := workflowfx.Create("wf").On("push").
		Step("a", workflowfx.StepOpts{"inputSchema": schema}).
		MustBuild()

	if len(wf.Steps[0].InputSchema) == 0 {
		t.Fatal("expected InputSchema to be set in StepConfig")
	}

	if _, present := wf.Steps[0].Options["inputSchema"]; present {
		t.Fatal("'inputSchema' must not remain in Options")
	}
}
