package httpfx

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"sync/atomic"

	"github.com/eser/stack/pkg/ajan/results"
)

var (
	okResult = results.Define( //nolint:gochecknoglobals
		results.ResultKindSuccess,
		"OK",
		"OK",
	)
	errResult = results.Define( //nolint:gochecknoglobals
		results.ResultKindError,
		"ERR",
		"Error",
	)
)

// Result Options.
type ResultOption func(*Result)

func WithBody(body []byte) ResultOption {
	return func(result *Result) {
		result.InnerBody = body
	}
}

func WithPlainText(body string) ResultOption {
	return func(result *Result) {
		result.InnerBody = []byte(body)
	}
}

// WithErrorMessage wraps an error message in a JSON response with {"error": "message"} format.
func WithErrorMessage(message string) ResultOption {
	return WithJSON(map[string]string{"error": message})
}

// discloseErrors controls whether real error messages are sent to clients.
// Set via SetDiscloseErrors during startup based on config.
//
// Atomic because it is written at service construction and read on every
// request-handling goroutine. It was a plain bool while nothing called the
// setter outside tests; wiring ExposeInternalErrors into the service
// constructors made that a genuine data race, which the race detector caught
// immediately.
var discloseErrors atomic.Bool //nolint:gochecknoglobals

// SetDiscloseErrors enables/disables real error message disclosure in HTTP responses.
func SetDiscloseErrors(enabled bool) {
	discloseErrors.Store(enabled)
}

// WithSanitizedError puts err on the result and sends the client a generic
// error message instead of it, so internal details do not leak. The router
// logs err once, through its logger and with the request context, when it
// writes the result. When discloseErrors is enabled, the client gets err's
// message instead of the generic one.
func WithSanitizedError(err error) ResultOption {
	message := "an error occurred"
	if discloseErrors.Load() {
		message = err.Error()
	}

	writeMessage := WithErrorMessage(message)

	return func(result *Result) {
		result.InnerError = err

		writeMessage(result)
	}
}

// WithJSON encodes body as the result's body. A body that cannot be encoded
// turns the result into a 500 and adds the encoding error to the result, for
// the router to log.
func WithJSON(body any) ResultOption {
	return func(result *Result) {
		encoded, err := json.Marshal(body)
		if err != nil {
			result.InnerBody = []byte("Failed to encode JSON")
			result.InnerStatusCode = http.StatusInternalServerError
			result.InnerError = errors.Join(result.InnerError, encodeJSONError(body, err))

			return
		}

		result.InnerBody = encoded
	}
}

// Results With Options.
type Results struct{}

func (r *Results) Ok(options ...ResultOption) Result {
	result := Result{
		Result: okResult.New(),

		InnerStatusCode:    http.StatusNoContent,
		InnerRedirectToURI: "",
		InnerBody:          make([]byte, 0),
	}

	for _, option := range options {
		option(&result)
	}

	return result
}

func (r *Results) Accepted(options ...ResultOption) Result {
	result := Result{
		Result: okResult.New(),

		InnerStatusCode:    http.StatusAccepted,
		InnerRedirectToURI: "",
		InnerBody:          make([]byte, 0),
	}

	for _, option := range options {
		option(&result)
	}

	return result
}

func (r *Results) NotFound(options ...ResultOption) Result {
	result := Result{
		Result: okResult.New(),

		InnerStatusCode:    http.StatusNotFound,
		InnerRedirectToURI: "",
		InnerBody:          []byte("Not Found"),
	}

	for _, option := range options {
		option(&result)
	}

	return result
}

func (r *Results) Unauthorized(options ...ResultOption) Result {
	result := Result{
		Result: errResult.New(),

		InnerStatusCode:    http.StatusUnauthorized,
		InnerRedirectToURI: "",
		InnerBody:          make([]byte, 0),
	}

	for _, option := range options {
		option(&result)
	}

	return result
}

func (r *Results) BadRequest(options ...ResultOption) Result {
	result := Result{
		Result: errResult.New(),

		InnerStatusCode:    http.StatusBadRequest,
		InnerRedirectToURI: "",
		InnerBody:          []byte("Bad Request"),
	}

	for _, option := range options {
		option(&result)
	}

	return result
}

func (r *Results) Error(statusCode int, options ...ResultOption) Result {
	result := Result{
		Result: errResult.New(),

		InnerStatusCode:    statusCode,
		InnerRedirectToURI: "",
		InnerBody:          make([]byte, 0),
	}

	for _, option := range options {
		option(&result)
	}

	return result
}

// Results Without Options.
func (r *Results) Bytes(body []byte) Result {
	return Result{
		Result: okResult.New(),

		InnerStatusCode:    http.StatusOK,
		InnerRedirectToURI: "",
		InnerBody:          body,
	}
}

func (r *Results) PlainText(body []byte) Result {
	return Result{
		Result: okResult.New(),

		InnerStatusCode:    http.StatusOK,
		InnerRedirectToURI: "",
		InnerContentType:   ContentTypePlainText,
		InnerBody:          body,
	}
}

// JSON answers 200 with body encoded as JSON. A body that cannot be encoded
// gets a 500 that carries the encoding error, for the router to log.
func (r *Results) JSON(body any) Result {
	encoded, err := json.Marshal(body)
	if err != nil {
		return Result{
			Result: errResult.Wrap(encodeJSONError(body, err)),

			InnerStatusCode:    http.StatusInternalServerError,
			InnerRedirectToURI: "",
			InnerBody:          []byte("Failed to encode JSON"),
		}
	}

	return Result{
		Result: okResult.New(),

		InnerStatusCode:    http.StatusOK,
		InnerRedirectToURI: "",
		InnerContentType:   ContentTypeJSON,
		InnerBody:          encoded,
	}
}

func (r *Results) Redirect(uri string) Result {
	return Result{
		Result: okResult.New(),

		InnerStatusCode:    http.StatusTemporaryRedirect,
		InnerRedirectToURI: uri,
		InnerBody:          make([]byte, 0),
	}
}

// Abort answers 501 Not Implemented. It carries no error, so the router logs
// nothing for it; TracingMiddleware's request log records the status.
func (r *Results) Abort() Result {
	return Result{
		Result: errResult.New(),

		InnerStatusCode:    http.StatusNotImplemented,
		InnerRedirectToURI: "",
		InnerBody:          []byte("Not Implemented"),
	}
}

// encodeJSONError names the type that failed to encode. It names only the
// type: the value may hold personal data, which must not reach the log.
func encodeJSONError(body any, err error) error {
	return fmt.Errorf("encode %T response as JSON: %w", body, err)
}
