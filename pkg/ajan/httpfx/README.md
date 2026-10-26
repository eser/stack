# 🌐 [ajan/httpfx](./)

> **eserstack Go library** in the root module `github.com/eser/stack`. Import
> `github.com/eser/stack/pkg/ajan/httpfx`. The module is not published for
> `go get`: build inside this repository, or require `github.com/eser/stack`
> with a `replace` directive that points at a checkout.

**httpfx** package provides a framework for building HTTP services with support
for routing, middleware, and OpenAPI documentation generation. It sits on the
standard library's `http.Server` and `http.ServeMux`: handlers return a `Result`
instead of writing the response, middlewares run as a chain around them, and the
`middlewares` package covers the security work every public service needs
(client address resolution, CORS, JWT, security headers, rate limits).

## Key Features

- HTTP routing on `http.ServeMux` patterns, with path parameters and wildcards
  (`GET /users/{id}`)
- Middleware support for request/response processing
- OpenAPI documentation generation from route metadata (`modules/openapi`)
- Graceful shutdown handling
- Configurable timeouts and server settings
- Support for CORS and security headers
- Request logging and metrics
- Health check and profiling endpoints (`modules/healthcheck`,
  `modules/profiling`)
- HTTP/3 and WebTransport through `HTTP3Service`

## Quick Start

A service with one route, loaded with the configuration defaults:

```go
package main

import (
	"context"
	"os"
	"os/signal"

	"github.com/eser/stack/pkg/ajan/configfx"
	"github.com/eser/stack/pkg/ajan/httpfx"
	"github.com/eser/stack/pkg/ajan/httpfx/middlewares"
	"github.com/eser/stack/pkg/ajan/logfx"
)

func main() {
	os.Exit(run())
}

// run returns the exit code, so its deferred calls finish before os.Exit.
func run() int {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()

	logger := logfx.NewLogger()

	// The default tags set the address (:8080) and the server timeouts;
	// an environment variable such as addr=:9090 overrides them.
	config := &httpfx.Config{}
	manager := configfx.NewConfigManager()

	err := manager.Load(config, manager.FromSystemEnv(true))
	if err != nil {
		logger.ErrorContext(ctx, "load config", "err", err)

		return 1
	}

	router := httpfx.NewRouter(logger)
	router.Use(
		middlewares.ErrorHandlerMiddleware(),
		middlewares.SecurityHeadersMiddleware(),
	)

	router.Route("GET /api/health", func(ctx *httpfx.Context) httpfx.Result {
		return ctx.Results.PlainText([]byte("OK"))
	})

	service := httpfx.NewHTTPService(config, router, logger)

	// A port in use or an invalid address fails here, before serving starts.
	cleanup, err := service.Start(ctx)
	if err != nil {
		logger.ErrorContext(ctx, "start HTTP service", "err", err)

		return 1
	}
	defer cleanup()

	<-ctx.Done()

	return 0
}
```

Run it, then `curl http://localhost:8080/api/health` returns `OK` with the
security headers. Ctrl+C shuts the server down gracefully.

## Configuration

Configuration struct for the HTTP service:

```go
type Config struct {
	Addr string `conf:"addr" default:":8080"`

	CertString        string        `conf:"cert_string"`
	KeyString         string        `conf:"key_string"`
	ReadHeaderTimeout time.Duration `conf:"read_header_timeout" default:"5s"`
	ReadTimeout       time.Duration `conf:"read_timeout"        default:"30s"`
	WriteTimeout      time.Duration `conf:"write_timeout"       default:"30s"`
	IdleTimeout       time.Duration `conf:"idle_timeout"        default:"300s"`

	InitializationTimeout   time.Duration `conf:"init_timeout"     default:"25s"`
	GracefulShutdownTimeout time.Duration `conf:"shutdown_timeout" default:"5s"`

	SelfSigned bool `conf:"self_signed" default:"false"`

	HealthCheckEnabled bool   `conf:"health_check" default:"true"`
	OpenAPIEnabled     bool   `conf:"openapi"      default:"true"`
	ProfilingEnabled   bool   `conf:"profiling"    default:"false"`
	ProfilingToken     string `conf:"profiling_token"`

	AuthIssuer   string `conf:"auth_issuer"`
	AuthAudience string `conf:"auth_audience"`
}
```

The list above shows the most used fields; `config.go` has the rest (connection
limits, rate limit, request size, trusted proxies, HTTP/3 and the WebTransport
origins in WebTransport Origins).

The `default` tags apply when [configfx](../configfx/README.md) loads the
struct, as in the Quick Start. A `Config` written in Go starts from zero values,
and a zero timeout means no timeout, so set every field the server needs:

```go
config := &httpfx.Config{
	Addr:                    ":8080",
	ReadHeaderTimeout:       5 * time.Second,
	ReadTimeout:             15 * time.Second,
	WriteTimeout:            15 * time.Second,
	IdleTimeout:             60 * time.Second,
	GracefulShutdownTimeout: 5 * time.Second,
	MaxConnections:          15000,
	OpenAPIEnabled:          true,
}
```

## Routes and Results

`Route` registers a handler for a `http.ServeMux` pattern. A handler returns a
`Result` built from `ctx.Results`, and the router writes it:

```go
router.Route("GET /users/{id}", func(ctx *httpfx.Context) httpfx.Result {
	user, found := users[ctx.Request.PathValue("id")]
	if !found {
		return ctx.Results.NotFound()
	}

	return ctx.Results.JSON(user)
}).
	HasSummary("Get a user").
	HasPathParameter("id", "The user ID").
	HasResponse(http.StatusOK)
```

The results:

- `Ok()` (204), `Accepted()` (202), `JSON(body)` (200, JSON), `PlainText(body)`
  (200, text), `Bytes(body)` (200), `Redirect(uri)` (307).
- `BadRequest()`, `Unauthorized()`, `NotFound()` and `Error(status)` for
  failures.
- Options for the methods that take them: `WithJSON`, `WithPlainText`,
  `WithBody`, `WithErrorMessage(message)`, which writes `{"error": message}`,
  and `WithSanitizedError(err)`, which puts `err` on the result and sends a
  generic message unless `expose_internal_errors` is on.

The router logs the error a result carries once, when it writes the result,
through the logger you passed to `NewRouter` and with the request's trace id.
That error comes from `WithSanitizedError`, or from a body that `JSON` or
`WithJSON` cannot encode, which also turns the result into a 500. A 5xx result
is logged as an error and any other status as a warning. `Abort()`, which
answers 501, carries no error, so only `TracingMiddleware`'s request log records
it. A handler you call yourself, outside the router, logs nothing: read the
error with `result.Unwrap()`.

`ctx.ParseJSONBody(&target)` decodes the request body, limited to
`max_request_size_mb` (50 MB by default). The `Has*` methods on the returned
`Route` describe it for the OpenAPI document that `modules/openapi` serves at
`/openapi.json`.

## Middleware

A middleware is a `Handler` that calls `ctx.Next()` to run the rest of the chain
and returns its `Result`, or returns a `Result` of its own to stop the request:

```go
func requireJSON() httpfx.Handler {
	return func(ctx *httpfx.Context) httpfx.Result {
		if ctx.Request.Header.Get("Content-Type") != "application/json" {
			return ctx.Results.Error(
				http.StatusUnsupportedMediaType,
				httpfx.WithErrorMessage("expected application/json"),
			)
		}

		return ctx.Next()
	}
}
```

`router.Use` adds middlewares for every route registered after it. The
`middlewares` package provides the ones below, and also `ErrorHandlerMiddleware`
(recovers panics into a 500), `TracingMiddleware`, `MetricsMiddleware`,
`ResponseTimeMiddleware`, `RequestSizeLimitMiddleware`, `CspMiddleware`,
`CsrfMiddleware` and `ProtocolVersionMiddleware`.

## Trusted Proxies

`X-Forwarded-For`, `X-Real-IP` and `True-Client-IP` are client-supplied, so they
are only read when the immediate peer is listed in `TrustedProxies`. The list is
empty by default, which makes the socket peer the only authority on the client
address. When the peer is trusted, `X-Forwarded-For` is walked right-to-left up
to the first hop outside the allowlist.

```go
// func NewTrustedProxies(entries []string) (*TrustedProxies, error)

trustedProxies, err := httpfx.NewTrustedProxies([]string{"10.0.0.0/8", "::1/128"})

clientIP := trustedProxies.ClientIP(req)     // bare IP
clientAddr := trustedProxies.ClientAddr(req) // host:port when not forwarded
```

Middleware wiring. `ResolveAddressMiddleware` takes the logger first: when it
cannot classify an address, it answers a bare 500 and logs the cause with the
request context, so the address and the parser's message never reach the client.

```go
// func ResolveAddressMiddleware(logger *logfx.Logger, options ...ResolveAddressOption) httpfx.Handler

router.Use(middlewares.ResolveAddressMiddleware(
	logger,
	middlewares.WithTrustedProxies(trustedProxies),
))
```

## CORS

`middlewares.CorsMiddleware` allows any origin anonymously by default
(`Access-Control-Allow-Origin: *`, no credentials). Credentialed cross-origin
access requires an explicit origin: the wildcard suppresses
`Access-Control-Allow-Credentials`, and the request origin is never reflected
back on the strength of a wildcard.

```go
router.Use(middlewares.CorsMiddleware(
	middlewares.WithAllowOrigin("https://a.example.com, https://b.example.com"),
	middlewares.WithAllowCredentials(true),
))
```

## JWT Authentication

`middlewares.AuthMiddleware` accepts a request only when its
`Authorization: Bearer` header carries a token that:

- is signed with the shared secret using HS256 (`WithAuthSigningMethod` pins
  another HMAC method instead);
- has an `exp` claim in the future;
- has the configured `iss` and `aud` claims, when `auth_issuer` and
  `auth_audience` are set.

The verified claims are stored in the request context under
`middlewares.ContextKeyAuthClaims` as `jwt.MapClaims`. An empty secret rejects
every request, because an HMAC key of zero bytes would accept tokens anyone can
sign.

```go
// func AuthMiddleware(logger *logfx.Logger, jwtSecret string, options ...AuthOption) httpfx.Handler

// jwtSecret comes from the environment, never from code or committed config.
router.Use(middlewares.AuthMiddleware(
	logger,
	jwtSecret,
	middlewares.WithAuthIssuer(config.AuthIssuer),
	middlewares.WithAuthAudience(config.AuthAudience),
))
```

Moving an existing deployment to this version:

- Tokens without `exp` are rejected. Issue every token with an expiry before you
  upgrade.
- Only HS256 is accepted by default. If you sign with HS384 or HS512, pass
  `middlewares.WithAuthSigningMethod(jwt.SigningMethodHS512)` (or HS384).
- `AuthMiddleware` takes the logger as its first argument.
- The issuer and audience checks stay off until `auth_issuer` and
  `auth_audience` are set, and the middleware logs a warning when it is built
  while either is empty. Add `iss` and `aud` to the tokens you issue, wait until
  the tokens without them have expired, then set both values.

## Security Headers

`middlewares.SecurityHeadersMiddleware` sets `X-Content-Type-Options: nosniff`,
`X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin` and
a `Permissions-Policy` that turns off camera, microphone, geolocation, screen
capture, payment, USB and motion sensors
(`middlewares.DefaultPermissionsPolicy`). `WithReferrerPolicy` and
`WithPermissionsPolicy` replace a policy; an empty string omits that header.

`Strict-Transport-Security` is sent on HTTPS requests only. Behind a
TLS-terminating proxy, list the proxy with `WithSecurityHeadersTrustedProxies`
so its `X-Forwarded-Proto: https` header counts; the header is ignored from
every other peer.

```go
router.Use(middlewares.SecurityHeadersMiddleware(
	middlewares.WithPermissionsPolicy("camera=(self), microphone=()"),
	middlewares.WithSecurityHeadersTrustedProxies(trustedProxies),
))
```

## Rate Limiting

`middlewares.RateLimitMiddleware` allows 60 requests per minute per client
address by default, using the address `ResolveAddressMiddleware` resolved when
it ran first. Loopback clients are limited like any other: behind a reverse
proxy on the same host every request comes from `127.0.0.1`, so exempting
loopback would turn the limit off. For local benchmarks only, opt in to the
exemption, which checks the socket peer and never a forwarded header:

```go
router.Use(middlewares.RateLimitMiddleware(
	middlewares.WithRateLimiterRequestsPerMinute(600),
	middlewares.WithRateLimiterSkipLoopback(),
))
```

Each `RateLimitMiddleware` call builds its own limiter, owned by the handler it
returns: two calls never share a count, so routes that must share a budget share
one handler. The limiter starts no goroutine: each request evicts the entries of
its part of the limiter whose window has ended, and a handler you stop using
leaves nothing running.

The address keys, the default one and `WithRateLimiterIPKeyFunc`, count an IPv4
client per address and an IPv6 client per /64 prefix
(`DefaultRateLimiterIPv6PrefixBits`). A /64 is the smallest network a site or a
host is usually given, so a client that rotates through the addresses of its
network still spends one budget; clients that share a /64 share it too.
`WithRateLimiterIPv6Prefix` sets another length, from 1 to 128 bits, where 128
counts each address on its own.

A limiter holds at most 100,000 keys (`DefaultRateLimiterMaxKeys`);
`WithRateLimiterMaxKeys` sets another limit. When a new key arrives at a full
limiter, it evicts the entries whose window has ended first, then the entry
whose window started earliest. The limit protects memory at a cost: under a
flood of new keys, an evicted client's count restarts, so that client can get
more than its limit in one window. The limit is split evenly over the limiter's
independently locked shards (32, or one per key below 32 keys), so a shard can
start evicting shortly before the total reaches it.

```go
router.Use(middlewares.RateLimitMiddleware(
	middlewares.WithRateLimiterRequestsPerMinute(600),
	middlewares.WithRateLimiterMaxKeys(250_000),
	middlewares.WithRateLimiterIPv6Prefix(56),
))
```

`RateLimitMiddleware` panics when `WithRateLimiterWindowSize` or
`WithRateLimiterMaxKeys` is not positive, and when `WithRateLimiterIPv6Prefix`
is outside 1 to 128.

Moving from the previous version: IPv6 clients in one /64 now share a count, and
an IPv4 address mapped into IPv6 (`::ffff:192.0.2.1`) is counted with its IPv4
form. Pass `middlewares.WithRateLimiterIPv6Prefix(128)` to count each IPv6
address on its own again.

## PIN Authentication

`middlewares.PinAuthMiddleware` checks the token from the
`Authorization: Bearer` header. A WebTransport CONNECT on a `RouteRaw` route may
send it as `?token=` instead, because browsers cannot set headers on that
request; every other request ignores the query string, since URLs end up in
access logs, browser history and `Referer` headers.

## Raw Routes

`Router.RouteRaw` registers a handler that writes the response itself, for
endpoints that take over the connection such as a WebTransport upgrade. The raw
handler is the last step of the middleware chain, so it receives the request
with the context values the middlewares added, such as the claims from
`AuthMiddleware`. A middleware that rejects the request by returning a Result
without calling `Next` stops the chain: the raw handler does not run, and the
Result is written as `Route` writes it. That holds for `AuthMiddleware`,
`RateLimitMiddleware`, `PinAuthMiddleware` and the preflight answer of
`CorsMiddleware`.

```go
// func (r *Router) RouteRaw(pattern string, handler http.HandlerFunc)

router.Use(middlewares.AuthMiddleware(logger, jwtSecret))

router.RouteRaw("/attach/{sid}", func(w http.ResponseWriter, r *http.Request) {
	// AuthMiddleware stored the claims; without them the handler never runs.
	claims, _ := r.Context().Value(middlewares.ContextKeyAuthClaims).(jwt.MapClaims)

	session, err := h3Service.Upgrader().Upgrade(w, r)
	if err != nil {
		http.Error(w, "WebTransport upgrade failed", http.StatusBadRequest)

		return
	}

	// Serve the session for claims["sub"] until it closes.
	serveAttach(r.Context(), session, claims)
})
```

On a raw route, the Result a middleware gets back from `Next` is a placeholder
204, and code after `Next` runs once the raw handler returns. When the raw
handler panics and `ErrorHandlerMiddleware` recovers the panic, the router
aborts the response with `http.ErrAbortHandler` instead of writing a 500 over
whatever the handler had sent. It logs the recovered panic first.

`HTTP3Service` serves its socket through the WebTransport server, which hands
plain HTTP/3 requests to the router. The cleanup function from `Start` closes
every connection and waits up to `shutdown_timeout` for the handlers to return:
webtransport-go has no graceful shutdown, so requests still in flight end with
their connection.

## WebTransport Origins

A browser sends the `Origin` of the page on every WebTransport CONNECT. By
default `WebTransportUpgrader.Upgrade` accepts a request without an `Origin`,
which does not come from a browser page, and one whose origin host equals the
request's `Host`, the same check webtransport-go applies. Every other origin is
refused, so another site's page cannot open a session through its visitor's
browser.

`h3_allowed_origins` (`Config.H3AllowedOrigins`) lists the other origins whose
pages may upgrade. Each entry is an exact origin as the browser sends it: an
`http` or `https` scheme, a host, and a port only when it is not the scheme's
default, with no path. There are no wildcards. Letter case and a default port
are normalized; anything else that is not an origin, such as
`https://app.example.com/`, makes `HTTP3Service.Start` fail with
`ErrHTTP3InvalidAllowedOrigin` before it opens the socket.

A refused request makes `Upgrade` return an error that wraps
`ErrWebTransportOriginNotAllowed`, so the handler can answer 403:

```go
config.H3AllowedOrigins = []string{"https://app.example.com", "http://localhost:3000"}
h3Service := httpfx.NewHTTP3Service(config, router, logger)

router.RouteRaw("/attach/{sid}", func(w http.ResponseWriter, r *http.Request) {
	session, err := h3Service.Upgrader().Upgrade(w, r)
	if errors.Is(err, httpfx.ErrWebTransportOriginNotAllowed) {
		http.Error(w, "origin not allowed", http.StatusForbidden)

		return
	}

	if err != nil {
		http.Error(w, "WebTransport upgrade failed", http.StatusBadRequest)

		return
	}

	serveAttach(r.Context(), session)
})
```

## Profiling

The `modules/profiling` package mounts the `net/http/pprof` handlers under
`/debug/pprof/`. They reveal memory, goroutine stacks and the command line, so
every request needs `Authorization: Bearer` with `profiling_token`, compared in
constant time; anything else gets 403. The token is never read from the query
string. With `profiling` on and no token, `RegisterHTTPRoutes` mounts nothing
and returns `profiling.ErrProfilingTokenNotSet`.

```go
// func RegisterHTTPRoutes(routes *httpfx.Router, config *httpfx.Config) error

// config.ProfilingToken comes from the environment, never from committed config.
if err := profiling.RegisterHTTPRoutes(router, config); err != nil {
	return fmt.Errorf("mount profiling routes: %w", err)
}
```

Fetch a profile with the token in the header:

```bash
curl -H "Authorization: Bearer your_profiling_token" \
  http://localhost:8080/debug/pprof/heap > heap.pprof
```

`modules/healthcheck` and `modules/openapi` mount `GET /health-check` and
`GET /openapi.json` the same way, when `health_check` and `openapi` are on.

## API

### NewRouter function

Creates a `Router` that logs, through the logger you pass, the error a result
carries and any response body it fails to write, with the request's trace id. A
write that fails because the client has gone away is logged at debug level only.
A result with an empty body, such as the 204 from `Results.Ok`, gets its status
and headers and no body write, because quic-go's HTTP/3 writer refuses even an
empty body for a 204.

The router has no path prefix: `Route` and `RouteRaw` register each pattern
exactly as written, so every pattern carries its full path. `NewRouter` panics
when the logger is nil.

```go
// func NewRouter(logger *logfx.Logger) *Router

router := httpfx.NewRouter(logger)

router.Route("GET /api/health", func(ctx *httpfx.Context) httpfx.Result {
	return ctx.Results.Ok()
})
```

Moving from the previous version: `NewRouter` took a `path` that was never
applied, and `GetPath` and `Group` are gone. Replace `httpfx.NewRouter("")` with
`httpfx.NewRouter(logger)`, and write the full path in each pattern.
`WithSanitizedError` and `JSON` logged through slog's default logger, at error
level and without the request context, when they built the result. The router
now logs that error as `httpfx router: request error`, with `pattern`, `status`
and `error`, and a result below 500 is logged as a warning.

### NewHTTPService function

Creates an `HTTPService` from the configuration, the router and a logger.
`Start` opens the listener before it returns, so an address that is in use or
invalid comes back as its error, which wraps `ErrHTTPServiceNetListenError` and
names the address. It then serves in the background and returns a cleanup
function that shuts the server down, waiting up to `shutdown_timeout` for
requests in flight, and returns once the server has stopped serving.

```go
// func NewHTTPService(config *Config, router *Router, logger *logfx.Logger) *HTTPService
// func (hs *HTTPService) Start(ctx context.Context) (func(), error)

hs := httpfx.NewHTTPService(config, router, logger)

cleanup, err := hs.Start(ctx)
if err != nil {
	return err
}
defer cleanup()
```

`Start` serves TLS when `cert_string` and `key_string` hold a PEM certificate
and key, or when `self_signed` is on (a certificate from
`lib.GenerateSelfSignedCert`); otherwise it serves plain HTTP and logs that
HTTP/2 is off.

## Upgrading from 4.x

These changes since 4.5.2 need a change in code, commands or files that use this
package. The [changelog](https://github.com/eser/stack/blob/main/CHANGELOG.md)
lists the changes in every package.

- `httpfx.NewRouter(path string)` is `NewRouter(logger *logfx.Logger)` and
  panics on a nil logger. `Router.GetPath` and `Router.Group` are removed; a
  prefix passed to `NewRouter` was never applied. Write the full path in every
  pattern:

  ```go
  // Before
  router := httpfx.NewRouter("/api")
  router.Route("GET /users", listUsers)
  // After
  router := httpfx.NewRouter(logger)
  router.Route("GET /api/users", listUsers)
  ```

- The router logs a result's error when it writes the result, as
  `httpfx router: request error` (scope `httpfx_router`, the router's logfx
  logger, with pattern, status, error and trace id), at WARN below status 500
  and ERROR from 500. It replaces `request error` (scope `httpfx_results`, the
  slog default logger, always ERROR) and `Failed to encode JSON response`. A
  failed body write is `httpfx router: response body not delivered` instead of
  `Failed to write HTTP response body`. Update log queries and alerts that match
  the old message, scope or level.
- `WithSanitizedError` no longer logs when it is called. Code that calls
  handlers and writes their `Result` itself, outside the router, logs the error:
  `if err := result.Unwrap(); err != nil { logger.ErrorContext(ctx, "request failed", "error", err) }`.
- A `Result` built with `WithSanitizedError`, or from a failed JSON encoding,
  carries the error, so `result.Error()` and `String()` include the internal
  text and `errors.Is(result, err)` matches. Never send `result.Error()` to a
  client; send `result.Body()`.
- `Router.RouteRaw` runs the raw handler as the last step of the middleware
  chain. A middleware that returns a `Result` without calling `Next` now stops
  the raw handler, and code after `Next` runs after it returns. Let the request
  through explicitly in middlewares whose rejection used to be ignored on raw
  routes.
- `profiling.RegisterHTTPRoutes` returns an error and reads the token from
  `httpfx.Config.ProfilingToken` (conf key `profiling_token`) instead of
  `PPROF_TOKEN`; `?token=` is no longer accepted. With profiling on and no
  token, nothing is mounted and `ErrProfilingTokenNotSet` is returned:

  ```go
  // Before: PPROF_TOKEN in the environment
  profiling.RegisterHTTPRoutes(router, config)
  // After: config.ProfilingToken loaded from profiling_token
  if err := profiling.RegisterHTTPRoutes(router, config); err != nil {
  	return err
  }
  // Clients send: Authorization: Bearer your_profiling_token
  ```

- `HTTPService.Start` falls back to a standard listener only when socket options
  cannot be set, and its listen error reads
  `HTTP service net listen error on "<addr>": ...`
  (`errors.Is(err, ErrHTTPServiceNetListenError)` still matches). `HTTP3Service`
  closes every connection at shutdown instead of draining in-flight requests.
  Match errors with `errors.Is`, not the text.
- `AuthMiddleware(jwtSecret)` is
  `AuthMiddleware(logger, jwtSecret, options...)`. It requires an `exp` claim,
  accepts only HS256 by default, rejects every request when the secret is empty,
  and answers 401 with `Invalid token` or `Token is expired` instead of
  `Invalid or expired token`:

  ```go
  // Before
  router.Use(middlewares.AuthMiddleware(cfg.JWTSecret))
  // After
  router.Use(middlewares.AuthMiddleware(
  	logger,
  	cfg.JWTSecret,
  	middlewares.WithAuthIssuer(cfg.AuthIssuer),
  	middlewares.WithAuthAudience(cfg.AuthAudience),
  	middlewares.WithAuthSigningMethod(jwt.SigningMethodHS512), // only for HS512 tokens
  ))
  ```

- `ResolveAddressMiddleware(options...)` is
  `ResolveAddressMiddleware(logger, options...)`, and its 500 body is
  `Internal Server Error` instead of the error text. Pass the service's logger
  first.
- `SecurityHeadersMiddleware` sends HSTS only on TLS requests, or when a proxy
  listed through `WithSecurityHeadersTrustedProxies` sends
  `X-Forwarded-Proto: https`. It adds
  `Referrer-Policy: strict-origin-when-cross-origin` and a `Permissions-Policy`
  that turns off camera, microphone, geolocation, display-capture, payment, usb
  and motion sensors. Pass `WithSecurityHeadersTrustedProxies(proxies)` behind a
  TLS proxy, and `WithPermissionsPolicy(...)` or `WithReferrerPolicy(...)` to
  change the policies (an empty string omits the header).
- `RateLimitMiddleware` changes:
  - loopback keys (127.0.0.1, ::1, localhost) are no longer exempt; local
    benchmarks pass `WithRateLimiterSkipLoopback()`;
  - the default key and `WithRateLimiterIPKeyFunc` group IPv6 clients by their
    /64 prefix, and an IPv4 address mapped into IPv6 counts as its IPv4 form;
    pass `WithRateLimiterIPv6Prefix(128)` to count each IPv6 address on its own;
  - a handler holds at most 100,000 keys, evicting expired windows first, then
    the oldest key, whose count restarts; pass `WithRateLimiterMaxKeys(n)` for
    another bound;
  - it panics at construction when `WithRateLimiterWindowSize` is not positive,
    `WithRateLimiterMaxKeys` is below 1, or `WithRateLimiterIPv6Prefix` is
    outside 1 to 128.

  ```go
  // After: the 4.x counting, one key per IPv6 address
  router.Use(middlewares.RateLimitMiddleware(
  	middlewares.WithRateLimiterIPv6Prefix(128),
  ))
  ```

- `PinAuthMiddleware` ignores `?token=` except on a WebTransport extended
  CONNECT on a `RouteRaw` route, and its 401 on raw routes is the plain-text
  body `unauthorized` instead of `{"error":"unauthorized"}`. REST clients send
  `Authorization: Bearer your_token`.

## 🔗 Links

- `go doc github.com/eser/stack/pkg/ajan/httpfx`: the API reference generated
  from source, with `go doc .../httpfx/middlewares` for the middlewares
- [ajan/logfx](../logfx/README.md): the logger, spans and metrics the router and
  middlewares use
- [ajan/configfx](../configfx/README.md): loads `Config` with its defaults
- [ajan/results](../results/README.md): the coded results that `Result` embeds
- [eser/stack on GitHub](https://github.com/eser/stack)
