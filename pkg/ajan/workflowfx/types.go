// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package workflowfx

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"
)

// DefaultStepTimeout is used when neither the step nor RunOptions specifies a timeout.
const DefaultStepTimeout = 60 * time.Second

// Sentinel errors.
var (
	ErrWorkflow         = errors.New("workflow error")
	ErrToolNotFound     = errors.New("tool not found")
	ErrCircularIncludes = errors.New("circular workflow includes detected")
	ErrWorkflowNotFound = errors.New("workflow not found")
	ErrNoMatchingEvent  = errors.New("no workflows match the given event")
)

// WorkflowError wraps a workflow execution failure.
type WorkflowError struct {
	Msg string
	Err error
}

func (e *WorkflowError) Error() string { return e.Msg }
func (e *WorkflowError) Unwrap() error { return e.Err }

func newWorkflowError(msg string, cause error) *WorkflowError {
	return &WorkflowError{Msg: msg, Err: errors.Join(ErrWorkflow, cause)}
}

// LoopConfig defines iteration parameters for a step.
// The engine evaluates Over as an Expr expression, then runs the step once
// per element, injecting the element as As and optionally the index as AsIndex.
type LoopConfig struct {
	Over    string // Expr expression evaluating to a slice
	As      string // variable name for the current element in step Options
	AsIndex string // variable name for the current index (optional)
}

// StepConfig is a resolved step: a tool name, its options, and engine directives.
//
// Engine directives (ContinueOnError, Timeout, If, Loop, Bypass, InputSchema) are
// consumed by the engine and never passed to the tool's Run method.
type StepConfig struct {
	Name            string
	Options         map[string]any
	ContinueOnError bool
	Timeout         time.Duration   // 0 means use RunOptions.DefaultTimeout
	If              string          // Expr predicate; empty means always run
	Loop            *LoopConfig     // if non-nil, iterate step over a collection
	Bypass          bool            // if true, skip tool execution; output = prev step stats
	InputSchema     json.RawMessage // JSON Schema to validate merged options before tool.Run; nil = no validation
}

// WorkflowDefinition declares an ordered set of steps and the events that trigger them.
type WorkflowDefinition struct {
	ID        string
	On        []string
	Steps     []StepConfig
	Includes  []string       // IDs of workflows whose steps are prepended to this one
	Variables map[string]any // available as "vars" in Expr step predicates
}

// WorkflowIssue is a single problem found by a tool.
type WorkflowIssue struct {
	Path    string
	Line    int
	Message string
	Fixed   bool
}

// WorkflowFileMutation is a file change produced by a fixer tool.
type WorkflowFileMutation struct {
	Path       string
	OldContent string
	NewContent string
}

// WorkflowTool is a named, runnable unit of work.
type WorkflowTool interface {
	Name() string
	Description() string
	Run(ctx context.Context, options map[string]any) (*WorkflowToolResult, error)
}

// WorkflowToolResult is the outcome of running a single tool.
type WorkflowToolResult struct {
	Name      string
	Passed    bool
	Issues    []WorkflowIssue
	Mutations []WorkflowFileMutation
	Stats     map[string]any
	NextSteps []StepConfig // prepended to the remaining step queue after this step completes
}

// StepResult combines a tool result with timing information.
type StepResult struct {
	WorkflowToolResult
	DurationMs float64
}

// WorkflowResult is the aggregate outcome of running all steps in a workflow.
type WorkflowResult struct {
	ID              string
	Passed          bool
	Steps           []StepResult
	TotalDurationMs float64
}

// RunOptions configures workflow execution.
type RunOptions struct {
	// Root is the working directory passed to each tool as options["root"].
	Root string
	// Fix enables auto-fix mode, passed as options["fix"].
	Fix bool
	// Only runs only the named step; empty string means run all steps.
	Only string
	// Args are extra CLI arguments passed as options["_args"].
	Args []string
	// ChangedFiles limits tool scope to the listed paths (incremental mode).
	ChangedFiles []string
	// DefaultTimeout is the fallback timeout for steps with no per-step timeout.
	// Zero means use DefaultStepTimeout.
	DefaultTimeout time.Duration
	// Event is the triggering event name, available as "event" in Expr predicates.
	Event string
	// OnStepStart is called before each step executes.
	OnStepStart func(name string)
	// OnStepEnd is called after each step completes (pass or fail).
	OnStepEnd func(name string, result StepResult)
	// OnMutations is called when a step produces file mutations.
	// Returning an error aborts the workflow.
	OnMutations func(mutations []WorkflowFileMutation) error
}

func (o *RunOptions) defaultTimeout() time.Duration {
	if o == nil || o.DefaultTimeout == 0 {
		return DefaultStepTimeout
	}

	return o.DefaultTimeout
}

// WorkflowsConfig mirrors the top-level .eser/manifest YAML structure.
type WorkflowsConfig struct {
	Stack     []string
	Workflows []*WorkflowDefinition
}

// WorkflowNotFoundError is returned when an ID cannot be resolved.
type WorkflowNotFoundError struct {
	ID string
}

func (e *WorkflowNotFoundError) Error() string {
	return fmt.Sprintf("workflow '%s' not found", e.ID)
}

func (e *WorkflowNotFoundError) Unwrap() error { return ErrWorkflowNotFound }
