// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package streamfx

import (
	"context"
)

// ---------------------------------------------------------------------------
// FilterLayer
// ---------------------------------------------------------------------------

type filterLayer struct {
	name string
	pred func(Chunk) bool
}

// FilterLayer creates a Layer that passes only chunks for which pred returns true.
func FilterLayer(name string, pred func(Chunk) bool) Layer {
	return &filterLayer{name: name, pred: pred}
}

func (l *filterLayer) Name() string { return l.name }

func (l *filterLayer) Transform(ctx context.Context, in <-chan Chunk) (<-chan Chunk, error) {
	out := make(chan Chunk)

	go func() {
		defer close(out)

		for chunk := range in {
			if !l.pred(chunk) {
				continue
			}

			select {
			case <-ctx.Done():
				return
			case out <- chunk:
			}
		}
	}()

	return out, nil
}

// ---------------------------------------------------------------------------
// MapLayer
// ---------------------------------------------------------------------------

type mapLayer struct {
	name string
	fn   func(Chunk) Chunk
}

// MapLayer creates a Layer that transforms each chunk with fn.
func MapLayer(name string, fn func(Chunk) Chunk) Layer {
	return &mapLayer{name: name, fn: fn}
}

func (l *mapLayer) Name() string { return l.name }

func (l *mapLayer) Transform(ctx context.Context, in <-chan Chunk) (<-chan Chunk, error) {
	out := make(chan Chunk)

	go func() {
		defer close(out)

		for chunk := range in {
			select {
			case <-ctx.Done():
				return
			case out <- l.fn(chunk):
			}
		}
	}()

	return out, nil
}

// ---------------------------------------------------------------------------
// TapLayer
// ---------------------------------------------------------------------------

type tapLayer struct {
	name string
	fn   func(Chunk)
}

// TapLayer creates a Layer that calls fn for each chunk as a side effect and
// passes the chunk through unchanged.
func TapLayer(name string, fn func(Chunk)) Layer {
	return &tapLayer{name: name, fn: fn}
}

func (l *tapLayer) Name() string { return l.name }

func (l *tapLayer) Transform(ctx context.Context, in <-chan Chunk) (<-chan Chunk, error) {
	out := make(chan Chunk)

	go func() {
		defer close(out)

		for chunk := range in {
			l.fn(chunk)

			select {
			case <-ctx.Done():
				return
			case out <- chunk:
			}
		}
	}()

	return out, nil
}

// ---------------------------------------------------------------------------
// TeeLayer
// ---------------------------------------------------------------------------

type teeLayer struct {
	name string
	sink Sink
}

// TeeLayer creates a Layer that copies each chunk to sink while passing it
// downstream unchanged.
func TeeLayer(name string, sink Sink) Layer {
	return &teeLayer{name: name, sink: sink}
}

func (l *teeLayer) Name() string { return l.name }

func (l *teeLayer) Transform(ctx context.Context, in <-chan Chunk) (<-chan Chunk, error) {
	out := make(chan Chunk)

	go func() {
		defer close(out)

		teeCh := make(chan Chunk)

		// Drain the tee sink in a separate goroutine.
		done := make(chan struct{})

		go func() {
			defer close(done)
			_ = l.sink.Drain(ctx, teeCh)
		}()

		for chunk := range in {
			// Send to tee sink (non-blocking if sink is slow — drop rather than block).
			select {
			case teeCh <- chunk:
			default:
			}

			select {
			case <-ctx.Done():
				close(teeCh)
				<-done

				return
			case out <- chunk:
			}
		}

		close(teeCh)
		<-done
	}()

	return out, nil
}
