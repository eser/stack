// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package functionsfx

import (
	"context"
	"errors"
)

// ErrIncompleteBinding is returned by NewTrigger for a binding that lacks its
// handler, its input adapter or its output mapper.
var ErrIncompleteBinding = errors.New("trigger binding is incomplete")

// Handler is business logic that does not know how it is invoked. It pairs
// with Handler in @eserstack/functions. TypeScript writes it as a function
// from the input to a Task; Go folds the two into one call, so a handler takes
// the context and the input and answers the output or an error. Handler.Task
// gives the lazy form.
//
// Dependencies reach a handler through the constructor of the type that holds
// it: a method value of a struct is a Handler.
type Handler[I, O any] func(ctx context.Context, input I) (O, error)

// Task returns the lazy form of the handler for one input.
func (h Handler[I, O]) Task(input I) Task[O] {
	return func(ctx context.Context) (O, error) {
		return h(ctx, input)
	}
}

// Adapter turns a trigger event into the input of a handler. It pairs with
// Adapter in @eserstack/functions. An error it returns reaches the caller as
// an AdaptError.
type Adapter[Ev, I any] func(event Ev) (I, error)

// ResponseMapper turns the answer of a handler into the response of a
// trigger. It pairs with ResponseMapper. TypeScript passes a Result; Go passes
// the output and the error, and the output is the zero value when err is set.
type ResponseMapper[O, Resp any] func(output O, err error) Resp

// TriggerBinding is the full port of one trigger: the handler with the adapter
// of its input and the mapper of its output. It pairs with TriggerBinding.
type TriggerBinding[Ev, Resp, I, O any] struct {
	Handler     Handler[I, O]
	AdaptInput  Adapter[Ev, I]
	AdaptOutput ResponseMapper[O, Resp]
}

// Trigger is a handler bound to one invocation source.
type Trigger[Ev, Resp any] func(ctx context.Context, event Ev) Resp

// Bind returns a handler that takes the trigger event directly. It pairs with
// bind, the contravariant map over the input. An adapter error that is not an
// AdaptError is wrapped into one, with the original error as its cause, so a
// caller can rely on the kind.
func Bind[Ev, I, O any](handler Handler[I, O], adapter Adapter[Ev, I]) Handler[Ev, O] {
	return func(ctx context.Context, event Ev) (O, error) {
		input, err := adapter(event)
		if err != nil {
			var zero O

			if IsKind(err, KindAdapt) {
				return zero, err
			}

			return zero, NewAdaptError(MessageOf(err), err)
		}

		return handler(ctx, input)
	}
}

// NewTrigger builds the runnable function of a binding. It pairs with
// createTrigger. The function adapts the event, runs the handler and maps the
// answer, whether it is an output or an error, to the response.
func NewTrigger[Ev, Resp, I, O any](binding TriggerBinding[Ev, Resp, I, O]) (Trigger[Ev, Resp], error) {
	if binding.Handler == nil || binding.AdaptInput == nil || binding.AdaptOutput == nil {
		return nil, ErrIncompleteBinding
	}

	bound := Bind(binding.Handler, binding.AdaptInput)

	return func(ctx context.Context, event Ev) Resp {
		output, err := bound(ctx, event)

		return binding.AdaptOutput(output, err)
	}, nil
}
