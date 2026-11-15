// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package functionsfx_test

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/functionsfx"
)

// The cases of testdata/conformance/task_cases.json are run by this file for
// functionsfx and by conformance-tasks.test.ts for @eserstack/functions. They
// cover the combinators of task.ts and the helpers of resources.ts, so a case
// that passes on both shows the two behave the same. A case where they differ
// on purpose says so in its name and gives an expectation for each language.

type taskCases struct {
	Validate         []validateCase `json:"validate"`
	Map              []mapCase      `json:"map"`
	Then             []thenCase     `json:"then"`
	All              []allCase      `json:"all"`
	AllPar           []allCase      `json:"allPar"`
	Retry            []retryCase    `json:"retry"`
	RetryWithBackoff []backoffCase  `json:"retryWithBackoff"`
	Scope            []scopeCase    `json:"scope"`
	Bracket          []bracketCase  `json:"bracket"`
	Ensure           []ensureCase   `json:"ensure"`
}

// taskSpec is a task written as data: it answers a value or an error.
type taskSpec struct {
	Error *wantError      `json:"error"`
	OK    json.RawMessage `json:"ok"`
}

type validateCase struct {
	Want      bindWant `json:"want"`
	Name      string   `json:"name"`
	Predicate string   `json:"predicate"`
	Message   string   `json:"message"`
	Input     any      `json:"input"`
}

type mapCase struct {
	Want   bindWant `json:"want"`
	Name   string   `json:"name"`
	Task   taskSpec `json:"task"`
	Mapped bool     `json:"mapped"`
}

type thenCase struct {
	Want    bindWant `json:"want"`
	Name    string   `json:"name"`
	Next    string   `json:"next"`
	First   taskSpec `json:"first"`
	RanNext bool     `json:"ranNext"`
}

type allCase struct {
	Want  bindWant   `json:"want"`
	Name  string     `json:"name"`
	Tasks []taskSpec `json:"tasks"`
	Ran   []int      `json:"ran"`
}

type retryCase struct {
	Want     bindWant `json:"want"`
	Name     string   `json:"name"`
	Delays   []int64  `json:"delays"`
	Attempts int      `json:"attempts"`
	DelayMs  int64    `json:"delayMs"`
	Failures int      `json:"failures"`
	Calls    int      `json:"calls"`
}

type backoffCase struct {
	Want             bindWant `json:"want"`
	Name             string   `json:"name"`
	Delays           []int64  `json:"delays"`
	DelaysByLanguage struct {
		Go []int64 `json:"go"`
	} `json:"delaysByLanguage"`
	Backoff struct {
		MaxAttempts  int     `json:"maxAttempts"`
		InitialDelay int64   `json:"initialDelay"`
		MaxDelay     int64   `json:"maxDelay"`
		Factor       float64 `json:"factor"`
	} `json:"backoff"`
	Failures int `json:"failures"`
	Calls    int `json:"calls"`
}

type scopeCase struct {
	Name       string `json:"name"`
	Finalizers []struct {
		Name  string `json:"name"`
		Fails bool   `json:"fails"`
	} `json:"finalizers"`
	Want struct {
		Order              []string `json:"order"`
		CloseFails         bool     `json:"closeFails"`
		AddAfterCloseFails bool     `json:"addAfterCloseFails"`
	} `json:"want"`
	CloseTwice    bool `json:"closeTwice"`
	AddAfterClose bool `json:"addAfterClose"`
}

type bracketCase struct {
	Name    string `json:"name"`
	Variant string `json:"variant"`
	Acquire string `json:"acquire"`
	Use     string `json:"use"`
	Release string `json:"release"`
	Want    struct {
		Outcome bindWant `json:"outcome"`
		Events  []string `json:"events"`
	} `json:"want"`
}

type ensureCase struct {
	Name string   `json:"name"`
	Task taskSpec `json:"task"`
	Want struct {
		Outcome bindWant `json:"outcome"`
		Events  []string `json:"events"`
	} `json:"want"`
}

func readTaskCases(t *testing.T) taskCases {
	t.Helper()

	data, err := os.ReadFile(filepath.Join("testdata", "conformance", "task_cases.json"))
	if err != nil {
		t.Fatalf("read fixtures: %v", err)
	}

	var cases taskCases
	if err := json.Unmarshal(data, &cases); err != nil {
		t.Fatalf("decode fixtures: %v", err)
	}

	if len(cases.Validate) == 0 || len(cases.Retry) == 0 || len(cases.Scope) == 0 || len(cases.Bracket) == 0 {
		t.Fatalf("the fixtures miss a group: %+v", cases)
	}

	return cases
}

// errorOf builds the error a fixture names: one of the three kinds of
// functionsfx, or a plain error when the kind is empty.
func errorOf(spec *wantError) error {
	switch spec.Kind {
	case "ValidationError":
		return functionsfx.NewValidationError(spec.Message)
	case "AbortError":
		return functionsfx.NewAbortError(spec.Message)
	case "AdaptError":
		return functionsfx.NewAdaptError(spec.Message, nil)
	default:
		return errors.New(spec.Message) //nolint:err113
	}
}

// decoded reads a fixture value the way it is compared: as JSON decodes it.
func decoded(t *testing.T, raw json.RawMessage) any {
	t.Helper()

	var value any
	if err := json.Unmarshal(raw, &value); err != nil {
		t.Fatalf("decode %s: %v", raw, err)
	}

	return value
}

// taskOf builds the task of a spec. It calls ran when it runs.
func taskOf(t *testing.T, spec taskSpec, ran func()) functionsfx.Task[any] {
	t.Helper()

	if spec.Error != nil {
		failure := errorOf(spec.Error)

		return func(context.Context) (any, error) {
			ran()

			return nil, failure
		}
	}

	value := decoded(t, spec.OK)

	return func(context.Context) (any, error) {
		ran()

		return value, nil
	}
}

// check compares what a task gave with what the fixture wants.
func check(t *testing.T, got any, err error, want bindWant) {
	t.Helper()

	if want.Error != nil {
		if err == nil {
			t.Fatalf("got %v, want error %+v", got, *want.Error)
		}

		gotError := wantError{Kind: string(functionsfx.KindOf(err)), Message: functionsfx.MessageOf(err)}
		if gotError != *want.Error {
			t.Errorf("error = %+v, want %+v", gotError, *want.Error)
		}

		return
	}

	if err != nil {
		t.Fatalf("got error %v, want %s", err, want.OK)
	}

	if !reflect.DeepEqual(canonical(t, got), decoded(t, want.OK)) {
		t.Errorf("value = %v, want %s", got, want.OK)
	}
}

// recorder is the wait of a retry in a test: it keeps the positive delays, in
// milliseconds, and never waits.
type recorder struct {
	delays []int64
	mu     sync.Mutex
}

func (r *recorder) sleep(_ context.Context, d time.Duration) error {
	if d > 0 {
		r.mu.Lock()
		r.delays = append(r.delays, d.Milliseconds())
		r.mu.Unlock()
	}

	return nil
}

func equalDelays(got, want []int64) bool {
	return len(got) == len(want) && (len(got) == 0 || reflect.DeepEqual(got, want))
}

func TestConformanceValidate(t *testing.T) {
	t.Parallel()

	predicates := map[string]func(any) bool{
		"contains-at": func(value any) bool { text, _ := value.(string); return strings.Contains(text, "@") },
	}

	for _, tc := range readTaskCases(t).Validate {
		t.Run(tc.Name, func(t *testing.T) {
			t.Parallel()

			got, err := functionsfx.Validate(predicates[tc.Predicate], tc.Message)(tc.Input)(t.Context())

			check(t, got, err, tc.Want)
		})
	}
}

func TestConformanceMap(t *testing.T) {
	t.Parallel()

	for _, tc := range readTaskCases(t).Map {
		t.Run(tc.Name, func(t *testing.T) {
			t.Parallel()

			mapped := false
			double := func(value any) any {
				mapped = true
				number, _ := value.(float64)

				return number * 2
			}

			got, err := functionsfx.Map(taskOf(t, tc.Task, func() {}), double)(t.Context())

			check(t, got, err, tc.Want)

			if mapped != tc.Mapped {
				t.Errorf("function ran = %v, want %v", mapped, tc.Mapped)
			}
		})
	}
}

func TestConformanceThen(t *testing.T) {
	t.Parallel()

	for _, tc := range readTaskCases(t).Then {
		t.Run(tc.Name, func(t *testing.T) {
			t.Parallel()

			ranNext := false
			next := func(value any) functionsfx.Task[any] {
				ranNext = true

				if tc.Next == "too-big" {
					return functionsfx.Fail[any](functionsfx.NewValidationError("too big"))
				}

				number, _ := value.(float64)

				return functionsfx.Succeed[any](number + 10)
			}

			got, err := functionsfx.Then(taskOf(t, tc.First, func() {}), next)(t.Context())

			check(t, got, err, tc.Want)

			if ranNext != tc.RanNext {
				t.Errorf("next ran = %v, want %v", ranNext, tc.RanNext)
			}
		})
	}
}

func TestConformanceAll(t *testing.T) {
	t.Parallel()

	for _, tc := range readTaskCases(t).All {
		t.Run(tc.Name, func(t *testing.T) {
			t.Parallel()

			ran := []int{}
			tasks := make([]functionsfx.Task[any], 0, len(tc.Tasks))

			for index, spec := range tc.Tasks {
				tasks = append(tasks, taskOf(t, spec, func() { ran = append(ran, index) }))
			}

			got, err := functionsfx.All(tasks)(t.Context())

			check(t, got, err, tc.Want)

			if !equalInts(ran, tc.Ran) {
				t.Errorf("ran = %v, want %v", ran, tc.Ran)
			}
		})
	}
}

func equalInts(got, want []int) bool {
	return len(got) == len(want) && (len(got) == 0 || reflect.DeepEqual(got, want))
}

func TestConformanceAllPar(t *testing.T) {
	t.Parallel()

	for _, tc := range readTaskCases(t).AllPar {
		t.Run(tc.Name, func(t *testing.T) {
			t.Parallel()

			tasks := make([]functionsfx.Task[any], 0, len(tc.Tasks))
			for _, spec := range tc.Tasks {
				tasks = append(tasks, taskOf(t, spec, func() {}))
			}

			got, err := functionsfx.AllPar(tasks)(t.Context())

			check(t, got, err, tc.Want)
		})
	}
}

// flaky fails its first failures calls with "flaky N" and then answers "done".
func flaky(failures int, calls *int) functionsfx.Task[any] {
	return func(context.Context) (any, error) {
		*calls++

		if *calls <= failures {
			return nil, fmt.Errorf("flaky %d", *calls) //nolint:err113
		}

		return "done", nil
	}
}

func TestConformanceRetry(t *testing.T) {
	t.Parallel()

	for _, tc := range readTaskCases(t).Retry {
		t.Run(tc.Name, func(t *testing.T) {
			t.Parallel()

			calls := 0
			waits := &recorder{}

			got, err := functionsfx.Retry(flaky(tc.Failures, &calls), tc.Attempts,
				time.Duration(tc.DelayMs)*time.Millisecond, functionsfx.WithSleeper(waits.sleep))(t.Context())

			check(t, got, err, tc.Want)

			if calls != tc.Calls {
				t.Errorf("calls = %d, want %d", calls, tc.Calls)
			}

			if !equalDelays(waits.delays, tc.Delays) {
				t.Errorf("delays = %v, want %v", waits.delays, tc.Delays)
			}
		})
	}
}

func TestConformanceRetryWithBackoff(t *testing.T) {
	t.Parallel()

	for _, tc := range readTaskCases(t).RetryWithBackoff {
		t.Run(tc.Name, func(t *testing.T) {
			t.Parallel()

			// A case that differs between the languages gives the Go delays apart.
			want := tc.Delays
			if tc.DelaysByLanguage.Go != nil {
				want = tc.DelaysByLanguage.Go
			}

			calls := 0
			waits := &recorder{}

			got, err := functionsfx.RetryWithBackoff(flaky(tc.Failures, &calls), functionsfx.Backoff{
				MaxAttempts:  tc.Backoff.MaxAttempts,
				InitialDelay: time.Duration(tc.Backoff.InitialDelay) * time.Millisecond,
				MaxDelay:     time.Duration(tc.Backoff.MaxDelay) * time.Millisecond,
				Factor:       tc.Backoff.Factor,
			}, functionsfx.WithSleeper(waits.sleep))(t.Context())

			check(t, got, err, tc.Want)

			if calls != tc.Calls {
				t.Errorf("calls = %d, want %d", calls, tc.Calls)
			}

			if !equalDelays(waits.delays, want) {
				t.Errorf("delays = %v, want %v", waits.delays, want)
			}
		})
	}
}

func TestConformanceScope(t *testing.T) {
	t.Parallel()

	for _, tc := range readTaskCases(t).Scope {
		t.Run(tc.Name, func(t *testing.T) {
			t.Parallel()

			scope := functionsfx.NewScope()
			order := []string{}

			for _, finalizer := range tc.Finalizers {
				if err := scope.AddFinalizer(func() error {
					order = append(order, finalizer.Name)

					if finalizer.Fails {
						return errors.New("finalizer failed") //nolint:err113
					}

					return nil
				}); err != nil {
					t.Fatalf("AddFinalizer: %v", err)
				}
			}

			closeErr := scope.Close()
			if tc.CloseTwice {
				if again := scope.Close(); again != nil {
					t.Errorf("a second Close = %v, want nil", again)
				}
			}

			if (closeErr != nil) != tc.Want.CloseFails {
				t.Errorf("Close error = %v, want failure %v", closeErr, tc.Want.CloseFails)
			}

			if !reflect.DeepEqual(order, tc.Want.Order) {
				t.Errorf("order = %v, want %v", order, tc.Want.Order)
			}

			if tc.AddAfterClose {
				addErr := scope.AddFinalizer(func() error { return nil })
				if (addErr != nil) != tc.Want.AddAfterCloseFails {
					t.Errorf("AddFinalizer after Close error = %v, want failure %v", addErr, tc.Want.AddAfterCloseFails)
				}
			}
		})
	}
}

func TestConformanceBracket(t *testing.T) {
	t.Parallel()

	for _, tc := range readTaskCases(t).Bracket {
		t.Run(tc.Name, func(t *testing.T) {
			t.Parallel()

			events := []string{}
			step := func(name, mode, message string, value any) (any, error) {
				events = append(events, name)

				if mode == "fail" {
					return nil, functionsfx.NewValidationError(message)
				}

				return value, nil
			}

			acquire := func(context.Context) (any, error) { return step("acquire", tc.Acquire, "acquire failed", "resource") }
			use := func(any) functionsfx.Task[any] {
				return func(context.Context) (any, error) { return step("use", tc.Use, "use failed", "used") }
			}

			var task functionsfx.Task[any]

			switch tc.Variant {
			case "bracket":
				task = functionsfx.Bracket(acquire, use, func(any) { events = append(events, "release") })
			default:
				task = functionsfx.BracketWithReleaseError(acquire, use, func(any) error {
					_, err := step("release", tc.Release, "release failed", nil)

					return err
				})
			}

			got, err := task(t.Context())

			check(t, got, err, tc.Want.Outcome)

			if !reflect.DeepEqual(events, tc.Want.Events) {
				t.Errorf("events = %v, want %v", events, tc.Want.Events)
			}
		})
	}
}

func TestConformanceEnsure(t *testing.T) {
	t.Parallel()

	for _, tc := range readTaskCases(t).Ensure {
		t.Run(tc.Name, func(t *testing.T) {
			t.Parallel()

			events := []string{}
			task := functionsfx.Ensure(taskOf(t, tc.Task, func() { events = append(events, "task") }), func() error {
				events = append(events, "finalizer")

				return nil
			})

			got, err := task(t.Context())

			check(t, got, err, tc.Want.Outcome)

			if !reflect.DeepEqual(events, tc.Want.Events) {
				t.Errorf("events = %v, want %v", events, tc.Want.Events)
			}
		})
	}
}
