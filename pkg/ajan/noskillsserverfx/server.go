// Package noskillsserverfx provides the composition root for the noskills daemon.
// It wires Router, middlewares, REST handlers, and HTTP3Service.
package noskillsserverfx

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/tls"
	"encoding/hex"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/eser/stack/pkg/ajan/httpfx"
	"github.com/eser/stack/pkg/ajan/httpfx/middlewares"
	"github.com/eser/stack/pkg/ajan/lib"
	"github.com/eser/stack/pkg/ajan/logfx"
	"github.com/oklog/ulid/v2"
)

// ServerConfig holds daemon-level configuration.
type ServerConfig struct {
	// H3Addr is the UDP address for the HTTP/3 server (default ":4433").
	H3Addr string

	// DataDir is the root directory for daemon state (~/.noskills by default).
	DataDir string

	// CertString and KeyString are PEM-encoded cert/key for TLS.
	// When both are empty and SelfSigned is true, a cert is generated on startup.
	CertString string
	KeyString  string

	// SelfSigned controls whether a self-signed cert is auto-generated.
	// Used in development; Phase 5c adds mkcert support.
	SelfSigned bool

	// GracefulShutdownTimeout caps shutdown wait time.
	GracefulShutdownTimeout time.Duration
}

// DefaultServerConfig returns sensible defaults for local development.
func DefaultServerConfig() *ServerConfig {
	return &ServerConfig{
		H3Addr:                  ":4433",
		DataDir:                 "",
		SelfSigned:              true,
		GracefulShutdownTimeout: 5 * time.Second,
	}
}

// CertInfo carries the active TLS certificate and its SHA-256 fingerprint.
type CertInfo struct {
	// TLSConfig is ready to pass to HTTP3Service.SetupTLS.
	TLSConfig *tls.Config
	// Fingerprint is the hex-encoded SHA-256 of the leaf cert DER.
	// Expose at GET /api/cert-fingerprint and print on startup.
	Fingerprint string
	// FingerprintBytes is the raw SHA-256 for use with httpclient.WithH3CertHashes.
	FingerprintBytes []byte
}

// Server composes the daemon's HTTP/3 service, router, and middleware chain.
type Server struct {
	config      *ServerConfig
	router      *httpfx.Router
	h3svc       *httpfx.HTTP3Service
	logger      *logfx.Logger
	cert        *CertInfo
	sessions    *SessionManager
	authManager *AuthManager
	push        *PushDispatcher
}

// New builds a Server ready to Start. Routes and middlewares are wired here;
// the HTTP/3 listener is not opened until Start is called.
func New(config *ServerConfig, logger *logfx.Logger) *Server {
	if config == nil {
		config = DefaultServerConfig()
	}

	// Resolve DataDir: default to ~/.noskills when not explicitly set.
	dataDir := config.DataDir
	if dataDir == "" {
		if home, err := os.UserHomeDir(); err == nil {
			dataDir = filepath.Join(home, ".noskills")
		} else {
			dataDir = ".noskills"
		}

		config.DataDir = dataDir
	}

	h3Config := &httpfx.Config{ //nolint:exhaustruct
		H3Enabled:               true,
		H3ListenAddr:            config.H3Addr,
		H3MaxStreams:            100,
		GracefulShutdownTimeout: config.GracefulShutdownTimeout,
		CertString:              config.CertString,
		KeyString:               config.KeyString,
		SelfSigned:              config.SelfSigned,
	}

	router := httpfx.NewRouter("")

	// Load (or bootstrap) the auth state. Failure to load means auth.json is
	// corrupt; we start fresh so the PIN can be re-configured. Tokens are lost.
	authManager, err := NewAuthManager(dataDir)
	if err != nil {
		logger.Warn("noskillsserverfx: failed to load auth state, starting fresh", "err", err)
		authManager, _ = NewAuthManager(os.TempDir()) // fallback: in-memory only
	}

	// Middleware chain — order matters: error handler wraps everything, auth
	// gates all routes except the public ones listed in publicPaths.
	publicPaths := map[string]bool{
		"/api/health":                true,
		"/api/cert-fingerprint":      true,
		"/api/push/vapid-public-key": true,
		"/auth/setup":                true,
		"/auth/login":                true,
	}

	router.Use(
		middlewares.ErrorHandlerMiddleware(),
		middlewares.ProtocolVersionMiddleware("1"),
		middlewares.CorsMiddleware(),
		middlewares.PinAuthMiddleware(
			authManager.IsPINSetup,
			authManager.IsValidToken,
			func(ctx *httpfx.Context) bool {
				return publicPaths[ctx.Request.URL.Path]
			},
		),
	)

	h3svc := httpfx.NewHTTP3Service(h3Config, router, logger)

	s := &Server{
		config:      config,
		router:      router,
		h3svc:       h3svc,
		logger:      logger,
		authManager: authManager,
	}

	s.sessions = newSessionManager(s, logger)

	s.registerRoutes()

	return s
}

// Router exposes the router so callers can register additional routes before
// calling Start (e.g. noskillsserverfx sub-packages register their own routes).
func (s *Server) Router() *httpfx.Router {
	return s.router
}

// H3Service exposes the HTTP3Service for callers that need the WebTransportUpgrader.
func (s *Server) H3Service() *httpfx.HTTP3Service {
	return s.h3svc
}

// Cert returns cert metadata after Start has been called. Returns nil before Start.
func (s *Server) Cert() *CertInfo {
	return s.cert
}

// AuthManager exposes the daemon's AuthManager for pre-start PIN operations
// (e.g. auto-generating the first-run PIN before the HTTP server starts).
func (s *Server) AuthManager() *AuthManager {
	return s.authManager
}

// Start generates/loads the TLS certificate, opens the QUIC listener, and begins
// serving. Returns a cleanup function for graceful shutdown.
func (s *Server) Start(ctx context.Context) (func(), error) {
	certInfo, err := s.buildCert()
	if err != nil {
		return nil, fmt.Errorf("noskillsserverfx: cert setup: %w", err)
	}

	s.cert = certInfo

	// Start push dispatcher; non-fatal — daemon runs without push if it fails.
	push, err := newPushDispatcher(ctx, s.config.DataDir, s.logger)
	if err != nil {
		s.logger.Warn("noskillsserverfx: push disabled", "err", err)
	} else {
		s.push = push
	}

	if err := s.h3svc.SetupTLS(ctx, certInfo.TLSConfig); err != nil {
		return nil, fmt.Errorf("noskillsserverfx: TLS setup: %w", err)
	}

	cleanup, err := s.h3svc.Start(ctx)
	if err != nil {
		return nil, fmt.Errorf("noskillsserverfx: HTTP3 start: %w", err)
	}

	s.logger.InfoContext(ctx, "noskills-server running",
		"addr", s.config.H3Addr,
		"cert_fingerprint", certInfo.Fingerprint,
	)

	return cleanup, nil
}

// registerRoutes wires all built-in routes. External callers add routes via
// Router() before Start.
func (s *Server) registerRoutes() {
	// ── Auth (public — PinAuthMiddleware skips these paths) ────────────────
	s.router.Route("POST /auth/setup", s.handleSetupPIN).
		HasSummary("Setup PIN").
		HasDescription("First-run: set the PIN used to authenticate with the daemon")

	s.router.Route("POST /auth/login", s.handleLogin).
		HasSummary("Login").
		HasDescription("Verify PIN (rate-limited) and receive a Bearer token")

	s.router.Route("POST /auth/logout", s.handleLogout).
		HasSummary("Logout").
		HasDescription("Invalidate the current Bearer token")

	// ── Health ─────────────────────────────────────────────────────────────
	s.router.Route("GET /api/health", s.handleHealth).
		HasSummary("Health").
		HasDescription("Daemon health and version endpoint").
		HasResponseModel(http.StatusOK, &healthResponse{})

	// ── Cert fingerprint (unauthenticated — clients need it to pin the cert) ─
	s.router.Route("GET /api/cert-fingerprint", s.handleCertFingerprint).
		HasSummary("Cert fingerprint").
		HasDescription("Returns the SHA-256 hex fingerprint of the active leaf cert").
		HasResponseModel(http.StatusOK, &certFingerprintResponse{})

	// ── Projects ───────────────────────────────────────────────────────────
	s.router.Route("GET /api/projects", s.handleListProjects).
		HasSummary("List projects").
		HasDescription("List all registered projects")

	s.router.Route("POST /api/projects", s.handleAddProject).
		HasSummary("Add project").
		HasDescription("Register an existing project (path) or clone a new one (git)")

	s.router.Route("DELETE /api/projects/{slug}", s.handleDeleteProject).
		HasSummary("Delete project").
		HasDescription("Unregister a project by slug")

	// ── Specs ──────────────────────────────────────────────────────────────
	s.router.Route("GET /api/projects/{slug}/specs", s.handleListSpecs).
		HasSummary("List specs").
		HasDescription("List noskills specs for a project")

	s.router.Route("POST /api/projects/{slug}/specs", s.handleCreateSpec).
		HasSummary("Create spec").
		HasDescription("Start a new noskills spec")

	s.router.Route("POST /api/projects/{slug}/specs/{name}/{action}", s.handleSpecAction).
		HasSummary("Spec action").
		HasDescription("Run a spec action: next, approve, done, or block")

	// ── Sessions ───────────────────────────────────────────────────────────
	s.router.Route("GET /api/projects/{slug}/sessions", s.handleListSessions).
		HasSummary("List sessions").
		HasDescription("List active sessions for a project")

	s.router.Route("POST /api/projects/{slug}/sessions", s.handleCreateSession).
		HasSummary("Create session").
		HasDescription("Create a new session ID (worker is spawned on first WT attach)")

	s.router.Route("POST /api/projects/{slug}/sessions/{sid}/fork", s.handleForkSession).
		HasSummary("Fork session").
		HasDescription("Create a new session branching from sid at atMessageId (empty = current tail)")

	s.router.Route("GET /api/projects/{slug}/sessions/{sid}/lineage", s.handleSessionLineage).
		HasSummary("Session lineage").
		HasDescription("Return the root-first fork ancestry chain for a session")

	// ── Push notifications ─────────────────────────────────────────────────
	s.router.Route("GET /api/push/vapid-public-key", s.handleVAPIDPublicKey).
		HasSummary("VAPID public key").
		HasDescription("Returns the VAPID public key for Web Push subscription (unauthenticated)")

	s.router.Route("POST /api/push/subscribe", s.handleSubscribe).
		HasSummary("Subscribe to push").
		HasDescription("Register a browser push subscription endpoint")

	s.router.Route("DELETE /api/push/subscribe/{id}", s.handleUnsubscribe).
		HasSummary("Unsubscribe").
		HasDescription("Remove a push subscription by ID")

	s.router.Route("POST /api/push/test", s.handleTestPush).
		HasSummary("Test push").
		HasDescription("Send a test notification to a subscription")

	// ── WebTransport attach (RouteRaw — bypasses Result body-write) ────────
	// Clients connect via WebTransport to /attach/{slug}/{sid} to stream events
	// bidirectionally with the session's TS worker.
	s.router.RouteRaw("/attach/{slug}/{sid}", s.handleAttach)
}

// ── Handlers ──────────────────────────────────────────────────────────────────

type healthResponse struct {
	Status    string `json:"status"`
	Version   string `json:"version"`
	Commit    string `json:"commit,omitempty"`
	BuildDate string `json:"buildDate,omitempty"`
	Uptime    string `json:"uptime,omitempty"`
}

var startTime = time.Now() //nolint:gochecknoglobals

func (s *Server) handleHealth(ctx *httpfx.Context) httpfx.Result {
	return ctx.Results.JSON(&healthResponse{
		Status:    "ok",
		Version:   Version,
		Commit:    Commit,
		BuildDate: BuildDate,
		Uptime:    time.Since(startTime).Round(time.Second).String(),
	})
}

type certFingerprintResponse struct {
	Fingerprint string `json:"fingerprint"`
	Algorithm   string `json:"algorithm"`
}

func (s *Server) handleCertFingerprint(ctx *httpfx.Context) httpfx.Result {
	if s.cert == nil {
		return ctx.Results.Error(
			http.StatusServiceUnavailable,
			httpfx.WithSanitizedError(fmt.Errorf("cert not yet initialised")), //nolint:err113
		)
	}

	return ctx.Results.JSON(&certFingerprintResponse{
		Fingerprint: s.cert.Fingerprint,
		Algorithm:   "sha-256",
	})
}

// ── Session REST handlers ─────────────────────────────────────────────────────

type sessionSummary struct {
	SID  string `json:"sid"`
	Slug string `json:"slug"`
	Root string `json:"root"`
}

type listSessionsResponse struct {
	Sessions []sessionSummary `json:"sessions"`
}

func (s *Server) handleListSessions(ctx *httpfx.Context) httpfx.Result {
	slug := ctx.Request.PathValue("slug")

	if _, ok := s.projectPath(slug); !ok {
		return ctx.Results.Error(
			http.StatusNotFound,
			httpfx.WithSanitizedError(fmt.Errorf("project %q not found", slug)), //nolint:err113
		)
	}

	entries := s.sessions.ListBySlug(slug)
	result := make([]sessionSummary, 0, len(entries))

	for _, entry := range entries {
		result = append(result, sessionSummary{
			SID:  entry.SID,
			Slug: entry.Slug,
			Root: entry.Root,
		})
	}

	return ctx.Results.JSON(&listSessionsResponse{Sessions: result})
}

type createSessionRequest struct {
	ResumeFrom string `json:"resumeFrom,omitempty"`
}

type createSessionResponse struct {
	SessionID string `json:"sessionId"`
}

func (s *Server) handleCreateSession(ctx *httpfx.Context) httpfx.Result {
	slug := ctx.Request.PathValue("slug")

	if _, ok := s.projectPath(slug); !ok {
		return ctx.Results.Error(
			http.StatusNotFound,
			httpfx.WithSanitizedError(fmt.Errorf("project %q not found", slug)), //nolint:err113
		)
	}

	var req createSessionRequest

	_ = ctx.ParseJSONBody(&req)

	sid := req.ResumeFrom
	if sid == "" {
		sid = newSessionID()
	}

	return ctx.Results.JSON(&createSessionResponse{SessionID: sid})
}

// newSessionID generates a ULID-based session ID.
func newSessionID() string {
	return ulid.MustNew(ulid.Now(), rand.Reader).String()
}

// ── Cert helpers ──────────────────────────────────────────────────────────────

func (s *Server) buildCert() (*CertInfo, error) {
	var tlsCfg *tls.Config

	switch {
	case s.config.CertString != "" && s.config.KeyString != "":
		cert, err := tls.X509KeyPair(
			[]byte(s.config.CertString),
			[]byte(s.config.KeyString),
		)
		if err != nil {
			return nil, fmt.Errorf("load cert: %w", err)
		}

		tlsCfg = &tls.Config{ //nolint:exhaustruct
			Certificates: []tls.Certificate{cert},
			MinVersion:   tls.VersionTLS13,
		}
	case s.config.SelfSigned:
		cert, err := lib.GenerateSelfSignedCert()
		if err != nil {
			return nil, fmt.Errorf("generate self-signed cert: %w", err)
		}

		tlsCfg = &tls.Config{ //nolint:exhaustruct
			Certificates: []tls.Certificate{cert},
			MinVersion:   tls.VersionTLS13,
		}
	default:
		return nil, fmt.Errorf("no TLS configuration provided") //nolint:err113
	}

	return buildCertInfo(tlsCfg)
}

// buildCertInfo computes the SHA-256 fingerprint of the leaf cert in tlsCfg.
func buildCertInfo(tlsCfg *tls.Config) (*CertInfo, error) {
	if len(tlsCfg.Certificates) == 0 || len(tlsCfg.Certificates[0].Certificate) == 0 {
		return nil, fmt.Errorf("tlsConfig has no leaf certificate") //nolint:err113
	}

	der := tlsCfg.Certificates[0].Certificate[0]
	sum := sha256.Sum256(der)

	return &CertInfo{
		TLSConfig:        tlsCfg,
		Fingerprint:      hex.EncodeToString(sum[:]),
		FingerprintBytes: sum[:],
	}, nil
}
