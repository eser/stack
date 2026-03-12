package httpfx

import (
	"log/slog"
	"net/http"
	"sync"
	"sync/atomic"

	"github.com/eser/stack/apps/services/pkg/eser-go/httpfx/uris"
	"github.com/eser/stack/apps/services/pkg/eser-go/lib"
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
	mux  *http.ServeMux
	path string

	// Atomic pointer to immutable route table for lock-free reads
	table atomic.Pointer[routeTable]

	// Mutex for write operations (route registration)
	mu sync.RWMutex

	// frozen indicates routes can no longer be modified (set when server starts)
	frozen atomic.Bool
}

func NewRouter(path string) *Router {
	mux := http.NewServeMux()

	router := &Router{ //nolint:exhaustruct
		mux:  mux,
		path: path,
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

func (r *Router) GetPath() string {
	return r.path
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

// Group creates a new router with a prefixed path.
// The new router shares no state with the parent router.
func (r *Router) Group(path string) *Router {
	return NewRouter(r.path + path)
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

		// Handle redirect responses
		if result.RedirectToURI() != "" {
			responseWriter.Header().Set(
				"Location",
				result.RedirectToURI(),
			)
		}

		responseWriter.WriteHeader(result.StatusCode())

		_, err := responseWriter.Write(result.Body())
		if err != nil {
			slog.Error("Failed to write HTTP response body",
				slog.String("scope_name", "httpfx_router"),
				slog.Any("error", err))
		}
	}

	// TODO(@eser) Implement proper path combination for nested routers
	// Note: HTTP patterns like "GET /path" already include method and path
	// For nested routers, we need to modify the path part of the pattern
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
