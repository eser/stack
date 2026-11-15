// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package toolcalltrigger_test

import (
	"context"
	"encoding/json"
	"sync/atomic"
	"testing"

	"github.com/eser/stack/pkg/ajan/aifx"
	"github.com/eser/stack/pkg/ajan/functionsfx"
	"github.com/eser/stack/pkg/ajan/functionsfx/triggers"
	"github.com/eser/stack/pkg/ajan/functionsfx/triggers/toolcalltrigger"
)

type orderInput struct {
	Customer string `json:"customerId"`
}

type orderOutput struct {
	ID string `json:"id"`
}

func handle(t *testing.T) (func(context.Context, aifx.ToolCall) aifx.ToolResult, *atomic.Int32) {
	t.Helper()

	var ran atomic.Int32

	trigger, err := functionsfx.NewTrigger(functionsfx.TriggerBinding[triggers.ToolCallEvent, triggers.ToolCallResponse, orderInput, orderOutput]{
		Handler: func(_ context.Context, input orderInput) (orderOutput, error) {
			ran.Add(1)

			if input.Customer == "" {
				return orderOutput{}, functionsfx.NewValidationError("customerId is required")
			}

			return orderOutput{ID: "order-1"}, nil
		},
		AdaptInput: func(event triggers.ToolCallEvent) (orderInput, error) {
			return triggers.As[orderInput](event.Arguments)
		},
		AdaptOutput: toolcalltrigger.Respond[orderOutput],
	})
	if err != nil {
		t.Fatal(err)
	}

	return toolcalltrigger.Handle(trigger), &ran
}

func TestEventKeepsTheFieldsOfAToolCall(t *testing.T) {
	t.Parallel()

	event, err := toolcalltrigger.Event(aifx.ToolCall{ID: "call_abc", Name: "create-order", Arguments: json.RawMessage(`{"customerId":"cust-1"}`)})
	if err != nil {
		t.Fatalf("Event: %v", err)
	}

	arguments, _ := event.Arguments.(map[string]any)

	if event.ID != "call_abc" || event.Name != "create-order" || arguments["customerId"] != "cust-1" {
		t.Errorf("event = %+v", event)
	}
}

func TestACallWithoutArgumentsHasNilArguments(t *testing.T) {
	t.Parallel()

	event, err := toolcalltrigger.Event(aifx.ToolCall{ID: "c", Name: "ping"})
	if err != nil || event.Arguments != nil {
		t.Errorf("Event = (%+v, %v)", event, err)
	}
}

func TestArgumentsThatAreNotJSONAreAnAdaptError(t *testing.T) {
	t.Parallel()

	_, err := toolcalltrigger.Event(aifx.ToolCall{ID: "c", Name: "create-order", Arguments: json.RawMessage(`{broken`)})
	if !functionsfx.IsKind(err, functionsfx.KindAdapt) {
		t.Errorf("error = %v, want an AdaptError", err)
	}
}

func TestACallIsAnsweredWithTheJSONOfTheOutput(t *testing.T) {
	t.Parallel()

	answer, ran := handle(t)

	result := answer(t.Context(), aifx.ToolCall{ID: "call_abc", Name: "create-order", Arguments: json.RawMessage(`{"customerId":"cust-1"}`)})

	if result.ToolCallID != "call_abc" || result.IsError || result.Content != `{"id":"order-1"}` {
		t.Errorf("result = %+v", result)
	}

	if ran.Load() != 1 {
		t.Errorf("function ran %d times, want 1", ran.Load())
	}
}

func TestAFailureIsAnErrorResultThatNamesTheKind(t *testing.T) {
	t.Parallel()

	answer, _ := handle(t)

	result := answer(t.Context(), aifx.ToolCall{ID: "call_1", Name: "create-order", Arguments: json.RawMessage(`{"customerId":""}`)})

	var wire functionsfx.WireError
	if err := json.Unmarshal([]byte(result.Content), &wire); err != nil {
		t.Fatalf("decode %s: %v", result.Content, err)
	}

	if !result.IsError || result.ToolCallID != "call_1" || wire.Kind != functionsfx.KindValidation || wire.Message != "customerId is required" {
		t.Errorf("result = %+v, wire = %+v", result, wire)
	}
}

func TestMalformedArgumentsAreAnErrorResultAndTheFunctionDoesNotRun(t *testing.T) {
	t.Parallel()

	answer, ran := handle(t)

	result := answer(t.Context(), aifx.ToolCall{ID: "call_2", Name: "create-order", Arguments: json.RawMessage(`{broken`)})

	if !result.IsError || result.ToolCallID != "call_2" || ran.Load() != 0 {
		t.Errorf("result = %+v, ran %d", result, ran.Load())
	}

	wrongShape := answer(t.Context(), aifx.ToolCall{ID: "call_3", Name: "create-order", Arguments: json.RawMessage(`{"customerId":5}`)})
	if !wrongShape.IsError {
		t.Errorf("a wrong shape was answered as a success: %+v", wrongShape)
	}
}

func TestAStringContentIsSentAsItIs(t *testing.T) {
	t.Parallel()

	result := toolcalltrigger.Result("c", triggers.ToolCallResponse{Content: "plain answer"})
	if result.Content != "plain answer" || result.IsError {
		t.Errorf("result = %+v", result)
	}

	unencodable := toolcalltrigger.Result("c", triggers.ToolCallResponse{Content: make(chan int)})
	if !unencodable.IsError {
		t.Errorf("an unencodable content was not an error: %+v", unencodable)
	}
}

func TestALargeIntegerInTheArgumentsKeepsItsValue(t *testing.T) {
	t.Parallel()

	event, err := toolcalltrigger.Event(aifx.ToolCall{ID: "c", Name: "refund", Arguments: json.RawMessage(`{"amount":9007199254740993}`)})
	if err != nil {
		t.Fatalf("Event: %v", err)
	}

	input, err := triggers.As[struct {
		Amount int64 `json:"amount"`
	}](event.Arguments)
	if err != nil {
		t.Fatalf("As: %v", err)
	}

	if input.Amount != 9007199254740993 {
		t.Errorf("amount = %d, want 9007199254740993", input.Amount)
	}
}
