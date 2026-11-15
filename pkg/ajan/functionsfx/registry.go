// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package functionsfx

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"maps"
	"regexp"
	"slices"
	"sync"

	jsonschema "github.com/santhosh-tekuri/jsonschema/v6"
)

// Sentinel errors of the registry and of function construction.
var (
	ErrUnknownFunction   = errors.New("unknown function")
	ErrDuplicateFunction = errors.New("function already registered")
	ErrNilFunction       = errors.New("function is nil")
	ErrNilHandler        = errors.New("handler is nil")
	ErrInvalidName       = errors.New("invalid function name")
	ErrInvalidSchema     = errors.New("invalid schema")
	ErrUnknownTrigger    = errors.New("unknown trigger kind")
	ErrInvalidOwner      = errors.New("invalid owner package")
)

const maxNameLength = 128

// namePattern accepts lowercase words joined by a dot or a hyphen, such as
// "validate-no-todos" or "codebase.format".
var namePattern = regexp.MustCompile(`^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$`)

func validName(name string) bool {
	return len(name) <= maxNameLength && namePattern.MatchString(name)
}

// ownerPattern accepts the name of a scoped workspace package, such as
// "@eserstack/codebase".
var ownerPattern = regexp.MustCompile(`^@[a-z0-9][a-z0-9-]*/[a-z0-9][a-z0-9-]*$`)

// TriggerKind names an invocation source a function serves. The kinds mirror
// the event types of @eserstack/functions/triggers.
type TriggerKind string

const (
	// TriggerUnknown is the zero value: no trigger.
	TriggerUnknown TriggerKind = ""
	TriggerHTTP    TriggerKind = "http"
	TriggerCLI     TriggerKind = "cli"
	TriggerCron    TriggerKind = "cron"
	TriggerQueue   TriggerKind = "queue"
	// TriggerToolCall is an AI tool call (aifx.ToolCall).
	TriggerToolCall TriggerKind = "tool-call"
	// TriggerWorkflow is a step of a workflowfx workflow. The input is the
	// options of the step, and the output is a workflowfx.ToolOutput: the
	// passed flag, the issues, the mutations and the stats of the step.
	TriggerWorkflow TriggerKind = "workflow"
)

func validTrigger(kind TriggerKind) bool {
	switch kind {
	case TriggerHTTP, TriggerCLI, TriggerCron, TriggerQueue, TriggerToolCall, TriggerWorkflow:
		return true
	case TriggerUnknown:
		return false
	default:
		return false
	}
}

// Descriptor describes a function to the tools that list and call it: the
// workflow engine, the bridge and the type generator.
type Descriptor struct {
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	// Owner is the workspace package that owns the function, such as
	// "@eserstack/codebase". The TypeScript types of the function are generated
	// into that package.
	Owner string `json:"owner,omitempty"`
	// InputSchema and OutputSchema are JSON Schema (draft 2020-12) documents.
	// The input schema is enforced on every call; the output schema describes
	// the answer for clients and for type generation.
	InputSchema  json.RawMessage `json:"inputSchema,omitempty"`
	OutputSchema json.RawMessage `json:"outputSchema,omitempty"`
	Triggers     []TriggerKind   `json:"triggers,omitempty"`
	// WASM says whether the function runs in the WASM profile of the bridge,
	// which has no network of its own. It is false unless declared.
	WASM bool `json:"wasm"`
	// Stream says the function answers a sequence, not one value: its output
	// schema describes one item, and a caller opens it as a stream instead of
	// calling it.
	Stream bool `json:"stream,omitempty"`
}

func (d *Descriptor) clone() Descriptor {
	copied := *d
	copied.InputSchema = slices.Clone(d.InputSchema)
	copied.OutputSchema = slices.Clone(d.OutputSchema)
	copied.Triggers = slices.Clone(d.Triggers)

	return copied
}

// Option sets one field of a Descriptor while a Function is built. An option
// that cannot hold its value returns an error, and NewFunction fails with it.
type Option func(descriptor *Descriptor) error

// WithDescription sets the one-line description.
func WithDescription(text string) Option {
	return func(descriptor *Descriptor) error {
		descriptor.Description = text

		return nil
	}
}

// WithOwner names the workspace package that owns the function. The types
// generated for TypeScript are written into that package, so adding a function
// touches the package of its owner and no central file.
func WithOwner(owner string) Option {
	return func(descriptor *Descriptor) error {
		if !ownerPattern.MatchString(owner) {
			return fmt.Errorf("%w: %q, want a scoped package name such as \"@eserstack/codebase\"", ErrInvalidOwner, owner)
		}

		descriptor.Owner = owner

		return nil
	}
}

// WithInputSchema sets the JSON Schema every input is validated against.
func WithInputSchema(schema json.RawMessage) Option {
	return func(descriptor *Descriptor) error {
		descriptor.InputSchema = slices.Clone(schema)

		return nil
	}
}

// WithOutputSchema sets the JSON Schema that describes the output.
func WithOutputSchema(schema json.RawMessage) Option {
	return func(descriptor *Descriptor) error {
		descriptor.OutputSchema = slices.Clone(schema)

		return nil
	}
}

// WithTriggers sets the invocation sources the function serves.
func WithTriggers(kinds ...TriggerKind) Option {
	return func(descriptor *Descriptor) error {
		for _, kind := range kinds {
			if !validTrigger(kind) {
				return fmt.Errorf("%w: %q", ErrUnknownTrigger, kind)
			}
		}

		descriptor.Triggers = slices.Clone(kinds)

		return nil
	}
}

// WithWASM declares that the function runs in the WASM profile of the bridge.
func WithWASM() Option {
	return func(descriptor *Descriptor) error {
		descriptor.WASM = true

		return nil
	}
}

// Function is a handler seen from outside the process: named, described, and
// called with JSON. The workflow engine, the bridge and TypeScript reach every
// function through it.
type Function interface {
	Descriptor() Descriptor
	// Call decodes input, runs the handler and encodes its output. An empty
	// input reads as JSON null. A refused input is a ValidationError and a
	// cancelled context is an AbortError; any other error is the handler's.
	Call(ctx context.Context, input json.RawMessage) (json.RawMessage, error)
}

type typedFunction[I, O any] struct {
	handler    Handler[I, O]
	inputCheck *jsonschema.Schema // nil when the descriptor has no input schema
	descriptor Descriptor
}

// NewFunction builds a Function of a typed handler. The name is lowercase
// words joined by dots or hyphens. A schema that does not compile fails here,
// not at the first call.
func NewFunction[I, O any](name string, handler Handler[I, O], options ...Option) (Function, error) { //nolint:ireturn
	if handler == nil {
		return nil, fmt.Errorf("function %q: %w", name, ErrNilHandler)
	}

	descriptor, inputCheck, err := describe(name, options)
	if err != nil {
		return nil, err
	}

	return &typedFunction[I, O]{
		handler:    handler,
		inputCheck: inputCheck,
		descriptor: descriptor,
	}, nil
}

// describe builds the descriptor of a function from its name and options, and
// compiles its schemas once: the one of the input is kept to check each call.
func describe(name string, options []Option) (Descriptor, *jsonschema.Schema, error) {
	if !validName(name) {
		return Descriptor{}, nil, fmt.Errorf("%w: %q", ErrInvalidName, name)
	}

	descriptor := Descriptor{Name: name} //nolint:exhaustruct

	for _, option := range options {
		if err := option(&descriptor); err != nil {
			return Descriptor{}, nil, fmt.Errorf("function %q: %w", name, err)
		}
	}

	inputCheck, err := compileSchema(descriptor.InputSchema)
	if err != nil {
		return Descriptor{}, nil, fmt.Errorf("function %q input schema: %w", name, err)
	}

	if _, err := compileSchema(descriptor.OutputSchema); err != nil {
		return Descriptor{}, nil, fmt.Errorf("function %q output schema: %w", name, err)
	}

	return descriptor, inputCheck, nil
}

func (f *typedFunction[I, O]) Descriptor() Descriptor {
	return f.descriptor.clone()
}

func (f *typedFunction[I, O]) Call(ctx context.Context, input json.RawMessage) (json.RawMessage, error) {
	if err := ctx.Err(); err != nil {
		return nil, fmt.Errorf("call %q: %w", f.descriptor.Name, err)
	}

	payload := bytes.TrimSpace(input)
	if len(payload) == 0 {
		payload = []byte("null")
	}

	if f.inputCheck != nil {
		if err := validateInstance(f.inputCheck, payload); err != nil {
			return nil, NewValidationError(err.Error())
		}
	}

	var decoded I

	if err := json.Unmarshal(payload, &decoded); err != nil {
		return nil, NewValidationError(fmt.Sprintf("input of %q: %v", f.descriptor.Name, err))
	}

	output, err := f.handler(ctx, decoded)
	if err != nil {
		return nil, err
	}

	encoded, err := json.Marshal(output)
	if err != nil {
		return nil, fmt.Errorf("encode output of %q: %w", f.descriptor.Name, err)
	}

	return encoded, nil
}

// compileSchema compiles a schema document once. It answers nil for an empty
// document, which means no schema.
func compileSchema(raw json.RawMessage) (*jsonschema.Schema, error) {
	if len(bytes.TrimSpace(raw)) == 0 {
		return nil, nil //nolint:nilnil
	}

	document, err := jsonschema.UnmarshalJSON(bytes.NewReader(raw))
	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrInvalidSchema, err)
	}

	compiler := jsonschema.NewCompiler()

	if err := compiler.AddResource("function-schema.json", document); err != nil {
		return nil, fmt.Errorf("%w: %w", ErrInvalidSchema, err)
	}

	schema, err := compiler.Compile("function-schema.json")
	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrInvalidSchema, err)
	}

	return schema, nil
}

func validateInstance(schema *jsonschema.Schema, payload []byte) error {
	instance, err := jsonschema.UnmarshalJSON(bytes.NewReader(payload))
	if err != nil {
		return fmt.Errorf("input is not valid JSON: %w", err)
	}

	return schema.Validate(instance) //nolint:wrapcheck
}

// Registry holds functions by name. It is safe for concurrent use.
type Registry struct {
	functions map[string]Function // guarded by mu
	mu        sync.RWMutex
}

// NewRegistry creates an empty registry.
func NewRegistry() *Registry {
	return &Registry{
		functions: make(map[string]Function),
		mu:        sync.RWMutex{},
	}
}

// Register adds a function. A second function with the same name is an error,
// unlike the tool registry of workflowfx, which overwrites: two functions that
// answer to one name across the bridge are a bug to find at start-up.
func (r *Registry) Register(function Function) error {
	if function == nil {
		return ErrNilFunction
	}

	name := function.Descriptor().Name

	if !validName(name) {
		return fmt.Errorf("%w: %q", ErrInvalidName, name)
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	if _, exists := r.functions[name]; exists {
		return fmt.Errorf("%w: %q", ErrDuplicateFunction, name)
	}

	r.functions[name] = function

	return nil
}

// Get looks up a function by name.
func (r *Registry) Get(name string) (Function, bool) { //nolint:ireturn
	r.mu.RLock()
	defer r.mu.RUnlock()

	function, ok := r.functions[name]

	return function, ok
}

// Names returns the registered names in sorted order.
func (r *Registry) Names() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()

	return slices.Sorted(maps.Keys(r.functions))
}

// List returns the descriptors of every function, sorted by name.
func (r *Registry) List() []Descriptor {
	r.mu.RLock()
	defer r.mu.RUnlock()

	descriptors := make([]Descriptor, 0, len(r.functions))

	for _, name := range slices.Sorted(maps.Keys(r.functions)) {
		descriptors = append(descriptors, r.functions[name].Descriptor())
	}

	return descriptors
}

// Call runs the function of the given name. An unknown name is
// ErrUnknownFunction.
func (r *Registry) Call(ctx context.Context, name string, input json.RawMessage) (json.RawMessage, error) {
	function, ok := r.Get(name)
	if !ok {
		return nil, fmt.Errorf("%w: %q", ErrUnknownFunction, name)
	}

	return function.Call(ctx, input) //nolint:wrapcheck
}
