package httpfx

import (
	"fmt"
	"log/slog"
	"net/http"
	"sync"
	"sync/atomic"

	"github.com/eser/stack/pkg/ajan/httpfx/uris"
	"github.com/eser/stack/pkg/ajan/lib"
	"github.com/eser/stack/pkg/ajan/logfx"
)

// routeTable holds an immutable snapshot of routes for lock-free reads.
// Updates create a new routeTable and atomically swap it.
type routeTable struct {
	handlers []Handler
	routes   []*Route
}

// Router provides HTTP routing with immutable route tables for safe concurrent access.
// Routes are registered during initialization and frozen when the server starts.
type Router struct {
	mux    *http.ServeMux
	logger *logfx.Logger

	// Atomic pointer to immutable route table for lock-free reads
	table atomic.Pointer[routeTable]

	// Mutex for write operations (route registration)
	mu sync.RWMutex

	// frozen indicates routes can no longer be modified (set when server starts)
	frozen atomic.Bool
}

// NewRouter creates a router that logs, through logger, the error a result
// carries and the responses it fails to write. Route and RouteRaw register
// each pattern exactly as given, so every pattern carries its full path
// ("GET /api/users").
//
// Panics if logger is nil: the router uses it only when a result carries an
// error or a write fails, so a nil logger would otherwise crash on one of
// those rarer paths instead of here.
func NewRouter(logger *logfx.Logger) *Router {
	if logger == nil {
		panic("httpfx: NewRouter needs a logger; pass the service's *logfx.Logger")
	}

	mux := http.NewServeMux()

	router := &Router{ //nolint:exhaustruct
		mux:    mux,
		logger: logger,
	}

	// Initialize with empty route table
	router.table.Store(&routeTable{
		handlers: make([]Handler, 0),
		routes:   make([]*Route, 0),
	})

	return router
}

func (r *Router) GetMux() *http.ServeMux {
	return r.mux
}

// GetHandlers returns a defensive copy of the registered middleware handlers.
// The returned slice can be safely modified without affecting the router.
func (r *Router) GetHandlers() []Handler {
	table := r.table.Load()
	if table == nil || len(table.handlers) == 0 {
		return nil
	}

	// Return a defensive copy
	result := make([]Handler, len(table.handlers))
	copy(result, table.handlers)

	return result
}

// GetRoutes returns a defensive copy of the registered routes.
// The returned slice can be safely modified without affecting the router.
func (r *Router) GetRoutes() []*Route {
	table := r.table.Load()
	if table == nil || len(table.routes) == 0 {
		return nil
	}

	// Return a defensive copy
	result := make([]*Route, len(table.routes))
	copy(result, table.routes)

	return result
}

// Freeze marks the router as immutable, preventing further route registration.
// This is automatically called when the HTTP server starts.
func (r *Router) Freeze() {
	r.frozen.Store(true)
}

// IsFrozen returns true if the router has been frozen.
func (r *Router) IsFrozen() bool {
	return r.frozen.Load()
}

// Use registers middleware handlers that will be called for all routes.
// Panics if the router has been frozen.
func (r *Router) Use(handlers ...Handler) {
	if r.frozen.Load() {
		panic("httpfx: cannot register middleware on frozen router")
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	// Get current table
	current := r.table.Load()

	// Create new immutable table with added handlers
	newHandlers := make([]Handler, len(current.handlers)+len(handlers))
	copy(newHandlers, current.handlers)
	copy(newHandlers[len(current.handlers):], handlers)

	// Atomically publish new table
	r.table.Store(&routeTable{
		handlers: newHandlers,
		routes:   current.routes,
	})
}

// Route registers a new route with the given pattern and handlers.
// Panics if the router has been frozen.
func (r *Router) Route(pattern string, handlers ...Handler) *Route { //nolint:funlen
	if r.frozen.Load() {
		panic("httpfx: cannot register route on frozen router")
	}

	parsed, err := uris.ParsePattern(pattern)
	if err != nil {
		panic(err)
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	// Get current table for reading handlers
	current := r.table.Load()

	// Create immutable copy of handlers for this route
	routeHandlers := make([]Handler, len(handlers))
	copy(routeHandlers, handlers)

	route := &Route{ //nolint:exhaustruct
		Pattern:  parsed,
		Handlers: routeHandlers,
		frozen:   false, // Will be frozen when router is frozen
	}

	// Capture handlers snapshot for the closure (immutable copy)
	middlewareSnapshot := make([]Handler, len(current.handlers))
	copy(middlewareSnapshot, current.handlers)

	route.MuxHandlerFunc = func(responseWriter http.ResponseWriter, req *http.Request) {
		// Use the frozen snapshots - no need to access router state
		allHandlers := lib.ArraysCopy(middlewareSnapshot, route.Handlers)

		ctx := &Context{
			Request:        req,
			ResponseWriter: responseWriter,

			Results: Results{},

			routeDef: route,
			handlers: allHandlers,
			index:    0,
		}

		result := allHandlers[0](ctx)

		r.logResultError(ctx.Request, route.Pattern.Str, &result)

		if err := writeResult(responseWriter, &result); err != nil {
			r.logWriteError(req, ctx.Request, route.Pattern.Str, result.StatusCode(), err)
		}
	}

	r.mux.HandleFunc(route.Pattern.Str, route.MuxHandlerFunc)

	// Create new immutable table with added route
	newRoutes := make([]*Route, len(current.routes)+1)
	copy(newRoutes, current.routes)
	newRoutes[len(current.routes)] = route

	// Atomically publish new table
	r.table.Store(&routeTable{
		handlers: current.handlers,
		routes:   newRoutes,
	})

	return route
}

// RouteRaw registers a pattern whose handler writes the response itself
// instead of returning a Result. Use it only for endpoints that take over the
// connection, such as WebTransport upgrades or raw streaming responses.
//
// The raw handler is the last step of the middleware chain, as a Route's
// handler is, so it receives the request with every context value the
// middlewares added (auth claims, client address, trace span). Each
// middleware receives a Context with IsRaw=true. On a raw route the Result a
// middleware gets back from Next is a placeholder 204, because the raw handler
// has written its own response, and code after Next runs once the raw handler
// returns, which for WebTransport is when the session ends.
//
// A middleware rejects the request by returning a Result without calling Next
// (AuthMiddleware's 401, RateLimitMiddleware's 429, CorsMiddleware's preflight
// 204). The raw handler then does not run, and the Result is written the way
// Route writes it. A middleware that wrote the response itself with WriteEarly
// gets nothing written on top of it.
//
// When the raw handler panics and a middleware such as ErrorHandlerMiddleware
// recovers the panic, the router cannot tell how much of a response the
// handler wrote, so it aborts the response with http.ErrAbortHandler instead
// of writing the middleware's 500. It still logs the error that 500 carries.
//
// Panics if the router has been frozen.
func (r *Router) RouteRaw(pattern string, handler http.HandlerFunc) {
	if r.frozen.Load() {
		panic("httpfx: cannot register route on frozen router")
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	current := r.table.Load()

	// The middleware snapshot plus the raw handler as the final step. The
	// slice is never written after this, so every request can share it.
	chain := make([]Handler, len(current.handlers), len(current.handlers)+1)
	copy(chain, current.handlers)
	chain = append(chain, rawHandlerStep(handler))

	r.mux.HandleFunc(pattern, func(responseWriter http.ResponseWriter, req *http.Request) {
		ctx := &Context{
			Request:        req,
			ResponseWriter: responseWriter,
			Results:        Results{},
			routeDef:       nil,
			handlers:       chain,
			index:          0,
			IsRaw:          true,
			EarlyWritten:   false,
			rawStarted:     false,
			rawReturned:    false,
		}

		result := chain[0](ctx)

		// Logged on every path, including those that write nothing: on the
		// abort path the result carries the panic a middleware recovered.
		r.logResultError(ctx.Request, pattern, &result)

		switch {
		case ctx.rawStarted && !ctx.rawReturned:
			// A middleware recovered a panic of the raw handler, which may have
			// written part of a response or taken over the connection already.
			panic(http.ErrAbortHandler)
		case ctx.rawStarted, ctx.EarlyWritten:
			return
		}

		if err := writeResult(responseWriter, &result); err != nil {
			r.logWriteError(req, ctx.Request, pattern, result.StatusCode(), err)
		}
	})
}

// rawHandlerStep turns a raw handler into the final step of a RouteRaw chain.
// It records on ctx whether the handler started and returned, which is how
// RouteRaw tells a rejection from a request the raw handler answered.
func rawHandlerStep(handler http.HandlerFunc) Handler {
	return func(ctx *Context) Result {
		// A middleware that answered with WriteEarly and still called Next must
		// not get a second response on top of its own.
		if ctx.EarlyWritten {
			return ctx.Results.Ok()
		}

		ctx.rawStarted = true

		handler(ctx.ResponseWriter, ctx.Request)

		ctx.rawReturned = true

		return ctx.Results.Ok()
	}
}

// writeResult writes result as the response: the redirect location, the
// content type when the result knows it, the status and the body. It returns
// the error of the body write.
func writeResult(responseWriter http.ResponseWriter, result *Result) error {
	if result.RedirectToURI() != "" {
		responseWriter.Header().Set(
			"Location",
			result.RedirectToURI(),
		)
	}

	// Must precede WriteHeader: headers set afterwards are silently
	// discarded. Only set when the result knows its type, so anything that
	// does not keeps net/http's sniffing behaviour, and never overwrite a
	// type a middleware or raw handler already chose.
	if contentType := result.ContentType(); contentType != "" {
		header := responseWriter.Header()
		if header.Get("Content-Type") == "" {
			header.Set("Content-Type", contentType)
		}
	}

	responseWriter.WriteHeader(result.StatusCode())

	// An empty body is not written at all. A zero-byte Write is not a no-op
	// everywhere: for a status that allows no body (204, 304), quic-go's
	// HTTP/3 writer returns http.ErrBodyNotAllowed even for zero bytes.
	body := result.Body()
	if len(body) == 0 {
		return nil
	}

	_, err := responseWriter.Write(body)
	if err != nil {
		return fmt.Errorf("write response body: %w", err)
	}

	return nil
}

// logResultError logs the error a result carries (see WithSanitizedError),
// once, with the trace and request ids from the context the middlewares built.
// A 5xx result is a server failure and is logged as an error. Any other status
// means the request was refused, such as a 404 for a missing project, and is
// logged as a warning.
func (r *Router) logResultError(handled *http.Request, pattern string, result *Result) {
	if result.InnerError == nil {
		return
	}

	attrs := []any{
		slog.String("scope_name", "httpfx_router"),
		slog.String("pattern", pattern),
		slog.Int("status", result.StatusCode()),
		slog.Any("error", result.InnerError),
	}

	if result.StatusCode() >= http.StatusInternalServerError {
		r.logger.ErrorContext(handled.Context(), "httpfx router: request error", attrs...)

		return
	}

	r.logger.WarnContext(handled.Context(), "httpfx router: request error", attrs...)
}

// logWriteError logs a failed body write once, with the trace and request
// ids from the context the middlewares built. served is the request the
// server passed in: its context ends when the client goes away, while a
// middleware may have cancelled the one it derived.
func (r *Router) logWriteError(
	served *http.Request,
	handled *http.Request,
	pattern string,
	status int,
	err error,
) {
	logCtx := handled.Context()
	attrs := []any{
		slog.String("scope_name", "httpfx_router"),
		slog.String("pattern", pattern),
		slog.Int("status", status),
		slog.Any("error", err),
	}

	// A client that has left cannot read the body, so its failed write is not
	// a server error.
	if served.Context().Err() != nil {
		r.logger.DebugContext(logCtx, "httpfx router: response body not delivered, the client left", attrs...)

		return
	}

	r.logger.ErrorContext(logCtx, "httpfx router: response body not delivered", attrs...)
}
