// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package functionsfx_test

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"sync"
	"testing"

	"github.com/eser/stack/pkg/ajan/functionsfx"
)

type greetInput struct {
	Name string `json:"name"`
}

const greetSchema = `{
  "type": "object",
  "properties": { "name": { "type": "string", "minLength": 1 } },
  "required": ["name"],
  "additionalProperties": false
}`

func newGreet(t *testing.T, options ...functionsfx.Option) functionsfx.Function {
	t.Helper()

	function, err := functionsfx.NewFunction("greet",
		functionsfx.Handler[greetInput, string](func(_ context.Context, input greetInput) (string, error) {
			return "Hello, " + input.Name, nil
		}),
		options...,
	)
	if err != nil {
		t.Fatalf("NewFunction: %v", err)
	}

	return function
}

func TestNewFunctionRefusesBadDefinitions(t *testing.T) {
	t.Parallel()

	handler := functionsfx.Handler[string, string](func(_ context.Context, input string) (string, error) {
		return input, nil
	})

	tests := []struct {
		want    error
		handler functionsfx.Handler[string, string]
		name    string
		fnName  string
		options []functionsfx.Option
	}{
		{functionsfx.ErrInvalidName, handler, "empty name", "", nil},
		{functionsfx.ErrInvalidName, handler, "upper case", "Greet", nil},
		{functionsfx.ErrInvalidName, handler, "trailing dot", "greet.", nil},
		{functionsfx.ErrInvalidName, handler, "space", "say hi", nil},
		{functionsfx.ErrNilHandler, nil, "nil handler", "greet", nil},
		{
			functionsfx.ErrInvalidSchema, handler, "input schema is not JSON", "greet",
			[]functionsfx.Option{functionsfx.WithInputSchema(json.RawMessage(`{not json`))},
		},
		{
			functionsfx.ErrInvalidSchema, handler, "output schema does not compile", "greet",
			[]functionsfx.Option{functionsfx.WithOutputSchema(json.RawMessage(`{"type": 5}`))},
		},
		{
			functionsfx.ErrUnknownTrigger, handler, "unknown trigger", "greet",
			[]functionsfx.Option{functionsfx.WithTriggers(functionsfx.TriggerHTTP, "carrier-pigeon")},
		},
		{
			functionsfx.ErrUnknownTrigger, handler, "the zero trigger", "greet",
			[]functionsfx.Option{functionsfx.WithTriggers(functionsfx.TriggerUnknown)},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			if _, err := functionsfx.NewFunction(tc.fnName, tc.handler, tc.options...); !errors.Is(err, tc.want) {
				t.Errorf("NewFunction error = %v, want %v", err, tc.want)
			}
		})
	}
}

func TestNewFunctionAcceptsTheNamesOfTheManifest(t *testing.T) {
	t.Parallel()

	handler := functionsfx.Handler[string, string](func(_ context.Context, input string) (string, error) {
		return input, nil
	})

	for _, name := range []string{"greet", "validate-no-todos", "codebase.format", "a1.b-2"} {
		if _, err := functionsfx.NewFunction(name, handler); err != nil {
			t.Errorf("NewFunction(%q): %v", name, err)
		}
	}
}

func TestDescriptorDefaultsAreSafe(t *testing.T) {
	t.Parallel()

	descriptor := newGreet(t).Descriptor()

	if descriptor.WASM {
		t.Error("a function that did not declare WASM runs in the WASM profile")
	}

	if len(descriptor.Triggers) != 0 || descriptor.InputSchema != nil || descriptor.OutputSchema != nil {
		t.Errorf("descriptor = %+v, want no triggers and no schemas", descriptor)
	}
}

func TestDescriptorCarriesWhatTheOptionsSet(t *testing.T) {
	t.Parallel()

	descriptor := newGreet(t,
		functionsfx.WithDescription("Says hello"),
		functionsfx.WithInputSchema(json.RawMessage(greetSchema)),
		functionsfx.WithOutputSchema(json.RawMessage(`{"type":"string"}`)),
		functionsfx.WithTriggers(functionsfx.TriggerHTTP, functionsfx.TriggerToolCall, functionsfx.TriggerWorkflow),
		functionsfx.WithWASM(),
	).Descriptor()

	if descriptor.Name != "greet" || descriptor.Description != "Says hello" || !descriptor.WASM {
		t.Errorf("descriptor = %+v", descriptor)
	}

	if !slices.Equal(descriptor.Triggers, []functionsfx.TriggerKind{functionsfx.TriggerHTTP, functionsfx.TriggerToolCall, functionsfx.TriggerWorkflow}) {
		t.Errorf("triggers = %v", descriptor.Triggers)
	}

	if string(descriptor.OutputSchema) != `{"type":"string"}` {
		t.Errorf("output schema = %s", descriptor.OutputSchema)
	}
}

func TestDescriptorIsACopy(t *testing.T) {
	t.Parallel()

	function := newGreet(t,
		functionsfx.WithTriggers(functionsfx.TriggerHTTP),
		functionsfx.WithInputSchema(json.RawMessage(`{"type":"string"}`)),
	)

	first := function.Descriptor()
	first.Triggers[0] = functionsfx.TriggerCron
	first.InputSchema[0] = '['

	second := function.Descriptor()

	if second.Triggers[0] != functionsfx.TriggerHTTP || string(second.InputSchema) != `{"type":"string"}` {
		t.Errorf("a caller changed the descriptor of the function: %+v", second)
	}
}

func TestCall(t *testing.T) {
	t.Parallel()

	failure := errors.New("disk full")

	tests := []struct {
		name     string
		input    string
		schema   string
		handler  functionsfx.Handler[greetInput, string]
		want     string
		wantKind functionsfx.Kind
		wantErr  bool
	}{
		{
			name:  "decodes the input and encodes the output",
			input: `{"name":"Ada"}`,
			want:  `"Hello, Ada"`,
		},
		{
			name:     "a body that is not JSON is a validation error",
			input:    `{"name":`,
			wantErr:  true,
			wantKind: functionsfx.KindValidation,
		},
		{
			name:     "a body of the wrong shape is a validation error",
			input:    `[1,2]`,
			wantErr:  true,
			wantKind: functionsfx.KindValidation,
		},
		{
			name:   "the input schema accepts a matching input",
			input:  `{"name":"Ada"}`,
			schema: greetSchema,
			want:   `"Hello, Ada"`,
		},
		{
			name:     "the input schema refuses a missing field",
			input:    `{}`,
			schema:   greetSchema,
			wantErr:  true,
			wantKind: functionsfx.KindValidation,
		},
		{
			name:     "the input schema refuses an extra field",
			input:    `{"name":"Ada","admin":true}`,
			schema:   greetSchema,
			wantErr:  true,
			wantKind: functionsfx.KindValidation,
		},
		{
			name:     "the input schema refuses an empty name",
			input:    `{"name":""}`,
			schema:   greetSchema,
			wantErr:  true,
			wantKind: functionsfx.KindValidation,
		},
		{
			name:     "an empty input reads as null, which the schema refuses",
			input:    ``,
			schema:   greetSchema,
			wantErr:  true,
			wantKind: functionsfx.KindValidation,
		},
		{
			name:  "an empty input reads as the zero value without a schema",
			input: ``,
			want:  `"Hello, "`,
		},
		{
			name:  "a handler error comes back as it is",
			input: `{"name":"Ada"}`,
			handler: func(context.Context, greetInput) (string, error) {
				return "", fmt.Errorf("save: %w", failure)
			},
			wantErr:  true,
			wantKind: functionsfx.KindUnknown,
		},
		{
			name:  "a handler error keeps its kind",
			input: `{"name":"Ada"}`,
			handler: func(context.Context, greetInput) (string, error) {
				return "", functionsfx.NewAbortError("stopped")
			},
			wantErr:  true,
			wantKind: functionsfx.KindAbort,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			handler := tc.handler
			if handler == nil {
				handler = func(_ context.Context, input greetInput) (string, error) {
					return "Hello, " + input.Name, nil
				}
			}

			options := []functionsfx.Option{}
			if tc.schema != "" {
				options = append(options, functionsfx.WithInputSchema(json.RawMessage(tc.schema)))
			}

			function, err := functionsfx.NewFunction("greet", handler, options...)
			if err != nil {
				t.Fatalf("NewFunction: %v", err)
			}

			got, err := function.Call(t.Context(), json.RawMessage(tc.input))

			if tc.wantErr {
				if err == nil {
					t.Fatalf("Call(%s) = %s, want an error", tc.input, got)
				}

				if kind := functionsfx.KindOf(err); kind != tc.wantKind {
					t.Errorf("kind = %q, want %q (error: %v)", kind, tc.wantKind, err)
				}

				return
			}

			if err != nil {
				t.Fatalf("Call(%s): %v", tc.input, err)
			}

			if string(got) != tc.want {
				t.Errorf("Call(%s) = %s, want %s", tc.input, got, tc.want)
			}
		})
	}
}

func TestCallKeepsTheCauseOfAHandlerError(t *testing.T) {
	t.Parallel()

	failure := errors.New("disk full")

	function, err := functionsfx.NewFunction("save",
		functionsfx.Handler[string, string](func(context.Context, string) (string, error) {
			return "", fmt.Errorf("save: %w", failure)
		}),
	)
	if err != nil {
		t.Fatalf("NewFunction: %v", err)
	}

	if _, err := function.Call(t.Context(), json.RawMessage(`"x"`)); !errors.Is(err, failure) {
		t.Errorf("Call error = %v, want it to reach %v", err, failure)
	}
}

func TestCallRefusesACancelledContext(t *testing.T) {
	t.Parallel()

	var ran bool

	function, err := functionsfx.NewFunction("noop",
		functionsfx.Handler[string, string](func(_ context.Context, input string) (string, error) {
			ran = true

			return input, nil
		}),
	)
	if err != nil {
		t.Fatalf("NewFunction: %v", err)
	}

	ctx, cancel := context.WithCancel(t.Context())
	cancel()

	_, err = function.Call(ctx, json.RawMessage(`"x"`))

	if !functionsfx.IsKind(err, functionsfx.KindAbort) {
		t.Errorf("kind = %q, want %q (error: %v)", functionsfx.KindOf(err), functionsfx.KindAbort, err)
	}

	if ran {
		t.Error("the handler ran on a cancelled context")
	}
}

func TestRegistry(t *testing.T) {
	t.Parallel()

	registry := functionsfx.NewRegistry()

	for _, name := range []string{"zeta", "alpha", "mid"} {
		function, err := functionsfx.NewFunction(name,
			functionsfx.Handler[string, string](func(_ context.Context, input string) (string, error) {
				return name + ":" + input, nil
			}),
		)
		if err != nil {
			t.Fatalf("NewFunction(%q): %v", name, err)
		}

		if err := registry.Register(function); err != nil {
			t.Fatalf("Register(%q): %v", name, err)
		}
	}

	if got := registry.Names(); !slices.Equal(got, []string{"alpha", "mid", "zeta"}) {
		t.Errorf("Names = %v, want sorted names", got)
	}

	descriptors := registry.List()
	if len(descriptors) != 3 || descriptors[0].Name != "alpha" || descriptors[2].Name != "zeta" {
		t.Errorf("List = %+v, want three descriptors sorted by name", descriptors)
	}

	got, err := registry.Call(t.Context(), "mid", json.RawMessage(`"x"`))
	if err != nil || string(got) != `"mid:x"` {
		t.Errorf("Call(mid) = (%s, %v), want (%q, nil)", got, err, `"mid:x"`)
	}

	if _, ok := registry.Get("alpha"); !ok {
		t.Error("Get(alpha) found nothing")
	}

	if _, ok := registry.Get("missing"); ok {
		t.Error("Get(missing) found a function")
	}
}

func TestRegistryRefusals(t *testing.T) {
	t.Parallel()

	registry := functionsfx.NewRegistry()
	first := newGreet(t)

	if err := registry.Register(first); err != nil {
		t.Fatalf("Register: %v", err)
	}

	if err := registry.Register(newGreet(t)); !errors.Is(err, functionsfx.ErrDuplicateFunction) {
		t.Errorf("second Register error = %v, want ErrDuplicateFunction", err)
	}

	if err := registry.Register(nil); !errors.Is(err, functionsfx.ErrNilFunction) {
		t.Errorf("Register(nil) error = %v, want ErrNilFunction", err)
	}

	if _, err := registry.Call(t.Context(), "missing", nil); !errors.Is(err, functionsfx.ErrUnknownFunction) {
		t.Errorf("Call(missing) error = %v, want ErrUnknownFunction", err)
	}
}

func TestRegistryIsSafeForConcurrentUse(t *testing.T) {
	t.Parallel()

	registry := functionsfx.NewRegistry()

	var group sync.WaitGroup

	for i := range 20 {
		group.Go(func() {
			function, err := functionsfx.NewFunction(fmt.Sprintf("fn-%d", i),
				functionsfx.Handler[string, string](func(_ context.Context, input string) (string, error) {
					return input, nil
				}),
			)
			if err != nil {
				t.Errorf("NewFunction: %v", err)

				return
			}

			if err := registry.Register(function); err != nil {
				t.Errorf("Register: %v", err)
			}

			_ = registry.Names()
			_ = registry.List()
		})
	}

	group.Wait()

	if got := len(registry.Names()); got != 20 {
		t.Errorf("registered %d functions, want 20", got)
	}
}
