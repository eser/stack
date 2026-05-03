// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package streamfx

import (
	"bufio"
	"context"
	"io"
	"os"
)

// ---------------------------------------------------------------------------
// ValuesSource
// ---------------------------------------------------------------------------

type valuesSource struct {
	name  string
	items []any
}

// ValuesSource creates a Source that emits all provided values, then closes.
func ValuesSource(name string, items ...any) Source {
	return &valuesSource{name: name, items: items}
}

func (s *valuesSource) Name() string { return s.name }

func (s *valuesSource) Open(ctx context.Context) (<-chan Chunk, error) {
	out := make(chan Chunk, len(s.items))

	go func() {
		defer close(out)

		for _, item := range s.items {
			select {
			case <-ctx.Done():
				return
			case out <- NewChunk(item, KindStructured):
			}
		}
	}()

	return out, nil
}

// ---------------------------------------------------------------------------
// StdinSource
// ---------------------------------------------------------------------------

// StdinSource creates a Source that reads lines from os.Stdin.
func StdinSource(name string) Source {
	return ReadableSource(name, os.Stdin)
}

// ---------------------------------------------------------------------------
// ReadableSource
// ---------------------------------------------------------------------------

type readableSource struct {
	name   string
	reader io.Reader
}

// ReadableSource creates a Source that reads newline-delimited text from r.
func ReadableSource(name string, r io.Reader) Source {
	return &readableSource{name: name, reader: r}
}

func (s *readableSource) Name() string { return s.name }

func (s *readableSource) Open(ctx context.Context) (<-chan Chunk, error) {
	out := make(chan Chunk)

	go func() {
		defer close(out)

		scanner := bufio.NewScanner(s.reader)

		for scanner.Scan() {
			line := scanner.Text()

			select {
			case <-ctx.Done():
				return
			case out <- NewChunk(line, KindText):
			}
		}
	}()

	return out, nil
}
