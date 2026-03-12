package middlewares

import "github.com/eser/stack/apps/services/pkg/eser-go/httpfx"

func ErrorHandlerMiddleware() httpfx.Handler {
	return func(ctx *httpfx.Context) httpfx.Result {
		result := ctx.Next()

		return result
	}
}
