// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package streamfx

import (
	"context"
	"fmt"
	"io"
	"os"
	"sync"
)

// ---------------------------------------------------------------------------
// BufferSink
// ---------------------------------------------------------------------------

// BufferSink collects all received chunks and exposes them via Items().
type BufferSink struct {
	name  string
	items []any
	mu    sync.Mutex
}

func newBufferSink(name string) *BufferSink {
	return &BufferSink{name: name, items: []any{}}
}

// BufferSinkNew creates a BufferSink for use in a pipeline.
func BufferSinkNew(name string) *BufferSink {
	return newBufferSink(name)
}

func (s *BufferSink) Name() string { return s.name }

func (s *BufferSink) Drain(ctx context.Context, in <-chan Chunk) error {
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case chunk, ok := <-in:
			if !ok {
				return nil
			}

			s.mu.Lock()
			s.items = append(s.items, chunk.Data)
			s.mu.Unlock()
		}
	}
}

// Items returns a copy of the collected data values.
func (s *BufferSink) Items() []any {
	s.mu.Lock()
	defer s.mu.Unlock()

	result := make([]any, len(s.items))
	copy(result, s.items)

	return result
}

// ---------------------------------------------------------------------------
// WriterSink
// ---------------------------------------------------------------------------

type writerSink struct {
	name   string
	writer io.Writer
}

// WriterSink creates a Sink that writes each chunk's Data (as a line) to w.
func WriterSink(name string, w io.Writer) Sink {
	return &writerSink{name: name, writer: w}
}

// StdoutSink creates a Sink that writes to os.Stdout.
func StdoutSink(name string) Sink {
	return WriterSink(name, os.Stdout)
}

// StderrSink creates a Sink that writes to os.Stderr.
func StderrSink(name string) Sink {
	return WriterSink(name, os.Stderr)
}

func (s *writerSink) Name() string { return s.name }

func (s *writerSink) Drain(ctx context.Context, in <-chan Chunk) error {
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case chunk, ok := <-in:
			if !ok {
				return nil
			}

			if _, err := fmt.Fprintln(s.writer, chunk.Data); err != nil {
				return err
			}
		}
	}
}

// ---------------------------------------------------------------------------
// NullSink
// ---------------------------------------------------------------------------

type nullSink struct {
	name string
}

// NullSink creates a Sink that discards all chunks.
func NullSink(name string) Sink {
	return &nullSink{name: name}
}

func (s *nullSink) Name() string { return s.name }

func (s *nullSink) Drain(ctx context.Context, in <-chan Chunk) error {
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case _, ok := <-in:
			if !ok {
				return nil
			}
		}
	}
}

// ---------------------------------------------------------------------------
// MultiplexSink
// ---------------------------------------------------------------------------

type multiplexSink struct {
	name  string
	sinks []Sink
}

// MultiplexSink creates a Sink that fans each chunk out to all provided sinks.
// Sinks are drained sequentially; the first error aborts the remaining sinks.
func MultiplexSink(name string, sinks ...Sink) Sink {
	return &multiplexSink{name: name, sinks: sinks}
}

func (s *multiplexSink) Name() string { return s.name }

func (s *multiplexSink) Drain(ctx context.Context, in <-chan Chunk) error {
	// Buffer all chunks, then replay to each sink.
	var chunks []Chunk

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case chunk, ok := <-in:
			if !ok {
				goto drain
			}

			chunks = append(chunks, chunk)
		}
	}

drain:
	for _, sink := range s.sinks {
		buf := make(chan Chunk, len(chunks))

		for _, c := range chunks {
			buf <- c
		}

		close(buf)

		if err := sink.Drain(ctx, buf); err != nil {
			return err
		}
	}

	return nil
}
