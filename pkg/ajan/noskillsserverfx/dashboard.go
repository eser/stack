// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsserverfx

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/eser/stack/pkg/ajan/httpfx"
	"github.com/eser/stack/pkg/ajan/httpfx/middlewares"
	"github.com/eser/stack/pkg/ajan/logfx"
	"github.com/eser/stack/pkg/ajan/muxfx"
	"github.com/eser/stack/pkg/ajan/noskillsfx"
)

// The dashboard is the browser interface of one noskills project that
// `noskills web` served from TypeScript (@eserstack/noskills-web): the spec
// pages, a JSON API, the /events stream and the /mux WebSocket, on
// 127.0.0.1 over HTTP/1.1. It is separate from the daemon's HTTP/3 service:
// it serves one project, without the PIN, and a WebSocket needs HTTP/1.1.

const (
	// DashboardDefaultPort is the port `noskills web` listens on.
	DashboardDefaultPort = 3000

	// dashboardHost is the only interface the dashboard listens on.
	dashboardHost = "127.0.0.1"

	// dashboardShutdownTimeout bounds the shutdown: closing the panes, then
	// the open requests.
	dashboardShutdownTimeout = 10 * time.Second

	// dashboardHeaderTimeout and dashboardIdleTimeout bound a connection;
	// there is no write timeout, since /events and /mux stay open.
	dashboardHeaderTimeout = 10 * time.Second
	dashboardIdleTimeout   = 2 * time.Minute

	// dashboardMaxHeaderBytes bounds the request headers.
	dashboardMaxHeaderBytes = 1 << 20

	// dashboardMaxBodyBytes bounds a JSON request body.
	dashboardMaxBodyBytes = 1 << 20

	// contentTypeHTML is the type of every page.
	contentTypeHTML = "text/html; charset=utf-8"
)

// ErrDashboardRootMissing is returned by NewDashboard without a project root.
var ErrDashboardRootMissing = errors.New("the dashboard needs the project root")

// DashboardConfig configures a Dashboard.
type DashboardConfig struct {
	// Root is the project root, the directory that holds .eser/.
	Root string
	// Token is the access token mutating requests and /mux must carry; ""
	// mints one. `noskills web` reads it from NOSKILLS_WEB_TOKEN.
	Token string
	// DebugErrors adds the cause of a fault to its response as detail. Off
	// by default: the cause can name paths of the machine.
	DebugErrors bool
	// Env resolves the acting user and the clock of the spec actions; nil
	// uses the process environment and git, as the noskills CLI does.
	Env *noskillsfx.LifecycleEnv
	// NewPtyHost replaces the pseudo-terminal backend of the agent tabs, for
	// tests; nil uses pseudo-terminals.
	NewPtyHost func(cb muxfx.PtyHostCallbacks) muxfx.PtyHost
	// AgentCommand returns the binary a new tab runs; nil looks up claude,
	// then claude-code, on PATH.
	AgentCommand func() string
}

// Dashboard serves the noskills dashboard of one project.
type Dashboard struct {
	root        string
	token       string
	debugErrors bool
	env         *noskillsfx.LifecycleEnv
	logger      *logfx.Logger
	mux         *dashboardMux
	pages       *dashboardTemplates
	static      map[string]dashboardStaticAsset

	eventPoll      time.Duration
	keepalive      time.Duration
	newEventSource func() dashboardEventSource
}

// NewDashboard builds the dashboard of config.Root. No tab is open yet, and
// nothing listens until Serve.
func NewDashboard(config *DashboardConfig, logger *logfx.Logger) (*Dashboard, error) {
	if config.Root == "" {
		return nil, ErrDashboardRootMissing
	}

	root, err := filepath.Abs(config.Root)
	if err != nil {
		return nil, fmt.Errorf("resolve the dashboard root %q: %w", config.Root, err)
	}

	token := config.Token
	if token == "" {
		if token, err = NewDashboardToken(); err != nil {
			return nil, err
		}
	}

	pages, err := parseDashboardTemplates()
	if err != nil {
		return nil, err
	}

	env := config.Env
	if env == nil {
		env = lifecycleEnv(root)
	}

	d := &Dashboard{
		root: root, token: token, debugErrors: config.DebugErrors, env: env, logger: logger,
		mux:   newDashboardMux(root, config.NewPtyHost, config.AgentCommand, logger),
		pages: pages, static: dashboardStaticAssets(),
		eventPoll: dashboardEventPoll, keepalive: dashboardKeepalive, newEventSource: nil,
	}
	d.newEventSource = func() dashboardEventSource { return noskillsfx.NewDashboardEventTail(root) }

	return d, nil
}

// Token is the access token the dashboard pages carry.
func (d *Dashboard) Token() string {
	return d.token
}

// dashboardCSP is the Content-Security-Policy of the dashboard on port:
// scripts and styles only from the server, no inline scripts or style
// attributes (the browser scripts set styles through the CSSOM, which the
// policy does not restrict), and connections only to the server and its
// /mux WebSocket. A WebSocket is named by its ws: origin, since older
// browsers do not count it as 'self'.
func dashboardCSP(port int) []middlewares.CspOption {
	hosts := []string{"localhost", "127.0.0.1", "[::1]"}

	connect := make([]string, 0, 1+len(hosts))
	connect = append(connect, "'self'")

	for _, host := range hosts {
		connect = append(connect, "ws://"+host+":"+strconv.Itoa(port))
	}

	return []middlewares.CspOption{
		middlewares.WithCspDefaultSrc("'self'"),
		middlewares.WithCspScriptSrc("'self'"),
		middlewares.WithCspStyleSrc("'self'"),
		middlewares.WithCspImgSrc("'self'"),
		middlewares.WithCspConnectSrc(connect...),
		middlewares.WithCspObjectSrc("'none'"),
		middlewares.WithCspBaseURI("'none'"),
		middlewares.WithCspFrameAncestors("'none'"),
		middlewares.WithCspFormAction("'self'"),
	}
}

// Handler answers the dashboard's requests for a server listening on port,
// which the Origin check compares with.
func (d *Dashboard) Handler(port int) http.Handler {
	router := httpfx.NewRouter(d.logger)

	router.Use(
		middlewares.SecurityHeadersMiddleware(),
		middlewares.CspMiddleware(dashboardCSP(port)...),
		dashboardGuard(d.token, port),
	)

	routes := d.routes()

	router.RouteRaw("/", func(w http.ResponseWriter, r *http.Request) {
		d.serveRequest(routes, w, r)
	})

	return router.GetMux()
}

// routes are the dashboard's routes behind the guard. Any path or method
// they do not name answers 404, as in the TypeScript router.
func (d *Dashboard) routes() *http.ServeMux {
	mux := http.NewServeMux()

	// The service worker must be served from / to control the whole origin.
	mux.HandleFunc("GET /sw.js", func(w http.ResponseWriter, _ *http.Request) { d.serveStatic(w, "sw.js") })
	mux.HandleFunc("GET /manifest.json", func(w http.ResponseWriter, _ *http.Request) { d.serveStatic(w, "manifest.json") })
	mux.HandleFunc("/static/", func(w http.ResponseWriter, r *http.Request) {
		d.serveStatic(w, strings.TrimPrefix(r.URL.Path, "/static/"))
	})
	mux.HandleFunc("GET /events", d.handleEvents)
	mux.HandleFunc(dashboardMuxPath, d.handleMux)
	mux.HandleFunc("GET /api/state", d.handleState)
	mux.HandleFunc("GET /api/tabs", d.handleListTabs)
	mux.HandleFunc("POST /api/tab", d.handleCreateTab)
	mux.HandleFunc("DELETE /api/tab/", d.handleCloseTab)
	mux.HandleFunc("GET /api/spec/{name}/ledger", d.handleSpecLedger)
	mux.HandleFunc("GET /api/spec/{name}/summary", d.handleSpecSummary)
	mux.HandleFunc("POST /api/spec/{name}/{action}", d.handleAction)
	mux.HandleFunc("GET /spec/", d.handleSpecPage)
	mux.HandleFunc("GET /{$}", d.handleDashboardPage)
	mux.HandleFunc("/", func(w http.ResponseWriter, _ *http.Request) { writeNotFound(w) })

	return mux
}

// requestInfoKey is the context key of a request's requestInfo.
type requestInfoKey struct{}

// requestInfo is the id a request's log records and fault response share,
// and the fields every record of the request carries. Only the path is
// logged: the /mux query carries the token.
type requestInfo struct {
	id    string
	attrs []any
}

// infoOf is the request's requestInfo.
func infoOf(r *http.Request) *requestInfo {
	if info, ok := r.Context().Value(requestInfoKey{}).(*requestInfo); ok {
		return info
	}

	return &requestInfo{id: "", attrs: nil}
}

// serveRequest gives the request an id and turns a panic in a route into a
// logged fault: the record carries the id, and the client gets a 500 with
// the same id instead of the panic.
func (d *Dashboard) serveRequest(routes http.Handler, w http.ResponseWriter, r *http.Request) {
	id := newRequestID()
	info := &requestInfo{id: id, attrs: []any{"request_id", id, "method", r.Method, "path", r.URL.Path}}
	r = r.WithContext(context.WithValue(r.Context(), requestInfoKey{}, info))

	defer func() {
		recovered := recover()
		if recovered == nil {
			return
		}

		if err, ok := recovered.(error); ok && errors.Is(err, http.ErrAbortHandler) {
			panic(recovered)
		}

		d.fault(w, r, "Request could not be completed", http.StatusInternalServerError,
			fmt.Errorf("%w: %v", middlewares.ErrPanicRecovered, recovered))
	}()

	routes.ServeHTTP(w, r)
}

// newRequestID is a random UUID (version 4), the form the TypeScript server
// used, so a user can quote it from an alert and find the log record.
func newRequestID() string {
	var b [16]byte

	_, _ = rand.Read(b[:]) // crypto/rand.Read does not fail

	b[6] = b[6]&0x0f | 0x40
	b[8] = b[8]&0x3f | 0x80

	text := hex.EncodeToString(b[:])

	return text[0:8] + "-" + text[8:12] + "-" + text[12:16] + "-" + text[16:20] + "-" + text[20:]
}

// faultBody is the response of a fault.
type faultBody struct {
	OK        bool   `json:"ok"`
	Error     string `json:"error"`
	RequestID string `json:"requestId"`
	Detail    string `json:"detail,omitempty"`
}

// fault logs cause under the request id and answers
// {ok: false, error: reason, requestId}. reason is written by the caller and
// never derived from cause, which can name host paths; cause reaches the
// response only with DebugErrors.
func (d *Dashboard) fault(w http.ResponseWriter, r *http.Request, reason string, status int, cause error, attrs ...any) {
	info := infoOf(r)

	fields := append(append(append([]any{}, info.attrs...), attrs...), "err", cause)
	d.logger.ErrorContext(r.Context(), reason, fields...)

	body := faultBody{OK: false, Error: reason, RequestID: info.id, Detail: ""}
	if d.debugErrors {
		body.Detail = cause.Error()
	}

	writeJSON(w, status, body)
}

// writeJSON answers with v as JSON.
func writeJSON(w http.ResponseWriter, status int, v any) {
	encoded, err := json.Marshal(v)
	if err != nil {
		writePlainText(w, http.StatusInternalServerError, "Request could not be completed")

		return
	}

	w.Header().Set("Content-Type", contentTypeJSON)
	w.WriteHeader(status)
	_, _ = w.Write(encoded) // the client went away; nothing to report
}

// writePlainText answers with a text body.
func writePlainText(w http.ResponseWriter, status int, text string) {
	w.Header().Set("Content-Type", httpfx.ContentTypePlainText)
	w.WriteHeader(status)
	_, _ = w.Write([]byte(text)) // the client went away; nothing to report
}

// writeNotFound is the 404 of an unknown route or file.
func writeNotFound(w http.ResponseWriter) {
	writePlainText(w, http.StatusNotFound, "Not found")
}

// writeHTML answers with a rendered page.
func writeHTML(w http.ResponseWriter, page []byte) {
	w.Header().Set("Content-Type", contentTypeHTML)
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(page) //nolint:gosec // G705: html/template rendered and escaped the page; a failed write means the client went away
}

// Close stops every pane of the agent tabs, closes the attached socket and
// deletes the tabs' sessions. ctx bounds the wait for the panes.
func (d *Dashboard) Close(ctx context.Context) error {
	return d.mux.killAll(ctx)
}

// ListenDashboard opens the dashboard's listener on 127.0.0.1:port; port 0
// picks a free one.
func ListenDashboard(ctx context.Context, port int) (net.Listener, error) {
	var config net.ListenConfig

	listener, err := config.Listen(ctx, "tcp", net.JoinHostPort(dashboardHost, strconv.Itoa(port)))
	if err != nil {
		return nil, fmt.Errorf("listen on %s:%d: %w", dashboardHost, port, err)
	}

	return listener, nil
}

// Serve answers requests on listener until ctx ends, then closes the agent
// tabs and the open requests. Open /events streams end with ctx; the /mux
// socket ends when its tabs close.
func (d *Dashboard) Serve(ctx context.Context, listener net.Listener) error {
	port := 0
	if addr, ok := listener.Addr().(*net.TCPAddr); ok {
		port = addr.Port
	}

	lifetime, endLifetime := context.WithCancel(ctx)
	defer endLifetime()

	server := &http.Server{ //nolint:exhaustruct
		Handler:           d.Handler(port),
		ReadHeaderTimeout: dashboardHeaderTimeout,
		IdleTimeout:       dashboardIdleTimeout,
		MaxHeaderBytes:    dashboardMaxHeaderBytes,
		BaseContext:       func(net.Listener) context.Context { return lifetime },
		ErrorLog:          slog.NewLogLogger(d.logger.Handler(), slog.LevelWarn),
	}

	served := make(chan error, 1)

	// Owned by Serve, which waits for it below.
	go func() {
		served <- server.Serve(listener)
	}()

	var serveErr error

	select {
	case <-ctx.Done():
	case serveErr = <-served:
		served = nil
	}

	endLifetime()

	shutdownCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), dashboardShutdownTimeout)
	defer cancel()

	closeErr := d.Close(shutdownCtx)
	shutdownErr := server.Shutdown(shutdownCtx)

	if served != nil {
		serveErr = <-served
	}

	if errors.Is(serveErr, http.ErrServerClosed) {
		serveErr = nil
	}

	if shutdownErr != nil {
		shutdownErr = fmt.Errorf("stop the dashboard server: %w", shutdownErr)
	}

	return errors.Join(serveErr, closeErr, shutdownErr)
}
