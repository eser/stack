// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !wasip1

package main

import (
	"context"
	"encoding/json"
	"errors"
	"iter"
	"reflect"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/functionsfx"
)

type countRequest struct {
	To int `json:"to"`
}

// streamRegistry holds a function that counts up to the number it is given and
// fails at the item named by "fail".
func streamRegistry(t *testing.T, functions ...functionsfx.Function) *functionsfx.Registry {
	t.Helper()

	return registryOf(t, functions...)
}

func counter(t *testing.T, name string, handler functionsfx.StreamHandler[countRequest, int], options ...functionsfx.Option) functionsfx.Function {
	t.Helper()

	function, err := functionsfx.NewStreamFunction(name, handler, options...)
	if err != nil {
		t.Fatalf("NewStreamFunction(%q): %v", name, err)
	}

	return function
}

func countingUp(failAt int) functionsfx.StreamHandler[countRequest, int] {
	return func(ctx context.Context, input countRequest) iter.Seq2[int, error] {
		return func(yield func(int, error) bool) {
			for i := 1; i <= input.To; i++ {
				if ctx.Err() != nil {
					return
				}

				if i == failAt {
					yield(0, functionsfx.NewValidationError("item failed"))

					return
				}

				if !yield(i, nil) {
					return
				}
			}
		}
	}
}

// openStream opens a stream on a registry and answers its handle.
func openStream(t *testing.T, registry *functionsfx.Registry, request string) string {
	t.Helper()

	answer := bridgeFunctionStreamOpen(registry)(request)

	var opened struct {
		Handle string `json:"handle"`
		Error  string `json:"error"`
	}

	if err := json.Unmarshal([]byte(answer), &opened); err != nil || opened.Handle == "" {
		t.Fatalf("open answered %s (%v), want a handle", answer, err)
	}

	t.Cleanup(func() { bridgeFunctionStreamClose(opened.Handle) })

	return opened.Handle
}

// readAll reads a stream to its end and answers the items, as JSON text.
func readAll(t *testing.T, handle string) []string {
	t.Helper()

	var items []string

	for range 100 {
		answer := bridgeFunctionStreamRead(handle)
		if answer == "null" {
			return items
		}

		items = append(items, answer)
	}

	t.Fatalf("the stream did not end after 100 items: %v", items)

	return nil
}

func TestAFunctionStreamAnswersItsItemsThenNull(t *testing.T) {
	t.Parallel()

	handle := openStream(t, streamRegistry(t, counter(t, "count", countingUp(0))), `{"name":"count","input":{"to":3}}`)

	want := []string{`{"output":1}`, `{"output":2}`, `{"output":3}`}
	if got := readAll(t, handle); !reflect.DeepEqual(got, want) {
		t.Errorf("items = %v, want %v", got, want)
	}

	if got := bridgeFunctionStreamRead(handle); got != "null" {
		t.Errorf("a read after the end = %s, want null", got)
	}
}

func TestAFailureIsTheLastItemOfAFunctionStream(t *testing.T) {
	t.Parallel()

	handle := openStream(t, streamRegistry(t, counter(t, "count", countingUp(3))), `{"name":"count","input":{"to":5}}`)

	got := readAll(t, handle)
	if len(got) != 3 || got[0] != `{"output":1}` || got[1] != `{"output":2}` {
		t.Fatalf("items = %v, want two items and the failure", got)
	}

	failure := decodeFunctionAnswer(t, got[2])
	if failure.Error != "item failed" || failure.ErrorKind != "ValidationError" {
		t.Errorf("last item = %+v, want the ValidationError", failure)
	}
}

func TestOpeningAStreamThatCannotOpenAnswersAFailure(t *testing.T) {
	t.Parallel()

	plain, err := functionsfx.NewFunction("plain",
		functionsfx.Handler[string, string](func(_ context.Context, input string) (string, error) { return input, nil }))
	if err != nil {
		t.Fatal(err)
	}

	registry := streamRegistry(t,
		counter(t, "count", countingUp(0), functionsfx.WithInputSchema(json.RawMessage(`{"type":"object","required":["to"]}`))),
		plain,
	)

	tests := []struct {
		name     string
		request  string
		wantKind string
	}{
		{"an unknown function", `{"name":"missing","input":{}}`, "UnknownFunction"},
		{"a function that does not stream", `{"name":"plain","input":"x"}`, "NotAStream"},
		{"an input the schema refuses", `{"name":"count","input":{}}`, "ValidationError"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			got := decodeFunctionAnswer(t, bridgeFunctionStreamOpen(registry)(tc.request))
			if got.Error == "" || got.ErrorKind != tc.wantKind {
				t.Errorf("answered %+v, want a failure of kind %s", got, tc.wantKind)
			}
		})
	}
}

func TestClosingAStreamStopsTheFunction(t *testing.T) {
	t.Parallel()

	stopped := make(chan struct{})

	forever := functionsfx.StreamHandler[countRequest, int](func(ctx context.Context, _ countRequest) iter.Seq2[int, error] {
		return func(yield func(int, error) bool) {
			defer close(stopped)

			for i := 1; ; i++ {
				if !yield(i, nil) {
					return
				}

				if ctx.Err() != nil {
					return
				}
			}
		}
	})

	handle := openStream(t, streamRegistry(t, counter(t, "forever", forever)), `{"name":"forever","input":{}}`)

	if got := bridgeFunctionStreamRead(handle); got != `{"output":1}` {
		t.Fatalf("first item = %s", got)
	}

	if got := bridgeFunctionStreamClose(handle); got != "{}" {
		t.Errorf("close = %s, want {}", got)
	}

	select {
	case <-stopped:
	case <-time.After(5 * time.Second):
		t.Fatal("the function did not stop after the stream was closed")
	}

	if got := bridgeFunctionStreamRead(handle); got != "null" {
		t.Errorf("a read after close = %s, want null", got)
	}

	if got := bridgeFunctionStreamClose(handle); got != "{}" {
		t.Errorf("a second close = %s, want {}", got)
	}
}

func TestClosingAStreamEndsAReadThatIsWaiting(t *testing.T) {
	t.Parallel()

	waiting := make(chan struct{})

	hang := functionsfx.StreamHandler[countRequest, int](func(ctx context.Context, _ countRequest) iter.Seq2[int, error] {
		return func(func(int, error) bool) {
			close(waiting)
			<-ctx.Done()
		}
	})

	handle := openStream(t, streamRegistry(t, counter(t, "hang", hang)), `{"name":"hang","input":{}}`)
	answer := make(chan string, 1)

	go func() { answer <- bridgeFunctionStreamRead(handle) }()

	select {
	case <-waiting:
	case <-time.After(5 * time.Second):
		t.Fatal("the function did not start")
	}

	bridgeFunctionStreamClose(handle)

	select {
	case got := <-answer:
		if got != "null" {
			t.Errorf("the waiting read answered %s, want null", got)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("close did not end the read that was waiting for an item")
	}
}

func TestAPanicInAStreamFunctionIsAFailureItem(t *testing.T) {
	t.Parallel()

	boom := functionsfx.StreamHandler[countRequest, int](func(context.Context, countRequest) iter.Seq2[int, error] {
		return func(yield func(int, error) bool) {
			if yield(1, nil) {
				panic("boom")
			}
		}
	})

	handle := openStream(t, streamRegistry(t, counter(t, "boom", boom)), `{"name":"boom","input":{}}`)

	got := readAll(t, handle)
	if len(got) != 2 || got[0] != `{"output":1}` {
		t.Fatalf("items = %v, want the item and the failure", got)
	}

	if failure := decodeFunctionAnswer(t, got[1]); !strings.Contains(failure.Error, "boom") {
		t.Errorf("last item = %+v, want it to name the panic", failure)
	}
}

func TestCallingAStreamFunctionWithFunctionCallIsStreamOnly(t *testing.T) {
	t.Parallel()

	registry := streamRegistry(t, counter(t, "count", countingUp(0)))

	got := decodeFunctionAnswer(t, bridgeFunctionCall(registry)(`{"name":"count","input":{"to":2}}`))
	if got.ErrorKind != "StreamOnly" {
		t.Errorf("answered %+v, want errorKind StreamOnly", got)
	}
}

func TestTheDescriptorOfAStreamFunctionIsListedAsOne(t *testing.T) {
	t.Parallel()

	registry := streamRegistry(t, counter(t, "count", countingUp(0)))

	var listed struct {
		Functions []functionsfx.Descriptor `json:"functions"`
	}

	if err := json.Unmarshal([]byte(bridgeFunctionList(registry)("")), &listed); err != nil {
		t.Fatal(err)
	}

	if len(listed.Functions) != 1 || !listed.Functions[0].Stream {
		t.Errorf("functions = %+v, want one that streams", listed.Functions)
	}
}

func TestFunctionStreamIsAStreamNameOnTheHandshake(t *testing.T) {
	t.Parallel()

	var shake handshake
	if err := json.Unmarshal([]byte(exportVersion()), &shake); err != nil {
		t.Fatalf("decode handshake: %v", err)
	}

	if !slices.Contains(shake.Names, "functionStream") || !slices.Contains(shake.Streams, "functionStream") {
		t.Errorf("handshake names = %v, streams = %v, want functionStream among both", shake.Names, shake.Streams)
	}
}

func TestAStreamOfTheGlobalRegistryOpensThroughTheDispatcher(t *testing.T) {
	t.Parallel()

	// A stream function registered for this test only, under a name no other test
	// uses: the dispatcher serves the registry of the bridge.
	if err := bridgeFunctions.Register(counter(t, "dispatcher-count", countingUp(0))); err != nil && !errors.Is(err, functionsfx.ErrDuplicateFunction) {
		t.Fatalf("Register: %v", err)
	}

	env := decodeEnvelope(t, exportStreamOpen("functionStream", `{"name":"dispatcher-count","input":{"to":2}}`))
	if !env.OK || env.Result == nil {
		t.Fatalf("open envelope = %+v", env)
	}

	var opened struct {
		Handle string `json:"handle"`
	}

	if err := json.Unmarshal([]byte(*env.Result), &opened); err != nil || opened.Handle == "" {
		t.Fatalf("open answered %s (%v)", *env.Result, err)
	}

	first := decodeEnvelope(t, exportStreamRead(opened.Handle))
	if !first.OK || first.Result == nil || *first.Result != `{"output":1}` {
		t.Errorf("first read = %+v", first)
	}

	decodeEnvelope(t, exportStreamClose(opened.Handle))

	missing := decodeEnvelope(t, exportStreamOpen("functionStream", `{"name":"no-such-function"}`))
	if missing.OK || missing.Code != codeHandlerError {
		t.Errorf("an unknown function envelope = %+v, want HANDLER_ERROR", missing)
	}
}

func TestAStreamReadToItsEndReleasesItsHandle(t *testing.T) {
	t.Parallel()

	handle := openStream(t, streamRegistry(t, counter(t, "count", countingUp(0))), `{"name":"count","input":{"to":2}}`)
	readAll(t, handle)

	functionStreamMu.RLock()
	_, open := functionStreamHandles[handle]
	functionStreamMu.RUnlock()

	if open {
		t.Error("the handle of a stream read to its end is still held, so it counts against the stream cap until a close")
	}
}
