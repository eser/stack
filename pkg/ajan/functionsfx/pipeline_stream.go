// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package functionsfx

import (
	"context"
	"fmt"
	"iter"

	"github.com/eser/stack/pkg/ajan/streamfx"
)

// The Pipeline of this package and the pipeline of streamfx have different
// shapes: this one is a chain of middleware, each delegating to the rest with
// Next and sharing a state, and streamfx's is a source, layers and a sink over
// channels. They are connected at both ends: a streamfx.Source feeds a chain
// (FromStream), and a chain is a streamfx.Source (AsSource) or runs into a
// streamfx.Sink (Into).

// FromStream is a middleware that emits what a streamfx source produces: the
// Data of each chunk, which must be a T. It does not delegate to the rest of the
// chain. The source runs on a context that ends when the middleware does, so a
// consumer that stops early does not leave it running.
func FromStream[T any](source streamfx.Source) Middleware[T] {
	return func(ctx context.Context, _ *Step[T], _ ...any) iter.Seq2[T, error] {
		return func(yield func(T, error) bool) {
			var zero T

			streamCtx, cancel := context.WithCancel(ctx)
			defer cancel()

			chunks, err := source.Open(streamCtx)
			if err != nil {
				yield(zero, fmt.Errorf("open source %q: %w", source.Name(), err))

				return
			}

			for chunk := range chunks {
				value, ok := chunk.Data.(T)
				if !ok {
					yield(zero, fmt.Errorf("source %q gave a chunk of %T, want %T", source.Name(), chunk.Data, zero)) //nolint:err113

					return
				}

				if !yield(value, nil) {
					return
				}
			}
		}
	}
}

// pipelineSource is a Pipeline seen as a streamfx source.
type pipelineSource[T any] struct {
	pipeline *Pipeline[T]
	name     string
	args     []any
}

func (s *pipelineSource[T]) Name() string { return s.name }

// Open runs the chain in a goroutine of its own and sends each value as a chunk
// of kind structured. A failure of the chain is the last chunk, of kind signal,
// with the error as its data and the annotation "error": true, and the channel
// closes after it. The channel also closes when the context ends.
func (s *pipelineSource[T]) Open(ctx context.Context) (<-chan streamfx.Chunk, error) {
	out := make(chan streamfx.Chunk)

	go func() {
		defer close(out)

		for value, err := range s.pipeline.Iterate(ctx, s.args...) {
			chunk := streamfx.NewChunk(value, streamfx.KindStructured)

			if err != nil {
				chunk = streamfx.NewChunk(err, streamfx.KindSignal)
				chunk.Meta.Annotations = map[string]any{"error": true}
			}

			select {
			case out <- chunk:
			case <-ctx.Done():
				return
			}

			if err != nil {
				return
			}
		}
	}()

	return out, nil
}

// AsSource makes the pipeline a streamfx.Source named name, to run with the
// arguments, so it can feed a streamfx pipeline.
func (p *Pipeline[T]) AsSource(name string, args ...any) streamfx.Source {
	return &pipelineSource[T]{pipeline: p, name: name, args: args}
}

// Into runs the chain into a sink and answers the error of the sink. A failure
// of the chain reaches the sink as the signal chunk AsSource describes and is
// not an error of Into: the sink decides what a failure means. The chain stops
// when the sink returns.
func (p *Pipeline[T]) Into(ctx context.Context, sink streamfx.Sink, args ...any) error {
	runCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	chunks, err := p.AsSource(sink.Name(), args...).Open(runCtx)
	if err != nil {
		return fmt.Errorf("open the pipeline as a source: %w", err)
	}

	if err := sink.Drain(runCtx, chunks); err != nil {
		return fmt.Errorf("sink %q: %w", sink.Name(), err)
	}

	return nil
}
