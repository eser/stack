// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package functionsfx

import (
	"context"
	"errors"
	"iter"
)

// Errors of Pipeline.
var (
	// ErrNextCalledMultipleTimes is the failure of a middleware that asks for the
	// rest of the chain more than once. The message is the one pipeline.ts has.
	ErrNextCalledMultipleTimes = errors.New("next() called multiple times in same middleware")
	// ErrNoResults is what RunFirst and RunLast answer for a chain that emitted
	// nothing. The message is the one pipeline.ts has.
	ErrNoResults = errors.New("Pipeline produced no results") //nolint:staticcheck // the text pairs with the TypeScript message
)

// State is shared by the middleware of one run: a value one middleware writes
// is visible to the middleware after it in the same run and to no other run. It
// pairs with State in pipeline.ts, with any comparable key where TypeScript has
// strings and symbols.
type State map[any]any

// Step is what a middleware gets of its place in the chain: the state of the run
// and the rest of the chain. It pairs with Context in pipeline.ts.
type Step[T any] struct {
	// State is the state of this run.
	State State
	next  func() iter.Seq2[T, error]
}

// Next gives what the rest of the chain emits. A middleware that delegates
// ranges over it and emits what it likes around it. Nothing runs until the
// sequence is ranged over, and a middleware may range over one Next: asking for
// it a second time fails with ErrNextCalledMultipleTimes.
func (s *Step[T]) Next() iter.Seq2[T, error] {
	return s.next()
}

// Middleware is one link of a chain. It gets the context, its Step and the
// arguments the pipeline was run with, and emits values and failures. A failure
// is an error with the zero value; the chain goes on after it unless the one who
// runs the pipeline stops. It pairs with Middleware in pipeline.ts, where a
// middleware may also return one result: Emit and Fail make a one-item sequence.
type Middleware[T any] func(ctx context.Context, step *Step[T], args ...any) iter.Seq2[T, error]

// Emit is the sequence of one value.
func Emit[T any](value T) iter.Seq2[T, error] {
	return func(yield func(T, error) bool) { yield(value, nil) }
}

// FailWith is the sequence of one failure.
func FailWith[T any](err error) iter.Seq2[T, error] {
	return func(yield func(T, error) bool) {
		var zero T

		yield(zero, err)
	}
}

// Pipeline is a chain of middleware that emits several results, in the style of
// Koa: each middleware receives its Step and delegates to the rest of the chain
// with Next. It pairs with the Pipeline of collect in pipeline.ts. Build it with
// NewPipeline and Use, and set MapError and Recover; like the TypeScript one, it
// is changed in place, and a built pipeline can be run many times.
type Pipeline[T any] struct {
	mapper    func(error) error
	recoverer func(error) T
	stack     []Middleware[T]
}

// NewPipeline creates a pipeline with the given middleware. It pairs with
// collect.
func NewPipeline[T any](middleware ...Middleware[T]) *Pipeline[T] {
	return &Pipeline[T]{stack: middleware, mapper: nil, recoverer: nil}
}

// Use adds middleware to the end of the chain and answers the pipeline.
func (p *Pipeline[T]) Use(middleware ...Middleware[T]) *Pipeline[T] {
	p.stack = append(p.stack, middleware...)

	return p
}

// MapError sets a function that changes every failure the chain emits, once:
// a failure that passes up through Next is not changed again. Recover wins when
// both are set.
func (p *Pipeline[T]) MapError(mapper func(error) error) *Pipeline[T] {
	p.mapper = mapper

	return p
}

// Recover sets a function that turns every failure the chain emits into a value,
// once. After it the pipeline emits no failure of the chain's.
func (p *Pipeline[T]) Recover(recoverer func(error) T) *Pipeline[T] {
	p.recoverer = recoverer

	return p
}

// processResult applies Recover or MapError to one emitted item.
func (p *Pipeline[T]) processResult(value T, err error) (T, error) {
	if err == nil {
		return value, nil
	}

	if p.recoverer != nil {
		return p.recoverer(err), nil
	}

	if p.mapper != nil {
		var zero T

		return zero, p.mapper(err)
	}

	return value, err
}

// Iterate runs the chain and emits what it emits, as it emits it. The arguments
// reach every middleware. The run starts when the sequence is ranged over, with
// a state of its own, and stops when the loop breaks or the context ends: a
// failure with the error of the context is the last item. It pairs with iterate.
func (p *Pipeline[T]) Iterate(ctx context.Context, args ...any) iter.Seq2[T, error] {
	return func(yield func(T, error) bool) {
		state := State{}
		lastIndex := -1

		var execute func(index int) iter.Seq2[T, error]

		execute = func(index int) iter.Seq2[T, error] {
			return func(yield func(T, error) bool) {
				// A second Next from the same middleware asks for an index the chain
				// has already reached.
				if index <= lastIndex {
					var zero T

					yield(zero, ErrNextCalledMultipleTimes)

					return
				}

				lastIndex = index

				if index >= len(p.stack) {
					return
				}

				if err := ctx.Err(); err != nil {
					var zero T

					yield(zero, err)

					return
				}

				step := &Step[T]{State: state, next: func() iter.Seq2[T, error] { return execute(index + 1) }}

				for value, err := range p.stack[index](ctx, step, args...) {
					if !yield(value, err) {
						return
					}
				}
			}
		}

		// Recover and MapError run once, on what the whole chain emits.
		for value, err := range execute(0) {
			if !yield(p.processResult(value, err)) {
				return
			}
		}
	}
}

// Run collects the values of the chain. It stops at the first failure and
// answers it. It pairs with run.
func (p *Pipeline[T]) Run(ctx context.Context, args ...any) ([]T, error) {
	values := []T{}

	for value, err := range p.Iterate(ctx, args...) {
		if err != nil {
			return nil, err
		}

		values = append(values, value)
	}

	return values, nil
}

// RunFirst answers the first item the chain emits, a failure included. A chain
// that emits nothing is ErrNoResults. It pairs with runFirst.
func (p *Pipeline[T]) RunFirst(ctx context.Context, args ...any) (T, error) {
	for value, err := range p.Iterate(ctx, args...) {
		return value, err
	}

	var zero T

	return zero, ErrNoResults
}

// RunLast answers the last value the chain emits, or the first failure it
// emits. A chain that emits nothing is ErrNoResults. It pairs with runLast.
func (p *Pipeline[T]) RunLast(ctx context.Context, args ...any) (T, error) {
	var (
		last T
		seen bool
	)

	for value, err := range p.Iterate(ctx, args...) {
		if err != nil {
			var zero T

			return zero, err
		}

		last, seen = value, true
	}

	if !seen {
		var zero T

		return zero, ErrNoResults
	}

	return last, nil
}
