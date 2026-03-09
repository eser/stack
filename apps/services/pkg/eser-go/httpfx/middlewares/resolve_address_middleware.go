package middlewares

import (
	"context"
	"net/http"
	"strings"

	"github.com/eser/stack/apps/services/pkg/eser-go/httpfx"
	"github.com/eser/stack/apps/services/pkg/eser-go/lib"
)

const (
	ClientAddr       httpfx.ContextKey = "client-addr"
	ClientAddrIP     httpfx.ContextKey = "client-addr-ip"
	ClientAddrOrigin httpfx.ContextKey = "client-addr-origin"
)

func ResolveAddressMiddleware() httpfx.Handler {
	return func(ctx *httpfx.Context) httpfx.Result {
		addr := GetClientAddrs(ctx.Request)

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

func GetClientAddrs(req *http.Request) string {
	requester, hasHeader := req.Header["True-Client-IP"] //nolint:staticcheck

	if !hasHeader {
		requester, hasHeader = req.Header["X-Forwarded-For"]
	}

	if !hasHeader {
		requester, hasHeader = req.Header["X-Real-IP"] //nolint:staticcheck
	}

	// if the requester is still empty, use the hard-coded address from the socket
	if !hasHeader {
		requester = []string{req.RemoteAddr}
	}

	// split comma delimited list into a slice
	// (this happens when proxied via elastic load balancer then again through nginx)
	var addrs []string

	for _, addr := range requester {
		for entry := range strings.SplitSeq(addr, ",") {
			addrs = append(addrs, strings.Trim(entry, " "))
		}
	}

	return strings.Join(addrs, ", ")
}
