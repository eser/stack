package middlewares

import (
	"errors"
	"fmt"
	"net/http"

	"github.com/eser/stack/pkg/ajan/httpfx"
)

// ErrPanicRecovered reports a handler that panicked rather than returning a
// Result.
var ErrPanicRecovered = errors.New("handler panicked")

// ErrorHandlerMiddleware converts a panic in any downstream handler into a 500
// Result instead of letting it escape the middleware chain.
//
// The body used to be `result := ctx.Next(); return result` -- a pure
// passthrough -- while being wired as the OUTERMOST middleware under the claim
// that the error handler wraps everything. It wrapped nothing. net/http does
// recover a panic at the connection level, but it does so by killing the
// connection, so the client sees a dropped request rather than a response, no
// Result-based error shaping applies, and any middleware bookkeeping after
// ctx.Next() is skipped.
//
// The recovered value goes through WithSanitizedError, so the panic text is
// logged server-side and never disclosed to the client unless the operator has
// explicitly enabled ExposeInternalErrors.
func ErrorHandlerMiddleware() httpfx.Handler {
	return func(ctx *httpfx.Context) (result httpfx.Result) {
		defer func() {
			recovered := recover()
			if recovered == nil {
				return
			}

			// net/http's documented way for a handler to abandon a response
			// without being reported as an error. Re-panic so the server keeps
			// treating it as such.
			if err, isError := recovered.(error); isError &&
				errors.Is(err, http.ErrAbortHandler) {
				panic(recovered)
			}

			result = ctx.Results.Error(
				http.StatusInternalServerError,
				httpfx.WithSanitizedError(
					fmt.Errorf("%w: %v", ErrPanicRecovered, recovered),
				),
			)
		}()

		return ctx.Next()
	}
}
