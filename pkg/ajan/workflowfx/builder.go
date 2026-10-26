// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package workflowfx

import (
	"encoding/json"
	"errors"
	"fmt"
	"time"
)

// Builder is a fluent builder for WorkflowDefinition.
//
// Example:
//
//	wf := workflowfx.Create("ci").
//	    On("precommit", "prepush").
//	    Step("fix-eof").
//	    Step("check-json", workflowfx.StepOpts{"exclude": []string{"tsconfig.json"}}).
//	    Build()
type Builder struct {
	id        string
	events    []string
	steps     []StepConfig
	includes  []string
	variables map[string]any
}

// StepOpts is a convenience alias for step option maps.
type StepOpts = map[string]any

// Create starts a fluent workflow builder.
func Create(id string) *Builder {
	return &Builder{id: id}
}

// On adds events that trigger the workflow.
func (b *Builder) On(events ...string) *Builder {
	b.events = append(b.events, events...)

	return b
}

// Include adds workflow IDs whose steps are prepended before this workflow's steps.
func (b *Builder) Include(ids ...string) *Builder {
	b.includes = append(b.includes, ids...)

	return b
}

// Vars sets workflow-level variables available as "vars" in Expr predicates.
func (b *Builder) Vars(vars map[string]any) *Builder {
	b.variables = vars

	return b
}

// Step appends a step. The optional opts map may include engine directives:
//   - "continueOnError" (bool) — catch errors, mark step failed, continue
//   - "timeout" (time.Duration or int seconds) — per-step timeout
//   - "if" (string) — Expr predicate; step is skipped when it evaluates to false
//   - "loop" (*LoopConfig) — iterate step over a collection
func (b *Builder) Step(name string, opts ...StepOpts) *Builder {
	cfg := StepConfig{Name: name, Options: map[string]any{}}

	if len(opts) > 0 {
		for k, v := range opts[0] {
			switch k {
			case "continueOnError":
				if bv, ok := v.(bool); ok {
					cfg.ContinueOnError = bv
				}
			case "timeout":
				switch tv := v.(type) {
				case time.Duration:
					cfg.Timeout = tv
				case int:
					cfg.Timeout = time.Duration(tv) * time.Second
				case float64:
					cfg.Timeout = time.Duration(tv) * time.Second
				}
			case "if":
				if sv, ok := v.(string); ok {
					cfg.If = sv
				}
			case "loop":
				if lc, ok := v.(*LoopConfig); ok {
					cfg.Loop = lc
				}
			case "bypass":
				if bv, ok := v.(bool); ok {
					cfg.Bypass = bv
				}
			case "inputSchema":
				switch sv := v.(type) {
				case json.RawMessage:
					cfg.InputSchema = sv
				case []byte:
					cfg.InputSchema = json.RawMessage(sv)
				case string:
					cfg.InputSchema = json.RawMessage(sv)
				}
			default:
				cfg.Options[k] = v
			}
		}
	}

	b.steps = append(b.steps, cfg)

	return b
}

// Build validates and returns the WorkflowDefinition.
// Returns an error if id, events, or steps are missing.
func (b *Builder) Build() (*WorkflowDefinition, error) {
	if b.id == "" {
		return nil, errors.New("workflowfx: workflow id is required")
	}

	if len(b.events) == 0 {
		return nil, fmt.Errorf("workflowfx: workflow '%s' must have at least one event", b.id)
	}

	if len(b.steps) == 0 && len(b.includes) == 0 {
		return nil, fmt.Errorf("workflowfx: workflow '%s' must have at least one step or include", b.id)
	}

	return &WorkflowDefinition{
		ID:        b.id,
		On:        append([]string{}, b.events...),
		Steps:     append([]StepConfig{}, b.steps...),
		Includes:  append([]string{}, b.includes...),
		Variables: b.variables,
	}, nil
}

// MustBuild is like Build but panics on error. Useful for static workflow definitions.
func (b *Builder) MustBuild() *WorkflowDefinition {
	wf, err := b.Build()
	if err != nil {
		panic(err)
	}

	return wf
}
