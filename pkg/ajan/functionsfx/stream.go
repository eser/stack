// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package functionsfx

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"iter"

	jsonschema "github.com/santhosh-tekuri/jsonschema/v6"
)

// Errors of streaming functions.
var (
	// ErrStreamOnly is what Call answers for a function that streams: its output
	// is a sequence, so it is opened with Open or Registry.Stream. Collecting an
	// unbounded sequence into one answer is a choice for the caller to make.
	ErrStreamOnly = errors.New("function streams its output")
	// ErrNotStream is what Registry.Stream answers for a function that does not
	// stream.
	ErrNotStream = errors.New("function does not stream")
)

// StreamHandler is the handler of a function that answers a sequence of values,
// the way Pipeline.Iterate does: a value, or a failure with the error. The
// sequence stops being ranged over when the caller stops reading or the context
// ends, so the handler stops producing then. It pairs with a handler that
// returns an AsyncGenerator in TypeScript.
type StreamHandler[I, O any] func(ctx context.Context, input I) iter.Seq2[O, error]

// StreamFunction is a Function that answers a sequence. The bridge opens it as a
// stream, and a Go caller ranges over what Open gives.
type StreamFunction interface {
	Function
	// Open checks and decodes the input, as Call does, and answers the sequence of
	// the outputs as JSON, one per item. An input that is refused is the error of
	// Open, before anything is produced. A failure of the function is the last
	// item, an error, and the sequence ends after it.
	Open(ctx context.Context, input json.RawMessage) (iter.Seq2[json.RawMessage, error], error)
}

type typedStream[I, O any] struct {
	handler    StreamHandler[I, O]
	inputCheck *jsonschema.Schema // nil when the descriptor has no input schema
	descriptor Descriptor
}

// NewStreamFunction builds a StreamFunction of a typed handler. It takes the same
// options as NewFunction, and its descriptor says Stream. The output schema, if
// there is one, describes one item.
func NewStreamFunction[I, O any](name string, handler StreamHandler[I, O], options ...Option) (StreamFunction, error) { //nolint:ireturn
	if handler == nil {
		return nil, fmt.Errorf("function %q: %w", name, ErrNilHandler)
	}

	descriptor, inputCheck, err := describe(name, options)
	if err != nil {
		return nil, err
	}

	descriptor.Stream = true

	return &typedStream[I, O]{handler: handler, inputCheck: inputCheck, descriptor: descriptor}, nil
}

func (f *typedStream[I, O]) Descriptor() Descriptor {
	return f.descriptor.clone()
}

// Call is ErrStreamOnly: a function that streams is opened, not called.
func (f *typedStream[I, O]) Call(context.Context, json.RawMessage) (json.RawMessage, error) {
	return nil, fmt.Errorf("%w: %q is opened as a stream", ErrStreamOnly, f.descriptor.Name)
}

func (f *typedStream[I, O]) Open(ctx context.Context, input json.RawMessage) (iter.Seq2[json.RawMessage, error], error) {
	if err := ctx.Err(); err != nil {
		return nil, fmt.Errorf("open %q: %w", f.descriptor.Name, err)
	}

	payload := bytes.TrimSpace(input)
	if len(payload) == 0 {
		payload = []byte("null")
	}

	if f.inputCheck != nil {
		if err := validateInstance(f.inputCheck, payload); err != nil {
			return nil, NewValidationError(err.Error())
		}
	}

	var decoded I

	if err := json.Unmarshal(payload, &decoded); err != nil {
		return nil, NewValidationError(fmt.Sprintf("input of %q: %v", f.descriptor.Name, err))
	}

	items := f.handler(ctx, decoded)

	return func(yield func(json.RawMessage, error) bool) {
		for value, err := range items {
			if err != nil {
				yield(nil, err)

				return
			}

			encoded, encodeErr := json.Marshal(value)
			if encodeErr != nil {
				yield(nil, fmt.Errorf("encode an item of %q: %w", f.descriptor.Name, encodeErr))

				return
			}

			if !yield(encoded, nil) {
				return
			}
		}
	}, nil
}

// Stream opens the function of the given name as a stream. An unknown name is
// ErrUnknownFunction, and a function that does not stream is ErrNotStream.
func (r *Registry) Stream(ctx context.Context, name string, input json.RawMessage) (iter.Seq2[json.RawMessage, error], error) {
	function, ok := r.Get(name)
	if !ok {
		return nil, fmt.Errorf("%w: %q", ErrUnknownFunction, name)
	}

	streaming, ok := function.(StreamFunction)
	if !ok {
		return nil, fmt.Errorf("%w: %q", ErrNotStream, name)
	}

	return streaming.Open(ctx, input) //nolint:wrapcheck // the function names itself
}
