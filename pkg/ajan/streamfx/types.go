// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package streamfx

import (
	"context"
	"errors"
	"fmt"
	"time"
)

// ChunkKind describes the semantic type of the data in a Chunk.
type ChunkKind string

const (
	KindText       ChunkKind = "text"
	KindStructured ChunkKind = "structured"
	KindBytes      ChunkKind = "bytes"
	KindSignal     ChunkKind = "signal"
)

// ChunkChannel identifies which output stream a Chunk belongs to.
type ChunkChannel string

const (
	ChannelStdout ChunkChannel = "stdout"
	ChannelStderr ChunkChannel = "stderr"
)

// ChunkMeta carries metadata about a Chunk.
type ChunkMeta struct {
	Timestamp   time.Time
	Kind        ChunkKind
	Channel     ChunkChannel
	Annotations map[string]any
}

// Chunk is the atomic unit of data flowing through a pipeline.
type Chunk struct {
	Data any
	Meta ChunkMeta
}

// NewChunk creates a Chunk with the current timestamp and the given kind.
func NewChunk(data any, kind ChunkKind) Chunk {
	return Chunk{
		Data: data,
		Meta: ChunkMeta{
			Timestamp: time.Now(),
			Kind:      kind,
		},
	}
}

// Source produces Chunks into a channel.
type Source interface {
	Name() string
	// Open starts the source goroutine and returns a read-only channel.
	// The channel is closed when all items are exhausted or ctx is cancelled.
	Open(ctx context.Context) (<-chan Chunk, error)
}

// Sink consumes Chunks from a channel.
type Sink interface {
	Name() string
	// Drain reads from in until it is closed or ctx is cancelled.
	Drain(ctx context.Context, in <-chan Chunk) error
}

// Layer transforms a stream of Chunks.
type Layer interface {
	Name() string
	// Transform starts a goroutine that reads from in and writes to a new channel.
	// The returned channel is closed when in is exhausted or ctx is cancelled.
	Transform(ctx context.Context, in <-chan Chunk) (<-chan Chunk, error)
}

// PipelineOptions configures pipeline execution.
type PipelineOptions struct {
	Timeout time.Duration
}

// Sentinel errors.
var (
	ErrNoSource = errors.New("pipeline has no source")
	ErrNoSink   = errors.New("pipeline has no sink")
	ErrPipeline = errors.New("pipeline error")
)

// PipelineError wraps a pipeline execution failure.
type PipelineError struct {
	Msg   string
	Cause error
}

func (e *PipelineError) Error() string {
	if e.Cause != nil {
		return fmt.Sprintf("%s: %v", e.Msg, e.Cause)
	}

	return e.Msg
}

func (e *PipelineError) Unwrap() error { return e.Cause }

func newPipelineError(msg string, cause error) *PipelineError {
	return &PipelineError{
		Msg:   msg,
		Cause: errors.Join(ErrPipeline, cause),
	}
}
