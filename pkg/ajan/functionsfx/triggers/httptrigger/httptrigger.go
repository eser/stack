// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// Package httptrigger binds a function to an httpfx route (ADR 0011): the
// request becomes a triggers.HTTPEvent, and the response of the function becomes
// the httpfx.Result.
//
//	trigger, err := functionsfx.NewTrigger(functionsfx.TriggerBinding[...]{
//	    Handler:     createOrder,
//	    AdaptInput:  func(event triggers.HTTPEvent) (CreateOrder, error) { return triggers.As[CreateOrder](event.Body) },
//	    AdaptOutput: httptrigger.Respond[Order],
//	})
//	router.Route("POST /orders", httptrigger.Handler(trigger))
package httptrigger

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/eser/stack/pkg/ajan/functionsfx"
	"github.com/eser/stack/pkg/ajan/functionsfx/triggers"
	"github.com/eser/stack/pkg/ajan/httpfx"
)

// DefaultMaxBodyBytes bounds the body Handler reads unless WithMaxBody says
// otherwise: one mebibyte.
const DefaultMaxBodyBytes = 1 << 20

// Option sets one option of Handler.
type Option func(*config)

type config struct {
	maxBody int64
}

// WithMaxBody sets the most bytes of body a request may have. A larger body is
// an AdaptError and the response is a 400. A limit below one is ignored.
func WithMaxBody(limit int64) Option {
	return func(c *config) {
		if limit > 0 {
			c.maxBody = limit
		}
	}
}

// Event reads a request as a triggers.HTTPEvent. A body is read up to maxBody
// bytes; with a JSON content type it is decoded, and otherwise it is its text,
// or nil when empty. A body that is too large, cannot be read or is not the JSON
// its content type says is an AdaptError.
func Event(request *http.Request, maxBody int64) (triggers.HTTPEvent, error) {
	event := triggers.HTTPEvent{
		Method:  request.Method,
		Path:    request.URL.Path,
		Headers: firstValues(request.Header),
		Query:   firstValues(request.URL.Query()),
		Body:    nil,
	}

	if request.Body == nil {
		return event, nil
	}

	raw, err := io.ReadAll(io.LimitReader(request.Body, maxBody+1))
	if err != nil {
		return event, functionsfx.NewAdaptError("cannot read the request body: "+err.Error(), err)
	}

	if int64(len(raw)) > maxBody {
		return event, functionsfx.NewAdaptError(fmt.Sprintf("request body is above %d bytes", maxBody), triggers.ErrBodyTooLarge)
	}

	if len(raw) == 0 {
		return event, nil
	}

	if strings.Contains(strings.ToLower(request.Header.Get("Content-Type")), "json") {
		if err := triggers.DecodeJSON(raw, &event.Body); err != nil {
			return event, functionsfx.NewAdaptError("the request body is not valid JSON: "+err.Error(), err)
		}

		return event, nil
	}

	event.Body = string(raw)

	return event, nil
}

// firstValues keeps the first value of each key.
func firstValues(values map[string][]string) map[string]string {
	first := make(map[string]string, len(values))

	for key, list := range values {
		if len(list) > 0 {
			first[key] = list[0]
		}
	}

	return first
}

// Respond is a ResponseMapper for a function that answers HTTP: a success is a
// 200 with the output as its body, and an error is the status of
// triggers.StatusOf with the wire form of the error (error and errorKind) as its
// body, so the kind reaches the client. An error without a kind is a 500 that
// carries the error in Err instead: Result logs it and sends no detail of it.
func Respond[O any](output O, err error) triggers.HTTPResponse {
	if err == nil {
		return triggers.HTTPResponse{Status: http.StatusOK, Headers: map[string]string{}, Body: output, Err: nil}
	}

	status := triggers.StatusOf(err)
	if status >= http.StatusInternalServerError && functionsfx.KindOf(err) == functionsfx.KindUnknown {
		// An error without a kind says something went wrong inside: its text is
		// for the log, not the client.
		return triggers.HTTPResponse{Status: status, Headers: map[string]string{}, Body: nil, Err: err}
	}

	return triggers.HTTPResponse{Status: status, Headers: map[string]string{}, Body: functionsfx.ToWire(err), Err: nil}

}

// Result turns a response into the result of an httpfx route. A string or []byte
// body is sent as it is, text for a string, and any other body as JSON. Only the
// Content-Type of Headers is used, because an httpfx result carries no other. A
// response without a status is a 200, and one with Err is an error result whose
// text httpfx sends only when it discloses errors.
func Result(response triggers.HTTPResponse) httpfx.Result {
	var (
		results     httpfx.Results
		body        []byte
		contentType string
	)

	switch typed := response.Body.(type) {
	case nil:
	case string:
		body, contentType = []byte(typed), httpfx.ContentTypePlainText
	case []byte:
		body = typed
	default:
		encoded, err := json.Marshal(typed)
		if err != nil {
			return results.Error(http.StatusInternalServerError, httpfx.WithSanitizedError(err))
		}

		body, contentType = encoded, httpfx.ContentTypeJSON
	}

	if declared := response.Headers["Content-Type"]; declared != "" {
		contentType = declared
	}

	status := response.Status
	if status == 0 {
		status = http.StatusOK
	}

	var result httpfx.Result

	switch {
	case response.Err != nil:
		// httpfx logs the error and sends its text only when errors are
		// disclosed.
		return results.Error(status, httpfx.WithSanitizedError(response.Err))
	case status >= http.StatusBadRequest:
		result = results.Error(status, httpfx.WithBody(body))
	default:
		result = results.Bytes(body)
		result.InnerStatusCode = status
	}

	result.InnerContentType = contentType

	return result
}

// Handler makes an httpfx handler of a trigger. A request that cannot be read as
// an event gets the response of its AdaptError without the function running.
func Handler(trigger functionsfx.Trigger[triggers.HTTPEvent, triggers.HTTPResponse], options ...Option) httpfx.Handler {
	settings := config{maxBody: DefaultMaxBodyBytes}
	for _, option := range options {
		option(&settings)
	}

	return func(ctx *httpfx.Context) httpfx.Result {
		event, err := Event(ctx.Request, settings.maxBody)
		if err != nil {
			return Result(Respond[any](nil, err))
		}

		return Result(trigger(requestContext(ctx), event))
	}
}

func requestContext(ctx *httpfx.Context) context.Context {
	return ctx.Request.Context()
}
