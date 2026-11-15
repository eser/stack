// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package httptrigger_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/eser/stack/pkg/ajan/functionsfx"
	"github.com/eser/stack/pkg/ajan/functionsfx/triggers"
	"github.com/eser/stack/pkg/ajan/functionsfx/triggers/httptrigger"
	"github.com/eser/stack/pkg/ajan/httpfx"
)

type orderInput struct {
	Customer string `json:"customerId"`
}

type orderOutput struct {
	ID       string `json:"id"`
	Customer string `json:"customerId"`
}

// route builds the httpfx handler of a function that creates an order, and
// counts how many times the function ran.
func route(t *testing.T, create functionsfx.Handler[orderInput, orderOutput], options ...httptrigger.Option) (httpfx.Handler, *atomic.Int32) {
	t.Helper()

	var ran atomic.Int32

	counted := functionsfx.Handler[orderInput, orderOutput](func(ctx context.Context, input orderInput) (orderOutput, error) {
		ran.Add(1)

		return create(ctx, input)
	})

	trigger, err := functionsfx.NewTrigger(functionsfx.TriggerBinding[triggers.HTTPEvent, triggers.HTTPResponse, orderInput, orderOutput]{
		Handler: counted,
		AdaptInput: func(event triggers.HTTPEvent) (orderInput, error) {
			if event.Method != http.MethodPost {
				return orderInput{}, functionsfx.NewAdaptError("Method not allowed", nil)
			}

			return triggers.As[orderInput](event.Body)
		},
		AdaptOutput: httptrigger.Respond[orderOutput],
	})
	if err != nil {
		t.Fatalf("NewTrigger: %v", err)
	}

	return httptrigger.Handler(trigger, options...), &ran
}

func create(_ context.Context, input orderInput) (orderOutput, error) {
	if input.Customer == "" {
		return orderOutput{}, functionsfx.NewValidationError("customerId is required")
	}

	return orderOutput{ID: "order-1", Customer: input.Customer}, nil
}

func serve(handler httpfx.Handler, request *http.Request) httpfx.Result {
	return handler(&httpfx.Context{Request: request}) //nolint:exhaustruct
}

func jsonRequest(method, target, body string) *http.Request {
	request := httptest.NewRequestWithContext(context.Background(), method, target, strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")

	return request
}

func TestAnOrderIsCreatedFromAJSONBody(t *testing.T) {
	t.Parallel()

	handler, ran := route(t, create)

	result := serve(handler, jsonRequest(http.MethodPost, "/orders", `{"customerId":"cust-1"}`))

	if result.StatusCode() != http.StatusOK || result.ContentType() != httpfx.ContentTypeJSON {
		t.Fatalf("result = %d %q, want 200 JSON", result.StatusCode(), result.ContentType())
	}

	var got orderOutput
	if err := json.Unmarshal(result.Body(), &got); err != nil || got != (orderOutput{ID: "order-1", Customer: "cust-1"}) {
		t.Errorf("body = %s (%v)", result.Body(), err)
	}

	if ran.Load() != 1 {
		t.Errorf("function ran %d times, want 1", ran.Load())
	}
}

func TestAMalformedRequestIsA400AndTheFunctionDoesNotRun(t *testing.T) {
	t.Parallel()

	tests := []struct {
		request *http.Request
		name    string
	}{
		{jsonRequest(http.MethodPost, "/orders", `{not json`), "a body that is not JSON"},
		{jsonRequest(http.MethodPost, "/orders", `{"customerId":5}`), "a body of the wrong shape"},
		{jsonRequest(http.MethodGet, "/orders", ``), "a method the adapter refuses"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			handler, ran := route(t, create)
			result := serve(handler, tc.request)

			if result.StatusCode() != http.StatusBadRequest {
				t.Errorf("status = %d, want 400", result.StatusCode())
			}

			var wire functionsfx.WireError
			if err := json.Unmarshal(result.Body(), &wire); err != nil || wire.Kind != functionsfx.KindAdapt {
				t.Errorf("body = %s (%v), want errorKind AdaptError", result.Body(), err)
			}

			if ran.Load() != 0 {
				t.Errorf("the function ran %d times for a malformed request", ran.Load())
			}
		})
	}
}

func TestAFunctionErrorKeepsItsKindInTheResponse(t *testing.T) {
	t.Parallel()

	handler, _ := route(t, create)

	result := serve(handler, jsonRequest(http.MethodPost, "/orders", `{"customerId":""}`))

	var wire functionsfx.WireError
	if err := json.Unmarshal(result.Body(), &wire); err != nil {
		t.Fatalf("decode %s: %v", result.Body(), err)
	}

	if result.StatusCode() != http.StatusBadRequest || wire.Kind != functionsfx.KindValidation || wire.Message != "customerId is required" {
		t.Errorf("result = %d %+v, want a 400 with the ValidationError", result.StatusCode(), wire)
	}
}

func TestACancelledFunctionIsA503(t *testing.T) {
	t.Parallel()

	handler, _ := route(t, func(context.Context, orderInput) (orderOutput, error) {
		return orderOutput{}, context.Canceled
	})

	if got := serve(handler, jsonRequest(http.MethodPost, "/orders", `{"customerId":"c"}`)).StatusCode(); got != http.StatusServiceUnavailable {
		t.Errorf("status = %d, want 503", got)
	}
}

func TestEventReadsTheRequest(t *testing.T) {
	t.Parallel()

	request := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/greet?name=Ada&name=Bob&lang=tr", nil)
	request.Header.Set("X-Request-Id", "r-1")

	event, err := httptrigger.Event(request, httptrigger.DefaultMaxBodyBytes)
	if err != nil {
		t.Fatalf("Event: %v", err)
	}

	if event.Method != "GET" || event.Path != "/greet" || event.Query["name"] != "Ada" || event.Query["lang"] != "tr" ||
		event.Headers["X-Request-Id"] != "r-1" || event.Body != nil {
		t.Errorf("event = %+v", event)
	}
}

func TestEventReadsATextBodyAsText(t *testing.T) {
	t.Parallel()

	request := httptest.NewRequestWithContext(context.Background(), http.MethodPost, "/echo", strings.NewReader("hello"))
	request.Header.Set("Content-Type", "text/plain")

	event, err := httptrigger.Event(request, httptrigger.DefaultMaxBodyBytes)
	if err != nil || event.Body != "hello" {
		t.Errorf("Event = (%+v, %v)", event, err)
	}
}

func TestABodyAboveTheLimitIsAnAdaptError(t *testing.T) {
	t.Parallel()

	handler, ran := route(t, create, httptrigger.WithMaxBody(10))

	result := serve(handler, jsonRequest(http.MethodPost, "/orders", `{"customerId":"a-long-customer-id"}`))

	if result.StatusCode() != http.StatusBadRequest || ran.Load() != 0 {
		t.Errorf("status = %d, ran %d, want a 400 and no run", result.StatusCode(), ran.Load())
	}

	if _, err := httptrigger.Event(jsonRequest(http.MethodPost, "/", `{"a":1}`), 3); !functionsfx.IsKind(err, functionsfx.KindAdapt) {
		t.Errorf("Event over the limit: error = %v, want an AdaptError", err)
	}
}

func TestResultBodies(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		response   triggers.HTTPResponse
		wantBody   string
		wantType   string
		wantStatus int
	}{
		{"a string is text", triggers.HTTPResponse{Status: 200, Body: "hello"}, "hello", httpfx.ContentTypePlainText, 200},
		{"bytes are as they are", triggers.HTTPResponse{Status: 200, Body: []byte("raw")}, "raw", "", 200},
		{"a struct is JSON", triggers.HTTPResponse{Status: 201, Body: orderOutput{ID: "o"}}, `{"id":"o","customerId":""}`, httpfx.ContentTypeJSON, 201},
		{"no body is empty", triggers.HTTPResponse{Status: 204}, "", "", 204},
		{"a declared content type wins", triggers.HTTPResponse{Status: 200, Body: "<p>", Headers: map[string]string{"Content-Type": "text/html"}}, "<p>", "text/html", 200},
		{"an error status keeps its body", triggers.HTTPResponse{Status: 404, Body: "missing"}, "missing", httpfx.ContentTypePlainText, 404},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			result := httptrigger.Result(tc.response)

			if result.StatusCode() != tc.wantStatus || string(result.Body()) != tc.wantBody || result.ContentType() != tc.wantType {
				t.Errorf("result = %d %q %q, want %d %q %q", result.StatusCode(), result.Body(), result.ContentType(), tc.wantStatus, tc.wantBody, tc.wantType)
			}
		})
	}
}

func TestAResponseBodyThatCannotBeEncodedIsA500(t *testing.T) {
	t.Parallel()

	if got := httptrigger.Result(triggers.HTTPResponse{Status: 200, Body: make(chan int)}).StatusCode(); got != http.StatusInternalServerError {
		t.Errorf("status = %d, want 500", got)
	}
}

func TestAnUnexpectedErrorIsA500ThatHidesItsMessage(t *testing.T) {
	t.Parallel()

	failure := errors.New("pq: password authentication failed for user admin at 10.0.0.5")
	handler, _ := route(t, func(context.Context, orderInput) (orderOutput, error) {
		return orderOutput{}, failure
	})

	result := serve(handler, jsonRequest(http.MethodPost, "/orders", `{"customerId":"c"}`))

	if result.StatusCode() != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500", result.StatusCode())
	}

	if strings.Contains(string(result.Body()), "password") {
		t.Errorf("body = %s, want no detail of the error", result.Body())
	}

	if !errors.Is(result.InnerError, failure) {
		t.Errorf("InnerError = %v, want the error, so httpfx logs it", result.InnerError)
	}
}

func TestALargeIntegerInTheBodyKeepsItsValue(t *testing.T) {
	t.Parallel()

	event, err := httptrigger.Event(jsonRequest(http.MethodPost, "/orders", `{"id":9007199254740993}`), httptrigger.DefaultMaxBodyBytes)
	if err != nil {
		t.Fatalf("Event: %v", err)
	}

	input, err := triggers.As[struct {
		ID int64 `json:"id"`
	}](event.Body)
	if err != nil {
		t.Fatalf("As: %v", err)
	}

	if input.ID != 9007199254740993 {
		t.Errorf("id = %d, want 9007199254740993", input.ID)
	}
}

func TestAResponseWithoutAStatusIsA200(t *testing.T) {
	t.Parallel()

	result := httptrigger.Result(triggers.HTTPResponse{Body: "ok", Headers: map[string]string{}}) //nolint:exhaustruct

	if result.StatusCode() != http.StatusOK {
		t.Errorf("status = %d, want 200", result.StatusCode())
	}
}
