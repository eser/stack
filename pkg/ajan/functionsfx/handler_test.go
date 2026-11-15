// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package functionsfx_test

import (
	"context"
	"errors"
	"sync/atomic"
	"testing"

	"github.com/eser/stack/pkg/ajan/functionsfx"
)

func TestTaskIsLazy(t *testing.T) {
	t.Parallel()

	var runs atomic.Int32

	handler := functionsfx.Handler[int, int](func(_ context.Context, input int) (int, error) {
		runs.Add(1)

		return input * 2, nil
	})

	task := handler.Task(21)

	if got := runs.Load(); got != 0 {
		t.Fatalf("the handler ran %d times before Run, want 0", got)
	}

	got, err := task.Run(t.Context())
	if err != nil {
		t.Fatalf("Run: %v", err)
	}

	if got != 42 {
		t.Errorf("Run = %d, want 42", got)
	}
}

func TestSucceedAndFail(t *testing.T) {
	t.Parallel()

	got, err := functionsfx.Succeed("ready").Run(t.Context())
	if err != nil || got != "ready" {
		t.Errorf("Succeed = (%q, %v), want (%q, nil)", got, err, "ready")
	}

	failure := errors.New("boom")

	zero, err := functionsfx.Fail[string](failure).Run(t.Context())
	if !errors.Is(err, failure) || zero != "" {
		t.Errorf("Fail = (%q, %v), want (%q, %v)", zero, err, "", failure)
	}
}

func TestBindWrapsAPlainAdapterErrorAsAdaptError(t *testing.T) {
	t.Parallel()

	var ran atomic.Bool

	handler := functionsfx.Handler[string, string](func(_ context.Context, input string) (string, error) {
		ran.Store(true)

		return input, nil
	})

	cause := errors.New("body is not JSON")
	bound := functionsfx.Bind(handler, functionsfx.Adapter[int, string](func(int) (string, error) {
		return "", cause
	}))

	_, err := bound(t.Context(), 1)

	if !functionsfx.IsKind(err, functionsfx.KindAdapt) {
		t.Errorf("kind = %q, want %q", functionsfx.KindOf(err), functionsfx.KindAdapt)
	}

	if !errors.Is(err, cause) {
		t.Error("the wrapped error does not reach the adapter's error")
	}

	if got := functionsfx.MessageOf(err); got != "body is not JSON" {
		t.Errorf("message = %q, want %q", got, "body is not JSON")
	}

	if ran.Load() {
		t.Error("the handler ran after the adapter failed")
	}
}

func TestBindKeepsAnAdaptErrorAsIs(t *testing.T) {
	t.Parallel()

	original := functionsfx.NewAdaptError("Method not allowed", nil)
	handler := functionsfx.Handler[string, string](func(_ context.Context, input string) (string, error) {
		return input, nil
	})
	bound := functionsfx.Bind(handler, functionsfx.Adapter[int, string](func(int) (string, error) {
		return "", original
	}))

	_, err := bound(t.Context(), 1)

	if got := functionsfx.MessageOf(err); got != "Method not allowed" {
		t.Errorf("message = %q, want %q", got, "Method not allowed")
	}
}

func TestBindPassesTheContextToTheHandler(t *testing.T) {
	t.Parallel()

	type key struct{}

	ctx := context.WithValue(t.Context(), key{}, "marker")

	handler := functionsfx.Handler[int, string](func(ctx context.Context, _ int) (string, error) {
		marker, _ := ctx.Value(key{}).(string)

		return marker, nil
	})
	bound := functionsfx.Bind(handler, functionsfx.Adapter[int, int](func(event int) (int, error) {
		return event, nil
	}))

	got, err := bound(ctx, 1)
	if err != nil || got != "marker" {
		t.Errorf("bound = (%q, %v), want (%q, nil)", got, err, "marker")
	}
}

func TestNewTriggerRefusesAnIncompleteBinding(t *testing.T) {
	t.Parallel()

	handler := functionsfx.Handler[string, string](func(_ context.Context, input string) (string, error) {
		return input, nil
	})
	adapter := functionsfx.Adapter[string, string](func(event string) (string, error) { return event, nil })
	mapper := functionsfx.ResponseMapper[string, string](func(output string, _ error) string { return output })

	tests := []struct {
		binding functionsfx.TriggerBinding[string, string, string, string]
		name    string
	}{
		{functionsfx.TriggerBinding[string, string, string, string]{AdaptInput: adapter, AdaptOutput: mapper}, "no handler"},
		{functionsfx.TriggerBinding[string, string, string, string]{Handler: handler, AdaptOutput: mapper}, "no input adapter"},
		{functionsfx.TriggerBinding[string, string, string, string]{Handler: handler, AdaptInput: adapter}, "no output mapper"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			if _, err := functionsfx.NewTrigger(tc.binding); !errors.Is(err, functionsfx.ErrIncompleteBinding) {
				t.Errorf("NewTrigger error = %v, want ErrIncompleteBinding", err)
			}
		})
	}
}

func TestNewTriggerMapsTheErrorToo(t *testing.T) {
	t.Parallel()

	trigger, err := functionsfx.NewTrigger(functionsfx.TriggerBinding[string, string, string, string]{
		Handler: func(context.Context, string) (string, error) {
			return "", functionsfx.NewValidationError("bad input")
		},
		AdaptInput: func(event string) (string, error) { return event, nil },
		AdaptOutput: func(output string, err error) string {
			if err != nil {
				return string(functionsfx.KindOf(err)) + ": " + functionsfx.MessageOf(err)
			}

			return output
		},
	})
	if err != nil {
		t.Fatalf("NewTrigger: %v", err)
	}

	if got := trigger(t.Context(), "x"); got != "ValidationError: bad input" {
		t.Errorf("response = %q, want %q", got, "ValidationError: bad input")
	}
}
