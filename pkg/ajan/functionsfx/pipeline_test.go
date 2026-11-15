// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package functionsfx_test

import (
	"context"
	"errors"
	"iter"
	"reflect"
	"sync/atomic"
	"testing"

	"github.com/eser/stack/pkg/ajan/functionsfx"
	"github.com/eser/stack/pkg/ajan/streamfx"
)

// emitting is a middleware that emits the values and, when delegate is set,
// the rest of the chain in the middle.
func emitting(delegate bool, values ...string) functionsfx.Middleware[string] {
	return func(_ context.Context, step *functionsfx.Step[string], _ ...any) iter.Seq2[string, error] {
		return func(yield func(string, error) bool) {
			for _, value := range values {
				if !yield(value, nil) {
					return
				}
			}

			if delegate {
				for value, err := range step.Next() {
					if !yield(value, err) {
						return
					}
				}
			}
		}
	}
}

func TestIterateRunsNothingUntilItIsRangedOver(t *testing.T) {
	t.Parallel()

	var ran atomic.Bool

	pipeline := functionsfx.NewPipeline(func(context.Context, *functionsfx.Step[string], ...any) iter.Seq2[string, error] {
		ran.Store(true)

		return functionsfx.Emit("x")
	})

	sequence := pipeline.Iterate(t.Context())

	if ran.Load() {
		t.Fatal("a middleware ran before the sequence was ranged over")
	}

	for _, err := range sequence {
		if err != nil {
			t.Fatalf("the chain failed: %v", err)
		}
	}

	if !ran.Load() {
		t.Error("the middleware did not run when the sequence was ranged over")
	}
}

func TestStoppingTheLoopStopsTheChain(t *testing.T) {
	t.Parallel()

	var innerSawStop atomic.Bool

	inner := func(_ context.Context, _ *functionsfx.Step[string], _ ...any) iter.Seq2[string, error] {
		return func(yield func(string, error) bool) {
			if !yield("first", nil) {
				innerSawStop.Store(true)

				return
			}

			t.Error("the chain went on after the loop broke")
		}
	}

	pipeline := functionsfx.NewPipeline(emitting(true), inner)

	for value, err := range pipeline.Iterate(t.Context()) {
		if err != nil {
			t.Fatalf("the chain failed: %v", err)
		}

		if value == "first" {
			break
		}
	}

	if !innerSawStop.Load() {
		t.Error("the middleware did not see the loop stop")
	}
}

func TestRunStopsAtTheFirstFailureAndRunsNoMoreOfTheChain(t *testing.T) {
	t.Parallel()

	var after atomic.Bool

	pipeline := functionsfx.NewPipeline(
		func(context.Context, *functionsfx.Step[string], ...any) iter.Seq2[string, error] {
			return func(yield func(string, error) bool) {
				if !yield("a", nil) {
					return
				}

				if !yield("", errors.New("bad")) { //nolint:err113
					return
				}

				after.Store(true)

				yield("c", nil)
			}
		},
	)

	values, err := pipeline.Run(t.Context())

	if err == nil || values != nil {
		t.Errorf("Run = (%v, %v), want the failure", values, err)
	}

	if after.Load() {
		t.Error("the middleware went on after Run stopped at the failure")
	}
}

func TestTheContextEndsTheRun(t *testing.T) {
	t.Parallel()

	ctx, cancel := context.WithCancel(t.Context())
	cancel()

	_, err := functionsfx.NewPipeline(emitting(false, "a")).Run(ctx)

	if !functionsfx.IsKind(err, functionsfx.KindAbort) {
		t.Errorf("error = %v, want an abort", err)
	}
}

func TestUseAddsToTheChainAndAnswersThePipeline(t *testing.T) {
	t.Parallel()

	pipeline := functionsfx.NewPipeline(emitting(true, "a"))

	if same := pipeline.Use(emitting(false, "b")); same != pipeline {
		t.Error("Use answered another pipeline")
	}

	values, err := pipeline.Run(t.Context())
	if err != nil || !reflect.DeepEqual(values, []string{"a", "b"}) {
		t.Errorf("Run = (%v, %v)", values, err)
	}
}

func TestAPipelineRunsManyTimesAndAtTheSameTime(t *testing.T) {
	t.Parallel()

	pipeline := functionsfx.NewPipeline(emitting(true, "a"), emitting(false, "b"))
	done := make(chan []string, 8)

	for range 8 {
		go func() {
			values, _ := pipeline.Run(context.Background())
			done <- values
		}()
	}

	for range 8 {
		if got := <-done; !reflect.DeepEqual(got, []string{"a", "b"}) {
			t.Errorf("a concurrent run gave %v", got)
		}
	}
}

func TestEmitAndFailWithAreOneItemSequences(t *testing.T) {
	t.Parallel()

	for value, err := range functionsfx.Emit(7) {
		if value != 7 || err != nil {
			t.Errorf("Emit = (%d, %v)", value, err)
		}
	}

	failure := errors.New("no") //nolint:err113
	count := 0

	for _, err := range functionsfx.FailWith[int](failure) {
		count++

		if !errors.Is(err, failure) {
			t.Errorf("FailWith error = %v", err)
		}
	}

	if count != 1 {
		t.Errorf("FailWith gave %d items, want 1", count)
	}
}

// --- streamfx ---

func TestFromStreamEmitsTheDataOfTheChunks(t *testing.T) {
	t.Parallel()

	pipeline := functionsfx.NewPipeline(functionsfx.FromStream[string](streamfx.ValuesSource("words", "a", "b", "c")))

	values, err := pipeline.Run(t.Context())
	if err != nil || !reflect.DeepEqual(values, []string{"a", "b", "c"}) {
		t.Errorf("Run = (%v, %v)", values, err)
	}
}

func TestFromStreamFailsOnAChunkOfAnotherType(t *testing.T) {
	t.Parallel()

	pipeline := functionsfx.NewPipeline(functionsfx.FromStream[string](streamfx.ValuesSource("mixed", "a", 7)))

	_, err := pipeline.Run(t.Context())
	if err == nil {
		t.Fatal("Run succeeded, want a failure for the int chunk")
	}
}

func TestFromStreamStopsTheSourceWhenTheLoopBreaks(t *testing.T) {
	t.Parallel()

	opened := make(chan context.Context, 1)
	source := funcSource{name: "endless", open: func(ctx context.Context) (<-chan streamfx.Chunk, error) {
		opened <- ctx

		out := make(chan streamfx.Chunk)

		go func() {
			defer close(out)

			for {
				select {
				case out <- streamfx.NewChunk("x", streamfx.KindStructured):
				case <-ctx.Done():
					return
				}
			}
		}()

		return out, nil
	}}

	pipeline := functionsfx.NewPipeline(functionsfx.FromStream[string](source))

	for _, err := range pipeline.Iterate(t.Context()) {
		if err != nil {
			t.Fatalf("the chain failed: %v", err)
		}

		break
	}

	select {
	case ctx := <-opened:
		<-ctx.Done()
	default:
		t.Fatal("the source was not opened")
	}
}

type funcSource struct {
	open func(ctx context.Context) (<-chan streamfx.Chunk, error)
	name string
}

func (s funcSource) Name() string { return s.name }

func (s funcSource) Open(ctx context.Context) (<-chan streamfx.Chunk, error) { return s.open(ctx) }

func TestFromStreamReportsASourceThatCannotOpen(t *testing.T) {
	t.Parallel()

	failure := errors.New("no such file") //nolint:err113
	source := funcSource{name: "file", open: func(context.Context) (<-chan streamfx.Chunk, error) { return nil, failure }}

	_, err := functionsfx.NewPipeline(functionsfx.FromStream[string](source)).Run(t.Context())
	if !errors.Is(err, failure) {
		t.Errorf("error = %v, want it to reach the open failure", err)
	}
}

func TestAsSourceFeedsAStreamPipeline(t *testing.T) {
	t.Parallel()

	chain := functionsfx.NewPipeline(emitting(true, "a"), emitting(false, "b"))

	items, err := streamfx.New().From(chain.AsSource("chain")).Collect(t.Context())
	if err != nil || !reflect.DeepEqual(items, []any{"a", "b"}) {
		t.Errorf("Collect = (%v, %v)", items, err)
	}
}

func TestAsSourceSendsAFailureAsTheLastSignalChunk(t *testing.T) {
	t.Parallel()

	failure := errors.New("bad") //nolint:err113
	chain := functionsfx.NewPipeline(func(context.Context, *functionsfx.Step[string], ...any) iter.Seq2[string, error] {
		return func(yield func(string, error) bool) {
			if yield("a", nil) {
				yield("", failure)
			}
		}
	})

	chunks, err := chain.AsSource("chain").Open(t.Context())
	if err != nil {
		t.Fatal(err)
	}

	got := make([]streamfx.Chunk, 0, 2)
	for chunk := range chunks {
		got = append(got, chunk)
	}

	if len(got) != 2 {
		t.Fatalf("%d chunks, want a value and the failure", len(got))
	}

	last := got[1]
	if last.Meta.Kind != streamfx.KindSignal || last.Meta.Annotations["error"] != true || !errors.Is(last.Data.(error), failure) { //nolint:forcetypeassert,errorlint
		t.Errorf("last chunk = %+v, want a signal that carries the error", last)
	}
}

func TestIntoRunsTheChainIntoASink(t *testing.T) {
	t.Parallel()

	sink := streamfx.BufferSinkNew("buffer")

	err := functionsfx.NewPipeline(emitting(true, "a"), emitting(false, "b")).Into(t.Context(), sink)
	if err != nil {
		t.Fatalf("Into: %v", err)
	}

	if got := sink.Items(); !reflect.DeepEqual(got, []any{"a", "b"}) {
		t.Errorf("sink items = %v", got)
	}
}

func TestIntoAnswersTheErrorOfTheSink(t *testing.T) {
	t.Parallel()

	failure := errors.New("sink full") //nolint:err113

	err := functionsfx.NewPipeline(emitting(false, "a")).Into(t.Context(), failingSink{err: failure})
	if !errors.Is(err, failure) {
		t.Errorf("Into error = %v, want the sink's", err)
	}
}

type failingSink struct{ err error }

func (failingSink) Name() string { return "failing" }

func (s failingSink) Drain(context.Context, <-chan streamfx.Chunk) error { return s.err }
