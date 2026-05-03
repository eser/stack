package middlewares

import "github.com/eser/stack/pkg/ajan/httpfx"

// ProtocolVersionHeader is the response header that advertises the daemon's
// wire-protocol version. Clients send Accept-Protocol-Version: <n> and reject
// responses whose version is incompatible. Minor versions add fields only
// (backwards-compatible); major bumps break the contract.
const ProtocolVersionHeader = "Protocol-Version"

// ProtocolVersionMiddleware injects Protocol-Version: <version> on every
// response so clients can detect incompatible daemon versions without parsing
// the body.
func ProtocolVersionMiddleware(version string) httpfx.Handler {
	return func(ctx *httpfx.Context) httpfx.Result {
		ctx.ResponseWriter.Header().Set(ProtocolVersionHeader, version)

		return ctx.Next()
	}
}
