// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package functionsfx_test

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/functionsfx"
)

// The cases of testdata/conformance are data both languages run: this file
// for functionsfx, and conformance.test.ts in @eserstack/functions for the
// TypeScript model. Each side implements the same named handlers, adapters and
// mappers below, so a case that passes on both shows the two bind, build
// triggers and name errors the same way.

type conformanceFile struct {
	Bind    []bindCase    `json:"bind"`
	Trigger []triggerCase `json:"trigger"`
}

type bindCase struct {
	Want    bindWant `json:"want"`
	Name    string   `json:"name"`
	Handler string   `json:"handler"`
	Adapter string   `json:"adapter"`
	Event   any      `json:"event"`
}

type bindWant struct {
	Error *wantError      `json:"error"`
	OK    json.RawMessage `json:"ok"`
}

type wantError struct {
	Kind    string `json:"kind"`
	Message string `json:"message"`
}

type triggerCase struct {
	Want    any    `json:"want"`
	Event   any    `json:"event"`
	Name    string `json:"name"`
	Handler string `json:"handler"`
	Adapter string `json:"adapter"`
	Mapper  string `json:"mapper"`
}

func readConformance(t *testing.T) conformanceFile {
	t.Helper()

	data, err := os.ReadFile(filepath.Join("testdata", "conformance", "handler_cases.json"))
	if err != nil {
		t.Fatalf("read fixtures: %v", err)
	}

	var file conformanceFile
	if err := json.Unmarshal(data, &file); err != nil {
		t.Fatalf("decode fixtures: %v", err)
	}

	if len(file.Bind) == 0 || len(file.Trigger) == 0 {
		t.Fatalf("fixtures hold %d bind and %d trigger cases, want both", len(file.Bind), len(file.Trigger))
	}

	return file
}

var conformanceHandlers = map[string]functionsfx.Handler[any, any]{
	"greet": func(_ context.Context, input any) (any, error) {
		return fmt.Sprintf("Hello, %v", input), nil
	},
	"require-email": func(_ context.Context, input any) (any, error) {
		email, ok := input.(string)
		if !ok || !strings.Contains(email, "@") {
			return nil, functionsfx.NewValidationError("Invalid email address")
		}

		return email, nil
	},
	"always-abort": func(context.Context, any) (any, error) {
		return nil, functionsfx.NewAbortError("Operation aborted")
	},
}

var conformanceAdapters = map[string]functionsfx.Adapter[any, any]{
	"identity": func(event any) (any, error) { return event, nil },
	"http-query-name": func(event any) (any, error) {
		fields, _ := event.(map[string]any)
		query, _ := fields["query"].(map[string]any)

		if name, ok := query["name"].(string); ok {
			return name, nil
		}

		return "world", nil
	},
	"http-post-body": func(event any) (any, error) {
		fields, _ := event.(map[string]any)

		if method, _ := fields["method"].(string); method != "POST" {
			return nil, functionsfx.NewAdaptError("Method not allowed", nil)
		}

		return fields["body"], nil
	},
}

var conformanceMappers = map[string]functionsfx.ResponseMapper[any, any]{
	"http-response": func(output any, err error) any {
		if err == nil {
			return map[string]any{"status": 200, "headers": map[string]any{}, "body": output}
		}

		status := 500
		if functionsfx.IsKind(err, functionsfx.KindAdapt) {
			status = 400
		}

		return map[string]any{"status": status, "headers": map[string]any{}, "body": functionsfx.MessageOf(err)}
	},
}

// canonical turns a value into what JSON decoding makes of it, so an int the
// mapper wrote and a float64 the fixture decoded compare equal.
func canonical(t *testing.T, value any) any {
	t.Helper()

	data, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("encode %v: %v", value, err)
	}

	var decoded any
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("decode %s: %v", data, err)
	}

	return decoded
}

func TestConformanceBind(t *testing.T) {
	t.Parallel()

	for _, tc := range readConformance(t).Bind {
		t.Run(tc.Name, func(t *testing.T) {
			t.Parallel()

			bound := functionsfx.Bind(conformanceHandlers[tc.Handler], conformanceAdapters[tc.Adapter])

			got, err := bound(t.Context(), tc.Event)

			if tc.Want.Error != nil {
				if err == nil {
					t.Fatalf("got output %v, want error %+v", got, *tc.Want.Error)
				}

				gotError := wantError{Kind: string(functionsfx.KindOf(err)), Message: functionsfx.MessageOf(err)}
				if gotError != *tc.Want.Error {
					t.Errorf("error = %+v, want %+v", gotError, *tc.Want.Error)
				}

				return
			}

			if err != nil {
				t.Fatalf("got error %v, want output %s", err, tc.Want.OK)
			}

			var want any
			if err := json.Unmarshal(tc.Want.OK, &want); err != nil {
				t.Fatalf("decode want %s: %v", tc.Want.OK, err)
			}

			if !reflect.DeepEqual(canonical(t, got), want) {
				t.Errorf("output = %v, want %v", got, want)
			}
		})
	}
}

func TestConformanceTrigger(t *testing.T) {
	t.Parallel()

	for _, tc := range readConformance(t).Trigger {
		t.Run(tc.Name, func(t *testing.T) {
			t.Parallel()

			trigger, err := functionsfx.NewTrigger(functionsfx.TriggerBinding[any, any, any, any]{
				Handler:     conformanceHandlers[tc.Handler],
				AdaptInput:  conformanceAdapters[tc.Adapter],
				AdaptOutput: conformanceMappers[tc.Mapper],
			})
			if err != nil {
				t.Fatalf("NewTrigger: %v", err)
			}

			got := canonical(t, trigger(t.Context(), tc.Event))

			if !reflect.DeepEqual(got, tc.Want) {
				t.Errorf("response = %v, want %v", got, tc.Want)
			}
		})
	}
}
