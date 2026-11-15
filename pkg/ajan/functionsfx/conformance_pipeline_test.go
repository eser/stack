// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package functionsfx_test

import (
	"context"
	"encoding/json"
	"iter"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/eser/stack/pkg/ajan/functionsfx"
)

// The cases of testdata/conformance/pipeline_cases.json are run by this file for
// functionsfx and by conformance-pipeline.test.ts for collect in
// @eserstack/functions. A middleware is written as data, a list of actions,
// which each language plays with its own pipeline.

type pipelineCases struct {
	Pipeline []pipelineCase `json:"pipeline"`
}

// action is one thing a middleware does, written as data. Exactly one field is
// set.
type action struct {
	Emit      json.RawMessage `json:"emit"`
	Fail      *wantError      `json:"fail"`
	SetState  *stateWrite     `json:"setState"`
	EmitArg   *int            `json:"emitArg"`
	EmitState string          `json:"emitState"`
	Next      bool            `json:"next"`
}

type stateWrite struct {
	Key   string          `json:"key"`
	Value json.RawMessage `json:"value"`
}

type pipelineCase struct {
	Want struct {
		Error *wantError        `json:"error"`
		OK    json.RawMessage   `json:"ok"`
		Items []json.RawMessage `json:"items"`
	} `json:"want"`
	Name       string     `json:"name"`
	Method     string     `json:"method"`
	MapError   string     `json:"mapError"`
	Recover    string     `json:"recover"`
	Middleware [][]action `json:"middleware"`
	Args       []any      `json:"args"`
	Runs       int        `json:"runs"`
}

func readPipelineCases(t *testing.T) []pipelineCase {
	t.Helper()

	data, err := os.ReadFile(filepath.Join("testdata", "conformance", "pipeline_cases.json"))
	if err != nil {
		t.Fatalf("read fixtures: %v", err)
	}

	var cases pipelineCases
	if err := json.Unmarshal(data, &cases); err != nil {
		t.Fatalf("decode fixtures: %v", err)
	}

	if len(cases.Pipeline) == 0 {
		t.Fatal("the fixtures hold no pipeline case")
	}

	return cases.Pipeline
}

// middlewareOf plays a list of actions as a middleware.
func middlewareOf(t *testing.T, actions []action) functionsfx.Middleware[any] {
	t.Helper()

	return func(_ context.Context, step *functionsfx.Step[any], args ...any) iter.Seq2[any, error] {
		return func(yield func(any, error) bool) {
			for _, a := range actions {
				switch {
				case a.Emit != nil:
					if !yield(decoded(t, a.Emit), nil) {
						return
					}
				case a.Fail != nil:
					if !yield(nil, errorOf(a.Fail)) {
						return
					}
				case a.Next:
					for value, err := range step.Next() {
						if !yield(value, err) {
							return
						}
					}
				case a.SetState != nil:
					step.State[a.SetState.Key] = decoded(t, a.SetState.Value)
				case a.EmitState != "":
					if !yield(step.State[a.EmitState], nil) {
						return
					}
				case a.EmitArg != nil:
					if !yield(args[*a.EmitArg], nil) {
						return
					}
				}
			}
		}
	}
}

func TestConformancePipeline(t *testing.T) {
	t.Parallel()

	for _, tc := range readPipelineCases(t) {
		t.Run(tc.Name, func(t *testing.T) {
			t.Parallel()

			pipeline := functionsfx.NewPipeline[any]()
			for _, actions := range tc.Middleware {
				pipeline.Use(middlewareOf(t, actions))
			}

			if tc.MapError == "to-abort" {
				pipeline.MapError(func(err error) error {
					return functionsfx.NewAbortError("mapped: " + functionsfx.MessageOf(err))
				})
			}

			if tc.Recover == "fallback" {
				pipeline.Recover(func(error) any { return "fallback" })
			}

			runs := max(tc.Runs, 1)

			for range runs {
				switch tc.Method {
				case "run":
					got, err := pipeline.Run(t.Context(), tc.Args...)
					check(t, got, err, bindWant{OK: tc.Want.OK, Error: tc.Want.Error})
				case "runFirst":
					got, err := pipeline.RunFirst(t.Context(), tc.Args...)
					check(t, got, err, bindWant{OK: tc.Want.OK, Error: tc.Want.Error})
				case "runLast":
					got, err := pipeline.RunLast(t.Context(), tc.Args...)
					check(t, got, err, bindWant{OK: tc.Want.OK, Error: tc.Want.Error})
				case "iterate":
					checkItems(t, pipeline, &tc)
				default:
					t.Fatalf("no method %q", tc.Method)
				}
			}
		})
	}
}

// checkItems compares every item Iterate emits, a failure included.
func checkItems(t *testing.T, pipeline *functionsfx.Pipeline[any], tc *pipelineCase) {
	t.Helper()

	got := []any{}

	for value, err := range pipeline.Iterate(t.Context(), tc.Args...) {
		if err != nil {
			got = append(got, map[string]any{"error": map[string]any{
				"kind":    string(functionsfx.KindOf(err)),
				"message": functionsfx.MessageOf(err),
			}})

			continue
		}

		got = append(got, map[string]any{"ok": value})
	}

	want := make([]any, 0, len(tc.Want.Items))
	for _, item := range tc.Want.Items {
		want = append(want, decoded(t, item))
	}

	if !reflect.DeepEqual(canonical(t, got), canonical(t, want)) {
		t.Errorf("items = %s, want %s", mustJSON(t, got), mustJSON(t, want))
	}
}

func mustJSON(t *testing.T, value any) string {
	t.Helper()

	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}

	return string(encoded)
}
