package middlewares

import (
	"context"
	"net/http"

	"github.com/eser/stack/pkg/ajan/httpfx"
	"github.com/eser/stack/pkg/ajan/lib"
)

const (
	ClientAddr       httpfx.ContextKey = "client-addr"
	ClientAddrIP     httpfx.ContextKey = "client-addr-ip"
	ClientAddrOrigin httpfx.ContextKey = "client-addr-origin"
)

// resolveAddressConfig holds the configuration for client address resolution.
// It is unexported as it's an internal detail of the ResolveAddressMiddleware.
type resolveAddressConfig struct {
	trustedProxies *httpfx.TrustedProxies
}

// ResolveAddressOption is a function type that modifies the resolveAddressConfig.
type ResolveAddressOption func(*resolveAddressConfig)

// WithTrustedProxies sets the proxy allowlist whose forwarded headers are
// believed. Without it no proxy is trusted and the socket peer always wins.
func WithTrustedProxies(trustedProxies *httpfx.TrustedProxies) ResolveAddressOption {
	return func(cfg *resolveAddressConfig) {
		cfg.trustedProxies = trustedProxies
	}
}

func ResolveAddressMiddleware(options ...ResolveAddressOption) httpfx.Handler {
	cfg := &resolveAddressConfig{trustedProxies: nil}

	for _, option := range options {
		option(cfg)
	}

	return func(ctx *httpfx.Context) httpfx.Result {
		addr := cfg.trustedProxies.ClientAddr(ctx.Request)

		newContext := context.WithValue(
			ctx.Request.Context(),
			ClientAddr,
			addr,
		)

		isLocal, err := lib.DetectLocalNetwork(addr)
		if err != nil {
			return ctx.Results.Error(
				http.StatusInternalServerError,
				httpfx.WithPlainText(err.Error()),
			)
		}

		if isLocal {
			newContext = context.WithValue(
				newContext,
				ClientAddrOrigin,
				"local",
			)

			ctx.ResponseWriter.Header().
				Set("X-Request-Origin", "local: "+addr)

			ctx.UpdateContext(newContext)

			return ctx.Next()
		}

		// TODO(@eser) add ip allowlist and blocklist implementations

		newContext = context.WithValue(
			newContext,
			ClientAddrOrigin,
			"remote",
		)

		ctx.ResponseWriter.Header().
			Set("X-Request-Origin", addr)

		ctx.UpdateContext(newContext)

		return ctx.Next()
	}
}

// GetClientAddrs returns the client address for req while trusting no proxy:
// forwarded headers are ignored and the socket peer decides. Deployments behind
// a real proxy must go through ResolveAddressMiddleware with WithTrustedProxies
// so the allowlist gates those headers.
func GetClientAddrs(req *http.Request) string {
	var trustedProxies *httpfx.TrustedProxies

	return trustedProxies.ClientAddr(req)
}
