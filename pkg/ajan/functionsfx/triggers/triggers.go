// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// Package triggers holds the event and response types of the invocation sources
// a function serves, the Go side of triggers.ts in @eserstack/functions (ADR
// 0011). It has no framework in it: the sub-packages bind these types to httpfx,
// clifx, workerfx and aifx, so the functionsfx core imports none of them and a
// service imports only the adapters it uses.
//
// A function is written once as a functionsfx.Handler. A trigger binding
// (functionsfx.NewTrigger) turns an event of one of these types into its input
// and its output or error into the response of the source.
package triggers

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"time"

	"github.com/eser/stack/pkg/ajan/functionsfx"
)

// HTTPEvent is an HTTP request: method, path, headers, query and body. It pairs
// with HttpEvent. A header or a query parameter that repeats keeps its first
// value. The body is what the JSON of the request decoded to, numbers as
// json.Number (DecodeJSON), or its text.
type HTTPEvent struct {
	Body    any               `json:"body"`
	Headers map[string]string `json:"headers"`
	Query   map[string]string `json:"query"`
	Method  string            `json:"method"`
	Path    string            `json:"path"`
}

// HTTPResponse is an HTTP response. It pairs with HttpResponse.
type HTTPResponse struct {
	Body    any               `json:"body"`
	Headers map[string]string `json:"headers"`
	// Err is the error behind an error response whose text the client must
	// not see; httptrigger.Result logs it. It does not cross the bridge.
	Err    error `json:"-"`
	Status int   `json:"status"`
}

// QueueEvent is a queue message. It pairs with QueueEvent. There is no Go queue
// package yet, so nothing binds it; the type is here so a function that serves
// a queue in TypeScript has the same event in Go.
type QueueEvent struct {
	Body         any               `json:"body"`
	Attributes   map[string]string `json:"attributes"`
	MessageID    string            `json:"messageId"`
	ReceiveCount int               `json:"receiveCount"`
}

// QueueActionKind says what to do with a message.
type QueueActionKind string

const (
	// QueueAck marks the message processed.
	QueueAck QueueActionKind = "ack"
	// QueueNack marks the message to be retried.
	QueueNack QueueActionKind = "nack"
)

// QueueAction is the answer to a queue message. It pairs with QueueAction.
type QueueAction struct {
	Action QueueActionKind `json:"action"`
	// Reason says why a message is retried, for a nack.
	Reason string `json:"reason,omitempty"`
}

// CLIEvent is a command-line invocation. It pairs with CliEvent.
type CLIEvent struct {
	Flags   map[string]any `json:"flags"`
	Command string         `json:"command"`
	Args    []string       `json:"args"`
}

// CronEvent is a scheduled run. It pairs with CronEvent.
type CronEvent struct {
	ScheduledTime time.Time `json:"scheduledTime"`
	Name          string    `json:"name"`
}

// ToolCallEvent is a call an AI model makes to a function as a tool. It pairs
// with ToolCallEvent, and its fields are those of aifx.ToolCall: ID, Name and
// Arguments, the arguments decoded from JSON with numbers as json.Number
// (DecodeJSON).
type ToolCallEvent struct {
	Arguments any    `json:"arguments"`
	Name      string `json:"name"`
	// ID correlates the answer with the call; it is the id the provider gave.
	ID string `json:"callId,omitempty"`
}

// ToolCallResponse is what goes back to the model. It pairs with
// ToolCallResponse.
type ToolCallResponse struct {
	Content any `json:"content"`
	// IsError says the content describes a failure.
	IsError bool `json:"isError,omitempty"`
}

// StatusOf answers the HTTP status of an error by its kind: 400 for input the
// function refused (a ValidationError or an AdaptError), 503 for work that was
// cancelled or timed out (an AbortError), and 500 for anything else.
func StatusOf(err error) int {
	switch functionsfx.KindOf(err) {
	case functionsfx.KindValidation, functionsfx.KindAdapt:
		return 400
	case functionsfx.KindAbort:
		return 503
	case functionsfx.KindUnknown:
		return 500
	default:
		return 500
	}
}

// As converts a decoded value to the type an adapter wants, through JSON, which
// is how the value arrived. A value that does not fit is an AdaptError. It is
// the typed half of an Adapter: the event carries the body or the arguments as
// they decoded, and As gives the function's input.
//
//	functionsfx.Adapter[triggers.HTTPEvent, CreateOrder](func(event triggers.HTTPEvent) (CreateOrder, error) {
//	    return triggers.As[CreateOrder](event.Body)
//	})
func As[T any](value any) (T, error) {
	var result T

	encoded, err := json.Marshal(value)
	if err != nil {
		return result, functionsfx.NewAdaptError(fmt.Sprintf("cannot encode the value: %v", err), err)
	}

	if err := json.Unmarshal(encoded, &result); err != nil {
		return result, functionsfx.NewAdaptError(fmt.Sprintf("the value does not fit %T: %v", result, err), err)
	}

	return result, nil
}

// ErrTrailingData is the error of DecodeJSON for a document followed by more
// than white space.
var ErrTrailingData = errors.New("data after the JSON value")

// DecodeJSON decodes one JSON document into an untyped value, as json.Unmarshal
// does, except that a number becomes a json.Number. A float64 would round an
// integer above 2^53, an int64 id or amount, before As gives it to the
// function; a json.Number encodes back to the same digits.
func DecodeJSON(raw []byte, target *any) error {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()

	if err := decoder.Decode(target); err != nil {
		return err //nolint:wrapcheck // the callers wrap it in an AdaptError
	}

	if _, err := decoder.Token(); !errors.Is(err, io.EOF) {
		return ErrTrailingData
	}

	return nil
}

// ErrOf is a ResponseMapper for a source that answers only success or failure,
// such as a command line or a scheduled run: it gives the error and drops the
// output.
func ErrOf[O any](_ O, err error) error {
	return err
}

// ErrBodyTooLarge is the cause of the AdaptError for a body above the limit.
var ErrBodyTooLarge = errors.New("body is too large")
