// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// Package toolcalltrigger binds a function to a tool call of an AI model (ADR
// 0011): an aifx.ToolCall becomes a triggers.ToolCallEvent, and the response of
// the function becomes the aifx.ToolResult that goes back to the model.
//
//	handle := toolcalltrigger.Handle(trigger)
//	result := handle(ctx, call)
package toolcalltrigger

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/eser/stack/pkg/ajan/aifx"
	"github.com/eser/stack/pkg/ajan/functionsfx"
	"github.com/eser/stack/pkg/ajan/functionsfx/triggers"
)

// Event reads a tool call as a triggers.ToolCallEvent. Its fields are those of
// aifx.ToolCall: the id, the name and the arguments, which are decoded from
// JSON (no arguments decode to nil). Arguments that are not JSON are an
// AdaptError.
func Event(call aifx.ToolCall) (triggers.ToolCallEvent, error) {
	event := triggers.ToolCallEvent{ID: call.ID, Name: call.Name, Arguments: nil}

	if len(call.Arguments) == 0 {
		return event, nil
	}

	if err := triggers.DecodeJSON(call.Arguments, &event.Arguments); err != nil {
		return event, functionsfx.NewAdaptError(fmt.Sprintf("the arguments of tool %q are not valid JSON: %v", call.Name, err), err)
	}

	return event, nil
}

// Respond is a ResponseMapper for a function a model calls: a success is the
// output as content, and an error is the wire form of the error (error and
// errorKind) as content with IsError set, so the model can read what went wrong.
func Respond[O any](output O, err error) triggers.ToolCallResponse {
	if err != nil {
		return triggers.ToolCallResponse{Content: functionsfx.ToWire(err), IsError: true}
	}

	return triggers.ToolCallResponse{Content: output, IsError: false}
}

// Result turns a response into the aifx.ToolResult of the call with the given id.
// A string content is sent as it is and any other content as JSON.
func Result(id string, response triggers.ToolCallResponse) aifx.ToolResult {
	switch content := response.Content.(type) {
	case string:
		return aifx.ToolResult{ToolCallID: id, Content: content, IsError: response.IsError}
	default:
		encoded, err := json.Marshal(content)
		if err != nil {
			return aifx.ToolResult{ToolCallID: id, Content: "cannot encode the result: " + err.Error(), IsError: true}
		}

		return aifx.ToolResult{ToolCallID: id, Content: string(encoded), IsError: response.IsError}
	}
}

// Handle makes the function that answers a tool call of a trigger. A call whose
// arguments are not JSON is answered with an error result without the function
// running.
func Handle(trigger functionsfx.Trigger[triggers.ToolCallEvent, triggers.ToolCallResponse]) func(ctx context.Context, call aifx.ToolCall) aifx.ToolResult {
	return func(ctx context.Context, call aifx.ToolCall) aifx.ToolResult {
		event, err := Event(call)
		if err != nil {
			return Result(call.ID, Respond[any](nil, err))
		}

		return Result(call.ID, trigger(ctx, event))
	}
}
