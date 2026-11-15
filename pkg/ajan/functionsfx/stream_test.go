// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package functionsfx_test

import (
	"context"
	"encoding/json"
	"errors"
	"iter"
	"reflect"
	"sync/atomic"
	"testing"

	"github.com/eser/stack/pkg/ajan/functionsfx"
)

type countInput struct {
	To int `json:"to"`
}

// counting yields 1..To, or fails at the item named by failAt (0 for never).
func counting(failAt int, produced *atomic.Int32) functionsfx.StreamHandler[countInput, int] {
	return func(ctx context.Context, input countInput) iter.Seq2[int, error] {
		return func(yield func(int, error) bool) {
			for i := 1; i <= input.To; i++ {
				if ctx.Err() != nil {
					return
				}

				if i == failAt {
					yield(0, functionsfx.NewValidationError("item failed"))

					return
				}

				if produced != nil {
					produced.Add(1)
				}

				if !yield(i, nil) {
					return
				}
			}
		}
	}
}

func newCounter(t *testing.T, failAt int, produced *atomic.Int32, options ...functionsfx.Option) functionsfx.StreamFunction {
	t.Helper()

	function, err := functionsfx.NewStreamFunction("count", counting(failAt, produced), options...)
	if err != nil {
		t.Fatalf("NewStreamFunction: %v", err)
	}

	return function
}

func collect(t *testing.T, items iter.Seq2[json.RawMessage, error]) ([]string, error) {
	t.Helper()

	got := []string{}

	for value, err := range items {
		if err != nil {
			return got, err
		}

		got = append(got, string(value))
	}

	return got, nil
}

func TestAStreamFunctionAnswersItsItemsAsJSON(t *testing.T) {
	t.Parallel()

	items, err := newCounter(t, 0, nil).Open(t.Context(), json.RawMessage(`{"to":3}`))
	if err != nil {
		t.Fatalf("Open: %v", err)
	}

	got, err := collect(t, items)
	if err != nil || !reflect.DeepEqual(got, []string{"1", "2", "3"}) {
		t.Errorf("items = %v, %v", got, err)
	}
}

func TestTheDescriptorOfAStreamFunctionSaysItStreams(t *testing.T) {
	t.Parallel()

	descriptor := newCounter(t, 0, nil, functionsfx.WithDescription("Counts up")).Descriptor()

	if !descriptor.Stream || descriptor.Name != "count" || descriptor.Description != "Counts up" {
		t.Errorf("descriptor = %+v", descriptor)
	}

	other, err := functionsfx.NewFunction("plain",
		functionsfx.Handler[string, string](func(_ context.Context, input string) (string, error) { return input, nil }))
	if err != nil {
		t.Fatal(err)
	}

	if other.Descriptor().Stream {
		t.Error("a function that does not stream says it does")
	}
}

func TestCallingAStreamFunctionIsErrStreamOnly(t *testing.T) {
	t.Parallel()

	_, err := newCounter(t, 0, nil).Call(t.Context(), json.RawMessage(`{"to":3}`))

	if !errors.Is(err, functionsfx.ErrStreamOnly) {
		t.Errorf("Call error = %v, want ErrStreamOnly", err)
	}
}

func TestAFailureIsTheLastItem(t *testing.T) {
	t.Parallel()

	items, err := newCounter(t, 3, nil).Open(t.Context(), json.RawMessage(`{"to":5}`))
	if err != nil {
		t.Fatalf("Open: %v", err)
	}

	got, err := collect(t, items)

	if !reflect.DeepEqual(got, []string{"1", "2"}) || !functionsfx.IsKind(err, functionsfx.KindValidation) {
		t.Errorf("items = %v, error = %v, want two items and the ValidationError", got, err)
	}
}

func TestStoppingTheLoopStopsTheProducer(t *testing.T) {
	t.Parallel()

	var produced atomic.Int32

	items, err := newCounter(t, 0, &produced).Open(t.Context(), json.RawMessage(`{"to":1000}`))
	if err != nil {
		t.Fatalf("Open: %v", err)
	}

	for _, err := range items {
		if err != nil {
			t.Fatalf("the stream failed: %v", err)
		}

		break
	}

	if got := produced.Load(); got != 1 {
		t.Errorf("the function produced %d items for a reader that stopped after one", got)
	}
}

func TestAnInputTheSchemaRefusesIsRefusedAtOpen(t *testing.T) {
	t.Parallel()

	function := newCounter(t, 0, nil, functionsfx.WithInputSchema(json.RawMessage(`{
		"type": "object",
		"properties": {"to": {"type": "integer", "minimum": 1}},
		"required": ["to"]
	}`)))

	for name, input := range map[string]string{
		"a missing field":  `{}`,
		"a value too low":  `{"to":0}`,
		"a wrong shape":    `[1]`,
		"text that is not": `{"to":`,
	} {
		if _, err := function.Open(t.Context(), json.RawMessage(input)); !functionsfx.IsKind(err, functionsfx.KindValidation) {
			t.Errorf("%s: error = %v, want a ValidationError at Open", name, err)
		}
	}
}

func TestOpenRefusesAContextThatEnded(t *testing.T) {
	t.Parallel()

	ctx, cancel := context.WithCancel(t.Context())
	cancel()

	if _, err := newCounter(t, 0, nil).Open(ctx, json.RawMessage(`{"to":3}`)); !functionsfx.IsKind(err, functionsfx.KindAbort) {
		t.Errorf("error = %v, want an abort", err)
	}
}

func TestAnItemThatCannotBeEncodedEndsTheStream(t *testing.T) {
	t.Parallel()

	function, err := functionsfx.NewStreamFunction("bad-items",
		functionsfx.StreamHandler[string, any](func(context.Context, string) iter.Seq2[any, error] {
			return func(yield func(any, error) bool) {
				if yield("fine", nil) {
					yield(make(chan int), nil)
				}
			}
		}))
	if err != nil {
		t.Fatal(err)
	}

	items, err := function.Open(t.Context(), nil)
	if err != nil {
		t.Fatal(err)
	}

	got, err := collect(t, items)
	if !reflect.DeepEqual(got, []string{`"fine"`}) || err == nil {
		t.Errorf("items = %v, error = %v, want the first item and an encoding error", got, err)
	}
}

func TestNewStreamFunctionRefusesWhatNewFunctionRefuses(t *testing.T) {
	t.Parallel()

	if _, err := functionsfx.NewStreamFunction[string, string]("ok-name", nil); !errors.Is(err, functionsfx.ErrNilHandler) {
		t.Errorf("nil handler: error = %v, want ErrNilHandler", err)
	}

	handler := counting(0, nil)

	if _, err := functionsfx.NewStreamFunction("Bad Name", handler); !errors.Is(err, functionsfx.ErrInvalidName) {
		t.Errorf("bad name: error = %v, want ErrInvalidName", err)
	}

	if _, err := functionsfx.NewStreamFunction("count", handler, functionsfx.WithInputSchema(json.RawMessage(`{bad`))); !errors.Is(err, functionsfx.ErrInvalidSchema) {
		t.Errorf("bad schema: error = %v, want ErrInvalidSchema", err)
	}
}

func TestRegistryStream(t *testing.T) {
	t.Parallel()

	registry := functionsfx.NewRegistry()

	if err := registry.Register(newCounter(t, 0, nil)); err != nil {
		t.Fatal(err)
	}

	plain, err := functionsfx.NewFunction("plain",
		functionsfx.Handler[string, string](func(_ context.Context, input string) (string, error) { return input, nil }))
	if err != nil {
		t.Fatal(err)
	}

	if err := registry.Register(plain); err != nil {
		t.Fatal(err)
	}

	items, err := registry.Stream(t.Context(), "count", json.RawMessage(`{"to":2}`))
	if err != nil {
		t.Fatalf("Stream: %v", err)
	}

	if got, _ := collect(t, items); !reflect.DeepEqual(got, []string{"1", "2"}) {
		t.Errorf("items = %v", got)
	}

	if _, err := registry.Stream(t.Context(), "missing", nil); !errors.Is(err, functionsfx.ErrUnknownFunction) {
		t.Errorf("unknown name: error = %v, want ErrUnknownFunction", err)
	}

	if _, err := registry.Stream(t.Context(), "plain", nil); !errors.Is(err, functionsfx.ErrNotStream) {
		t.Errorf("a function that does not stream: error = %v, want ErrNotStream", err)
	}

	if _, err := registry.Call(t.Context(), "count", json.RawMessage(`{"to":2}`)); !errors.Is(err, functionsfx.ErrStreamOnly) {
		t.Errorf("Call of a stream function: error = %v, want ErrStreamOnly", err)
	}
}
