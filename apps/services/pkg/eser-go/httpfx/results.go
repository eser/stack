package httpfx

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/eser/stack/apps/services/pkg/eser-go/results"
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
var discloseErrors bool //nolint:gochecknoglobals

// SetDiscloseErrors enables/disables real error message disclosure in HTTP responses.
func SetDiscloseErrors(enabled bool) {
	discloseErrors = enabled
}

// WithSanitizedError logs the full error server-side and returns a generic
// error message to the client, preventing internal details from leaking.
// When discloseErrors is enabled, the real error message is returned instead.
func WithSanitizedError(err error) ResultOption {
	slog.Error("request error",
		slog.String("scope_name", "httpfx_results"),
		slog.Any("error", err))

	if discloseErrors {
		return WithErrorMessage(err.Error())
	}

	return WithErrorMessage("an error occurred")
}

func WithJSON(body any) ResultOption {
	return func(result *Result) {
		encoded, err := json.Marshal(body)
		if err != nil {
			result.InnerBody = []byte("Failed to encode JSON")
			result.InnerStatusCode = http.StatusInternalServerError

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
		InnerBody:          body,
	}
}

func (r *Results) JSON(body any) Result {
	encoded, err := json.Marshal(body)
	if err != nil {
		slog.Error("Failed to encode JSON response",
			slog.String("scope_name", "httpfx_results"),
			slog.Any("error", err),
			slog.Any("body_type", body))

		return Result{
			Result: errResult.New(),

			InnerStatusCode:    http.StatusInternalServerError,
			InnerRedirectToURI: "",
			InnerBody:          []byte("Failed to encode JSON"),
		}
	}

	return Result{
		Result: okResult.New(),

		InnerStatusCode:    http.StatusOK,
		InnerRedirectToURI: "",
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

func (r *Results) Abort() Result {
	slog.Debug("Request aborted by handler",
		slog.String("scope_name", "httpfx_results"))

	return Result{
		Result: errResult.New(),

		InnerStatusCode:    http.StatusNotImplemented,
		InnerRedirectToURI: "",
		InnerBody:          []byte("Not Implemented"),
	}
}
