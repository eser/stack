// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !wasip1

package main

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/functionsfx"
)

type functionAnswer struct {
	Output    json.RawMessage `json:"output"`
	Error     string          `json:"error"`
	ErrorKind string          `json:"errorKind"`
}

func decodeFunctionAnswer(t *testing.T, answer string) functionAnswer {
	t.Helper()

	var decoded functionAnswer
	if err := json.Unmarshal([]byte(answer), &decoded); err != nil {
		t.Fatalf("decode %s: %v", answer, err)
	}

	return decoded
}

func registryOf(t *testing.T, functions ...functionsfx.Function) *functionsfx.Registry {
	t.Helper()

	registry := functionsfx.NewRegistry()

	for _, function := range functions {
		if err := registry.Register(function); err != nil {
			t.Fatalf("Register: %v", err)
		}
	}

	return registry
}

func echoFunction(t *testing.T, name string, options ...functionsfx.Option) functionsfx.Function {
	t.Helper()

	function, err := functionsfx.NewFunction(name,
		functionsfx.Handler[string, string](func(_ context.Context, input string) (string, error) {
			return name + ":" + input, nil
		}),
		options...,
	)
	if err != nil {
		t.Fatalf("NewFunction(%q): %v", name, err)
	}

	return function
}

func TestBridgeFunctionCall(t *testing.T) {
	t.Parallel()

	failing, err := functionsfx.NewFunction("failing",
		functionsfx.Handler[string, string](func(context.Context, string) (string, error) {
			return "", errors.New("disk full")
		}),
	)
	if err != nil {
		t.Fatalf("NewFunction: %v", err)
	}

	silent, err := functionsfx.NewFunction("silent",
		functionsfx.Handler[string, string](func(context.Context, string) (string, error) {
			return "", functionsfx.NewValidationError("")
		}),
	)
	if err != nil {
		t.Fatalf("NewFunction: %v", err)
	}

	typed, err := functionsfx.NewFunction("typed",
		functionsfx.Handler[string, string](func(_ context.Context, input string) (string, error) {
			return input, nil
		}),
		functionsfx.WithInputSchema(json.RawMessage(`{"type":"string","minLength":2}`)),
	)
	if err != nil {
		t.Fatalf("NewFunction: %v", err)
	}

	nothing, err := functionsfx.NewFunction("nothing",
		functionsfx.Handler[string, *string](func(context.Context, string) (*string, error) {
			return nil, nil //nolint:nilnil
		}),
	)
	if err != nil {
		t.Fatalf("NewFunction: %v", err)
	}

	registry := registryOf(t, echoFunction(t, "echo"), failing, silent, typed, nothing)

	tests := []struct {
		name       string
		request    string
		wantOutput string
		wantError  bool
		wantKind   string
	}{
		{name: "answers the output", request: `{"name":"echo","input":"hi"}`, wantOutput: `"echo:hi"`},
		{name: "a null output is an answer", request: `{"name":"nothing","input":"x"}`, wantOutput: `null`},
		{name: "an error keeps no kind when it has none", request: `{"name":"failing","input":"x"}`, wantError: true},
		{
			name: "an input the schema refuses is a ValidationError", request: `{"name":"typed","input":"x"}`,
			wantError: true, wantKind: "ValidationError",
		},
		{
			name: "an error with an empty message still fails", request: `{"name":"silent","input":"x"}`,
			wantError: true, wantKind: "ValidationError",
		},
		{
			name: "an unknown function", request: `{"name":"missing","input":"x"}`,
			wantError: true, wantKind: "UnknownFunction",
		},
		{name: "a request that is not JSON", request: `{"name":`, wantError: true},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			got := decodeFunctionAnswer(t, bridgeFunctionCall(registry)(tc.request))

			if tc.wantError {
				if got.Error == "" {
					t.Fatalf("answered %+v, want an error", got)
				}

				if got.ErrorKind != tc.wantKind {
					t.Errorf("errorKind = %q, want %q", got.ErrorKind, tc.wantKind)
				}

				return
			}

			if got.Error != "" || string(got.Output) != tc.wantOutput {
				t.Errorf("answered %+v, want output %s", got, tc.wantOutput)
			}
		})
	}
}

func TestBridgeFunctionCallErrorsFailTheEnvelope(t *testing.T) {
	t.Parallel()

	registry := registryOf(t, echoFunction(t, "echo"))
	answer := bridgeFunctionCall(registry)(`{"name":"missing"}`)

	env := answered(answer, false)
	if env.OK || env.Code != codeHandlerError {
		t.Errorf("envelope = %+v, want a HANDLER_ERROR so a host sees the failure", env)
	}
}

func TestBridgeFunctionCallStopsOnCancel(t *testing.T) {
	t.Parallel()

	started := make(chan struct{})
	stopped := make(chan struct{})

	blocking, err := functionsfx.NewFunction("block",
		functionsfx.Handler[string, string](func(ctx context.Context, _ string) (string, error) {
			close(started)
			<-ctx.Done()
			close(stopped)

			return "", ctx.Err()
		}),
	)
	if err != nil {
		t.Fatalf("NewFunction: %v", err)
	}

	call := bridgeFunctionCall(registryOf(t, blocking))
	answer := make(chan string, 1)

	go func() { answer <- call(`{"name":"block","input":"x","requestId":"fn-cancel-running"}`) }()

	select {
	case <-started:
	case <-time.After(5 * time.Second):
		t.Fatal("the function did not start")
	}

	if !cancelAIRequest("fn-cancel-running") {
		t.Fatal("cancelAIRequest found no running call")
	}

	select {
	case <-stopped:
	case <-time.After(5 * time.Second):
		t.Fatal("the function did not see its context end")
	}

	select {
	case got := <-answer:
		if decoded := decodeFunctionAnswer(t, got); decoded.ErrorKind != "AbortError" {
			t.Errorf("answered %+v, want errorKind AbortError", decoded)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("the call did not return after the cancel")
	}
}

func TestBridgeFunctionCallHonorsACancelThatCameFirst(t *testing.T) {
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

	cancelAIRequest("fn-cancel-early")

	got := decodeFunctionAnswer(t,
		bridgeFunctionCall(registryOf(t, function))(`{"name":"noop","input":"x","requestId":"fn-cancel-early"}`))

	if got.ErrorKind != "AbortError" {
		t.Errorf("answered %+v, want errorKind AbortError", got)
	}

	if ran {
		t.Error("the function ran after its call was cancelled")
	}
}

func TestBridgeFunctionList(t *testing.T) {
	t.Parallel()

	registry := registryOf(t,
		echoFunction(t, "b-second", functionsfx.WithDescription("the second")),
		echoFunction(t, "a-first", functionsfx.WithWASM(), functionsfx.WithTriggers(functionsfx.TriggerCLI)),
	)

	decode := func(answer string) []functionsfx.Descriptor {
		var decoded struct {
			Functions []functionsfx.Descriptor `json:"functions"`
		}

		if err := json.Unmarshal([]byte(answer), &decoded); err != nil {
			t.Fatalf("decode %s: %v", answer, err)
		}

		if decoded.Functions == nil {
			t.Fatalf("functions is null in %s, want an array", answer)
		}

		return decoded.Functions
	}

	listed := decode(bridgeFunctionList(registry)(""))

	if len(listed) != 2 || listed[0].Name != "a-first" || listed[1].Name != "b-second" {
		t.Fatalf("list = %+v, want a-first then b-second", listed)
	}

	if !listed[0].WASM || !slices.Equal(listed[0].Triggers, []functionsfx.TriggerKind{functionsfx.TriggerCLI}) {
		t.Errorf("descriptor a-first = %+v, want WASM and the cli trigger to cross", listed[0])
	}

	if listed[1].WASM || listed[1].Description != "the second" {
		t.Errorf("descriptor b-second = %+v, want WASM false and its description", listed[1])
	}

	if got := decode(bridgeFunctionList(registryOf(t))("")); len(got) != 0 {
		t.Errorf("empty registry list = %v, want none", got)
	}
}

func TestFunctionNamesAreGenericOnTheHandshake(t *testing.T) {
	t.Parallel()

	var shake handshake
	if err := json.Unmarshal([]byte(exportVersion()), &shake); err != nil {
		t.Fatalf("decode handshake: %v", err)
	}

	for _, name := range []string{"functionCall", "functionList"} {
		if !slices.Contains(shake.Names, name) {
			t.Errorf("handshake names lack %q", name)
		}
	}

	if slices.Contains(shake.Streams, "functionCall") || slices.Contains(shake.Streams, "functionList") {
		t.Error("a function name is listed as a stream")
	}

	// Three generic names serve every function: a call, the list and the stream.
	generic := []string{"functionCall", "functionList", "functionStream"}

	for _, name := range shake.Names {
		if strings.HasPrefix(name, "function") && !slices.Contains(generic, name) {
			t.Errorf("handshake lists a per-function name %q", name)
		}
	}
}

func TestFunctionCallReachesTheRegistryThroughTheDispatcher(t *testing.T) {
	t.Parallel()

	env := decodeEnvelope(t, exportCall("functionList", ""))
	if !env.OK || env.Result == nil {
		t.Fatalf("envelope = %+v, want an answer", env)
	}

	var decoded struct {
		Functions []json.RawMessage `json:"functions"`
	}

	if err := json.Unmarshal([]byte(*env.Result), &decoded); err != nil || decoded.Functions == nil {
		t.Errorf("result %s is not a functions array (%v)", *env.Result, err)
	}

	missing := decodeEnvelope(t, exportCall("functionCall", `{"name":"no-such-function","input":null}`))
	if missing.OK || missing.Code != codeHandlerError {
		t.Errorf("unknown function envelope = %+v, want HANDLER_ERROR", missing)
	}
}

func TestTheValidatorsAreFunctionsOfTheBridge(t *testing.T) {
	t.Parallel()

	var listed struct {
		Functions []functionsfx.Descriptor `json:"functions"`
	}

	env := decodeEnvelope(t, exportCall("functionList", ""))
	if !env.OK || env.Result == nil {
		t.Fatalf("functionList envelope = %+v", env)
	}

	if err := json.Unmarshal([]byte(*env.Result), &listed); err != nil {
		t.Fatalf("decode %s: %v", *env.Result, err)
	}

	names := make([]string, 0, len(listed.Functions))
	for _, descriptor := range listed.Functions {
		names = append(names, descriptor.Name)
	}

	for _, want := range []string{"validate-eof", "validate-secrets", "validate-circular-deps", "codebase-eof"} {
		if !slices.Contains(names, want) {
			t.Errorf("functionList lacks %q (has %d functions)", want, len(names))
		}
	}
}

func TestAValidatorRunsThroughFunctionCall(t *testing.T) {
	t.Parallel()

	root := t.TempDir()

	if err := os.WriteFile(filepath.Join(root, "a.txt"), []byte("no newline"), 0o600); err != nil {
		t.Fatal(err)
	}

	request, err := json.Marshal(map[string]any{"name": "validate-eof", "input": map[string]any{"root": root}})
	if err != nil {
		t.Fatal(err)
	}

	env := decodeEnvelope(t, exportCall("functionCall", string(request)))
	if !env.OK || env.Result == nil {
		t.Fatalf("envelope = %+v, want an answer", env)
	}

	var answer struct {
		Output struct {
			Passed bool `json:"passed"`
			Issues []struct {
				Message string `json:"message"`
			} `json:"issues"`
		} `json:"output"`
	}

	if err := json.Unmarshal([]byte(*env.Result), &answer); err != nil {
		t.Fatalf("decode %s: %v", *env.Result, err)
	}

	if answer.Output.Passed || len(answer.Output.Issues) != 1 {
		t.Fatalf("output = %+v, want one issue and a failed check", answer.Output)
	}

	if !strings.Contains(answer.Output.Issues[0].Message, "a.txt: file does not end with a newline") {
		t.Errorf("issue = %q", answer.Output.Issues[0].Message)
	}
}

func TestAValidatorRefusesAnInputOfTheWrongShape(t *testing.T) {
	t.Parallel()

	env := decodeEnvelope(t, exportCall("functionCall", `{"name":"validate-large-files","input":{"maxKb":"big"}}`))
	if env.OK || env.Result == nil {
		t.Fatalf("envelope = %+v, want a failure that carries its kind", env)
	}

	got := decodeFunctionAnswer(t, *env.Result)
	if got.ErrorKind != "ValidationError" {
		t.Errorf("answered %+v, want errorKind ValidationError from the input schema", got)
	}
}
