// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !wasip1

package main

// Functions that answer a sequence (functionsfx.StreamFunction), served as one
// stream name (ADR 0011):
//
//	functionStream open  { name, input }    -> { handle } | { error, errorKind }
//	functionStream read  handle             -> { output } | { error, errorKind } | null
//	functionStream close handle             -> {}
//
// read answers each item as { output }, then null when the sequence is done. A
// failure of the function is the last item, { error, errorKind }, and null
// follows it. Closing the stream ends the context the function runs on, so a
// function that honors its context stops, and the call waits until it has.
// The WASM profile does not serve the name, for the reason bridge_functions.go
// gives.

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"sync/atomic"

	"github.com/eser/stack/pkg/ajan/functionsfx"
)

const (
	// functionStreamPrefix starts the handles of function streams.
	functionStreamPrefix = "fnstream"
	// maxFunctionStreams bounds how many streams may be open at once: each one
	// holds a goroutine, and a host that never closes them must not grow the
	// bridge without limit.
	maxFunctionStreams = 1024
)

// The kinds of the failures the bridge answers for a stream, next to
// kindUnknownFunction.
const (
	// kindNotStream: the function exists but does not stream.
	kindNotStream functionsfx.Kind = "NotAStream"
	// kindStreamOnly: functionCall named a function that streams.
	kindStreamOnly functionsfx.Kind = "StreamOnly"
	// kindTooManyStreams: maxFunctionStreams are open already.
	kindTooManyStreams functionsfx.Kind = "TooManyStreams"
)

// functionStreamState is one open stream. The goroutine that runs the sequence
// hands each answer to a read through items and then waits on demand, which the
// next read fills, so the function never runs ahead of its reader: a reader that
// stops after one item stops the function before it makes another. The
// goroutine ends when the sequence ends or the context does.
type functionStreamState struct {
	items  chan string
	demand chan struct{}
	cancel context.CancelFunc
	wg     sync.WaitGroup
	// read is set by the first read; every later read asks for one more item.
	read atomic.Bool
}

var (
	functionStreamMu      sync.RWMutex                        //nolint:gochecknoglobals
	functionStreamHandles = map[string]*functionStreamState{} //nolint:gochecknoglobals
)

// bridgeFunctionStreamOpen serves the open of functionStream on a registry.
func bridgeFunctionStreamOpen(registry *functionsfx.Registry) callFunc {
	return func(requestJSON string) string {
		var req functionCallRequest
		if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
			return errorResponse("invalid request JSON: " + err.Error())
		}

		function, ok := registry.Get(req.Name)
		if !ok {
			return functionFailure(fmt.Sprintf("unknown function: %q", req.Name), kindUnknownFunction)
		}

		streaming, ok := function.(functionsfx.StreamFunction)
		if !ok {
			return functionFailure(fmt.Sprintf("function %q does not stream; call it with functionCall", req.Name), kindNotStream)
		}

		functionStreamMu.RLock()
		open := len(functionStreamHandles)
		functionStreamMu.RUnlock()

		if open >= maxFunctionStreams {
			return functionFailure(fmt.Sprintf("%d function streams are open already; close one first", open), kindTooManyStreams)
		}

		ctx, cancel := context.WithCancel(context.Background()) //nolint:gosec // cancel is kept in the state, and close and the shutdown drain run it

		items, err := streaming.Open(ctx, req.Input)
		if err != nil {
			cancel()

			return functionError(err)
		}

		state := &functionStreamState{items: make(chan string), demand: make(chan struct{}, 1), cancel: cancel} //nolint:exhaustruct
		state.wg.Add(1)

		go produceFunctionStream(ctx, state, items)

		handle := newHandle(functionStreamPrefix)

		functionStreamMu.Lock()
		functionStreamHandles[handle] = state
		functionStreamMu.Unlock()

		return marshalResponse(aiHandleResponse{Handle: handle}) //nolint:exhaustruct
	}
}

// produceFunctionStream runs the sequence and sends each item as an answer. It
// recovers on its own: this goroutine outlives the guarded call that opened it,
// so an escaping panic would abort the host process.
func produceFunctionStream(ctx context.Context, state *functionStreamState, items func(yield func(json.RawMessage, error) bool)) {
	defer state.wg.Done()
	defer close(state.items)

	defer func() {
		if recovered := recover(); recovered != nil {
			select {
			case state.items <- functionFailure(reportPanic(recovered), ""):
			case <-ctx.Done():
			}
		}
	}()

	for value, err := range items {
		answer := marshalResponse(functionCallResponse{Output: value}) //nolint:exhaustruct
		if err != nil {
			answer = functionError(err)
		}

		select {
		case state.items <- answer:
		case <-ctx.Done():
			return
		}

		if err != nil {
			return
		}

		// The sequence goes on only when the next read asks for it.
		select {
		case <-state.demand:
		case <-ctx.Done():
			return
		}
	}
}

// bridgeFunctionStreamRead answers the next item of a stream, or "null" when
// the sequence is done or the handle is gone.
func bridgeFunctionStreamRead(handle string) string {
	functionStreamMu.RLock()
	state, ok := functionStreamHandles[handle]

	if ok {
		state.wg.Add(1)
	}

	functionStreamMu.RUnlock()

	// "null" for an unknown handle is the deliberate stream-done sentinel: reading
	// past the end and reading after a close look the same to the caller. Close
	// is the authoritative end of the lifecycle.
	if !ok {
		return "null"
	}

	defer state.wg.Done()

	if state.read.Swap(true) {
		select {
		case state.demand <- struct{}{}:
		default:
		}
	}

	answer, open := <-state.items
	if !open {
		functionStreamMu.Lock()
		if functionStreamHandles[handle] == state {
			delete(functionStreamHandles, handle)
		}
		functionStreamMu.Unlock()

		// The function finished on its own, so a close may never come for this
		// handle. Release its context here, or the stream keeps its slot
		// under the cap until shutdown.
		state.cancel()

		return "null"
	}

	return answer
}

// bridgeFunctionStreamClose ends a stream and releases its handle.
//
//nolint:unparam // uniform string return is part of the exported C ABI
func bridgeFunctionStreamClose(handle string) string {
	functionStreamMu.Lock()
	state, ok := functionStreamHandles[handle]

	if ok {
		delete(functionStreamHandles, handle)
	}

	functionStreamMu.Unlock()

	if !ok {
		return "{}"
	}

	state.cancel()
	state.wg.Wait()

	return "{}"
}

// drainFunctionStreams is the shutdown step of the function streams: it takes
// every open one, so the host can end them before it unloads the library.
func drainFunctionStreams() shutdownStep {
	functionStreamMu.Lock()

	states := make([]*functionStreamState, 0, len(functionStreamHandles))
	for _, state := range functionStreamHandles {
		states = append(states, state)
	}

	clear(functionStreamHandles)
	functionStreamMu.Unlock()

	return shutdownStep{ //nolint:exhaustruct
		cancel: func() {
			for _, state := range states {
				state.cancel()
			}
		},
		wait: func() {
			for _, state := range states {
				state.wg.Wait()
			}
		},
	}
}

// streamOnlyKind is the kind functionCall answers for a function that streams.
func streamOnlyKind(err error) functionsfx.Kind {
	if errors.Is(err, functionsfx.ErrStreamOnly) {
		return kindStreamOnly
	}

	return functionsfx.KindOf(err)
}

func init() {
	registerStream("functionStream", functionStreamPrefix, streamFuncs{
		open:  bridgeFunctionStreamOpen(bridgeFunctions),
		read:  bridgeFunctionStreamRead,
		close: bridgeFunctionStreamClose,
	})
	registerShutdownDrain(drainFunctionStreams)
}
