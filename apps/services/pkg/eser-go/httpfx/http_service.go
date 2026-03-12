package httpfx

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"sync/atomic"

	"github.com/eser/stack/apps/services/pkg/eser-go/lib"
	"github.com/eser/stack/apps/services/pkg/eser-go/logfx"
)

var (
	ErrFailedToLoadCertificate        = errors.New("failed to load certificate")
	ErrFailedToGenerateSelfSignedCert = errors.New("failed to generate self-signed certificate")
	ErrFailedToCreateHTTPMetrics      = errors.New("failed to create HTTP metrics")
	ErrHTTPServiceNetListenError      = errors.New("HTTP service net listen error")
)

type HTTPService struct {
	InnerServer  *http.Server
	InnerRouter  *Router
	InnerMetrics *Metrics

	Config *Config
	logger *logfx.Logger

	// Connection tracking for high-performance mode
	activeConns int64 // Atomic counter for ConnState tracking
	totalConns  int64 // Atomic counter for total connections served
}

func NewHTTPService(
	config *Config,
	router *Router,
	logger *logfx.Logger,
) *HTTPService {
	httpService := &HTTPService{
		InnerServer:  nil, // Will be set below
		InnerRouter:  router,
		InnerMetrics: nil, // Will be set below
		Config:       config,
		logger:       logger,
		activeConns:  0,
		totalConns:   0,
	}

	server := &http.Server{ //nolint:exhaustruct
		ReadHeaderTimeout: config.ReadHeaderTimeout,
		ReadTimeout:       config.ReadTimeout,
		WriteTimeout:      config.WriteTimeout,
		IdleTimeout:       config.IdleTimeout,
		MaxHeaderBytes:    config.MaxHeaderBytes,

		Addr: config.Addr,

		Handler: router.GetMux(),

		// ConnState callback for connection lifecycle tracking
		ConnState: httpService.connStateCallback,
	}

	metricsBuilder := logger.NewMetricsBuilder("httpfx")
	metrics := NewMetrics(metricsBuilder)

	httpService.InnerServer = server
	httpService.InnerMetrics = metrics

	return httpService
}

func (hs *HTTPService) Server() *http.Server {
	return hs.InnerServer
}

func (hs *HTTPService) Router() *Router {
	return hs.InnerRouter
}

// connStateCallback tracks connection lifecycle for metrics and debugging.
func (hs *HTTPService) connStateCallback(conn net.Conn, state http.ConnState) {
	switch state {
	case http.StateNew:
		atomic.AddInt64(&hs.activeConns, 1)
		atomic.AddInt64(&hs.totalConns, 1)
	case http.StateClosed, http.StateHijacked:
		atomic.AddInt64(&hs.activeConns, -1)
	case http.StateActive, http.StateIdle:
		// No action needed for active/idle transitions
	}
}

// ActiveConnections returns the current number of active connections.
func (hs *HTTPService) ActiveConnections() int64 {
	return atomic.LoadInt64(&hs.activeConns)
}

// TotalConnections returns the total number of connections served since startup.
func (hs *HTTPService) TotalConnections() int64 {
	return atomic.LoadInt64(&hs.totalConns)
}

func (hs *HTTPService) SetupTLS(ctx context.Context) error {
	switch {
	case hs.Config.CertString != "" && hs.Config.KeyString != "":
		cert, err := tls.X509KeyPair([]byte(hs.Config.CertString), []byte(hs.Config.KeyString))
		if err != nil {
			return fmt.Errorf("%w: %w", ErrFailedToLoadCertificate, err)
		}

		hs.InnerServer.TLSConfig = &tls.Config{ //nolint:exhaustruct
			Certificates: []tls.Certificate{cert},
			MinVersion:   tls.VersionTLS12,
		}
	case hs.Config.SelfSigned:
		cert, err := lib.GenerateSelfSignedCert()
		if err != nil {
			return fmt.Errorf("%w: %w", ErrFailedToGenerateSelfSignedCert, err)
		}

		hs.InnerServer.TLSConfig = &tls.Config{ //nolint:exhaustruct
			Certificates: []tls.Certificate{cert},
			MinVersion:   tls.VersionTLS12,
		}
	default:
		hs.logger.WarnContext(
			ctx,
			"HTTPService is starting without TLS, this will cause HTTP/2 support to be disabled",
		)
	}

	return nil
}

func (hs *HTTPService) Start(ctx context.Context) (func(), error) { //nolint:funlen
	hs.logger.InfoContext(ctx, "HTTPService is starting...",
		slog.String("addr", hs.Config.Addr),
		slog.Int("max_connections", hs.Config.MaxConnections),
		slog.Bool("tcp_no_delay", hs.Config.TCPNoDelay),
		slog.Bool("tcp_keep_alive", hs.Config.TCPKeepAlive),
	)

	// Freeze router to prevent further modifications (immutability pattern)
	hs.freezeRouter()

	if hs.InnerMetrics != nil {
		err := hs.InnerMetrics.Init()
		if err != nil {
			return nil, fmt.Errorf("%w: %w", ErrFailedToCreateHTTPMetrics, err)
		}
	}

	err := hs.SetupTLS(ctx)
	if err != nil {
		return nil, err
	}

	// Create high-performance listener with optimized socket options
	listener, lnErr := hs.createListener(ctx)
	if lnErr != nil {
		return nil, fmt.Errorf("%w: %w", ErrHTTPServiceNetListenError, lnErr)
	}

	go func() {
		var sErr error

		if hs.InnerServer.TLSConfig != nil {
			sErr = hs.InnerServer.ServeTLS(listener, "", "")
		} else {
			sErr = hs.InnerServer.Serve(listener)
		}

		if sErr != nil && !errors.Is(sErr, http.ErrServerClosed) {
			hs.logger.ErrorContext(ctx, "HTTPService ServeTLS error: %w", slog.Any("error", sErr))
		}
	}()

	cleanup := func() {
		hs.logger.InfoContext(ctx, "Shutting down server...",
			slog.Int64("active_connections", hs.ActiveConnections()),
			slog.Int64("total_connections_served", hs.TotalConnections()),
		)

		newCtx, cancel := context.WithTimeout(ctx, hs.Config.GracefulShutdownTimeout)
		defer cancel()

		err := hs.InnerServer.Shutdown(newCtx)
		if err != nil &&
			!errors.Is(err, http.ErrServerClosed) {
			hs.logger.ErrorContext(ctx, "HTTPService forced to shutdown", slog.Any("error", err))

			return
		}

		hs.logger.InfoContext(ctx, "HTTPService has gracefully stopped.")
	}

	return cleanup, nil
}

// freezeRouter freezes the router and all its routes, making them immutable.
// This is called when the server starts to ensure thread-safe request handling.
func (hs *HTTPService) freezeRouter() {
	if hs.InnerRouter == nil {
		return
	}

	// Freeze the router itself
	hs.InnerRouter.Freeze()

	// Freeze all registered routes
	for _, route := range hs.InnerRouter.GetRoutes() {
		route.Freeze()
	}
}

// createListener creates the appropriate listener based on configuration.
// Uses high-performance listener with socket options when available.
func (hs *HTTPService) createListener(ctx context.Context) (net.Listener, error) {
	// Try to create high-performance listener with socket options
	listenerConfig := &ListenerConfig{
		KeepAlive:       hs.Config.TCPKeepAlive,
		KeepAlivePeriod: hs.Config.TCPKeepAlivePeriod,
		TCPNoDelay:      hs.Config.TCPNoDelay,
		MaxConnections:  hs.Config.MaxConnections,
	}

	listener, err := NewHighPerfListener(ctx, hs.InnerServer.Addr, listenerConfig)
	if err != nil {
		// Fall back to standard listener if high-performance listener fails
		// This can happen on unsupported platforms
		hs.logger.WarnContext(
			ctx,
			"Failed to create high-performance listener, falling back to standard",
			slog.Any("error", err),
		)

		standardListener, listenErr := net.Listen("tcp", hs.InnerServer.Addr)
		if listenErr != nil {
			return nil, fmt.Errorf("standard listener creation: %w", listenErr)
		}

		return standardListener, nil
	}

	return listener, nil
}
