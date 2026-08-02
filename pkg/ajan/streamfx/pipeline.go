// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package streamfx

import (
	"context"
)

// Pipeline is a composable Source → Layers → Sink chain.
//
// Call From, Through, and To to assemble the pipeline, then Run or Collect
// to execute it.
type Pipeline struct {
	source Source
	layers []Layer
	sink   Sink
}

// New creates an empty Pipeline.
func New() *Pipeline {
	return &Pipeline{}
}

// From sets the source for the pipeline.
func (p *Pipeline) From(s Source) *Pipeline {
	p.source = s

	return p
}

// Through appends one or more transformation layers.
func (p *Pipeline) Through(layers ...Layer) *Pipeline {
	p.layers = append(p.layers, layers...)

	return p
}

// To sets the sink for the pipeline.
func (p *Pipeline) To(s Sink) *Pipeline {
	p.sink = s

	return p
}

// Run executes the pipeline, blocking until completion, cancellation, or error.
func (p *Pipeline) Run(ctx context.Context, opts *PipelineOptions) error {
	if p.source == nil {
		return ErrNoSource
	}

	if p.sink == nil {
		return ErrNoSink
	}

	runCtx := ctx

	if opts != nil && opts.Timeout > 0 {
		var cancel context.CancelFunc
		runCtx, cancel = context.WithTimeout(ctx, opts.Timeout)

		defer cancel()
	}

	ch, err := p.source.Open(runCtx)
	if err != nil {
		return newPipelineError("failed to open source "+p.source.Name(), err)
	}

	for _, layer := range p.layers {
		ch, err = layer.Transform(runCtx, ch)
		if err != nil {
			return newPipelineError("failed to apply layer "+layer.Name(), err)
		}
	}

	if err := p.sink.Drain(runCtx, ch); err != nil {
		return newPipelineError("sink "+p.sink.Name()+" failed", err)
	}

	return nil
}

// Collect runs the pipeline and returns all items collected by a buffer sink.
// Any previously configured sink is replaced.
func (p *Pipeline) Collect(ctx context.Context) ([]any, error) {
	buf := newBufferSink("collect")
	p.sink = buf

	if err := p.Run(ctx, nil); err != nil {
		return nil, err
	}

	return buf.Items(), nil
}
