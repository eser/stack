package httpfx

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"

	"github.com/eser/stack/pkg/ajan/lib"
	"github.com/eser/stack/pkg/ajan/logfx"
	"github.com/quic-go/quic-go"
	"github.com/quic-go/quic-go/http3"
	"github.com/quic-go/webtransport-go"
)

var (
	ErrHTTP3NoTLSConfig                = errors.New("HTTP3Service requires TLS configuration")
	ErrHTTP3ServiceNetListenError      = errors.New("HTTP3 service net listen error")
	ErrHTTP3FailedToLoadCert           = errors.New("HTTP3 failed to load certificate")
	ErrHTTP3FailedToGenerateSelfSigned = errors.New("HTTP3 failed to generate self-signed certificate")
)

// WebTransportUpgrader provides a clean Upgrade interface for RouteRaw handlers.
// The underlying webtransport.Server is initialised in NewHTTP3Service and shares
// the http3.Server instance via a pointer.
type WebTransportUpgrader struct {
	inner *webtransport.Server
}

// Upgrade upgrades an HTTP/3 CONNECT request to a WebTransport session.
// Must be called from a RouteRaw handler; returns an error if the client did
// not send a valid WebTransport CONNECT request.
func (u *WebTransportUpgrader) Upgrade(w http.ResponseWriter, r *http.Request) (*webtransport.Session, error) {
	session, err := u.inner.Upgrade(w, r)
	if err != nil {
		return nil, fmt.Errorf("WebTransport upgrade: %w", err)
	}

	return session, nil
}

// HTTP3Service runs an HTTP/3 server over QUIC, sharing the same Router (and
// therefore the same mux, routes, and middleware chain) as HTTPService. TLS 1.3
// is mandatory — QUIC requires it. Browsers negotiate h3 ALPN automatically, so
// existing REST routes work identically over HTTP/3.
type HTTP3Service struct {
	InnerServer   *http3.Server
	InnerRouter   *Router
	InnerUpgrader *WebTransportUpgrader

	Config *Config
	logger *logfx.Logger
}

func NewHTTP3Service(
	config *Config,
	router *Router,
	logger *logfx.Logger,
) *HTTP3Service {
	h3Server := &http3.Server{ //nolint:exhaustruct
		Addr:    config.H3ListenAddr,
		Handler: router.GetMux(),
		QUICConfig: &quic.Config{ //nolint:exhaustruct
			MaxIncomingStreams:    int64(config.H3MaxStreams),
			MaxIncomingUniStreams: int64(config.H3MaxStreams),
		},
	}

	// ConfigureHTTP3Server wires the QUIC connection context so that
	// WebTransport upgrade can retrieve the underlying QUIC connection.
	webtransport.ConfigureHTTP3Server(h3Server)

	wtServer := &webtransport.Server{ //nolint:exhaustruct
		H3: h3Server,
		// CheckOrigin nil → accepts any origin; callers should validate in
		// their RouteRaw handler or via the middleware chain.
	}

	return &HTTP3Service{
		InnerServer:   h3Server,
		InnerRouter:   router,
		InnerUpgrader: &WebTransportUpgrader{inner: wtServer},
		Config:        config,
		logger:        logger,
	}
}

func (hs *HTTP3Service) Server() *http3.Server {
	return hs.InnerServer
}

func (hs *HTTP3Service) Router() *Router {
	return hs.InnerRouter
}

// Upgrader returns the WebTransportUpgrader for use in RouteRaw handlers.
func (hs *HTTP3Service) Upgrader() *WebTransportUpgrader {
	return hs.InnerUpgrader
}

// SetupTLS configures TLS on the underlying http3.Server. If tlsConfig is nil,
// the method falls back to the Config fields (CertString/KeyString or SelfSigned).
// TLS 1.3 is enforced because QUIC requires it.
func (hs *HTTP3Service) SetupTLS(ctx context.Context, tlsConfig *tls.Config) error {
	if tlsConfig == nil {
		switch {
		case hs.Config.CertString != "" && hs.Config.KeyString != "":
			cert, err := tls.X509KeyPair([]byte(hs.Config.CertString), []byte(hs.Config.KeyString))
			if err != nil {
				return fmt.Errorf("%w: %w", ErrHTTP3FailedToLoadCert, err)
			}

			tlsConfig = &tls.Config{ //nolint:exhaustruct
				Certificates: []tls.Certificate{cert},
				MinVersion:   tls.VersionTLS13,
			}
		case hs.Config.SelfSigned:
			cert, err := lib.GenerateSelfSignedCert()
			if err != nil {
				return fmt.Errorf("%w: %w", ErrHTTP3FailedToGenerateSelfSigned, err)
			}

			tlsConfig = &tls.Config{ //nolint:exhaustruct
				Certificates: []tls.Certificate{cert},
				MinVersion:   tls.VersionTLS13,
			}
		default:
			return ErrHTTP3NoTLSConfig
		}
	}

	// Enforce TLS 1.3 — QUIC mandates it; silently upgrading prevents misconfiguration.
	if tlsConfig.MinVersion < tls.VersionTLS13 {
		tlsConfig.MinVersion = tls.VersionTLS13
	}

	hs.InnerServer.TLSConfig = tlsConfig

	return nil
}

// Start begins serving HTTP/3 on the configured UDP address and returns a
// cleanup function for graceful shutdown. The listener is a QUIC UDP PacketConn
// rather than a TCP socket.
func (hs *HTTP3Service) Start(ctx context.Context) (func(), error) {
	hs.logger.InfoContext(ctx, "HTTP3Service is starting...",
		slog.String("addr", hs.Config.H3ListenAddr),
		slog.Uint64("max_streams", hs.Config.H3MaxStreams),
	)

	if hs.InnerServer.TLSConfig == nil {
		return nil, ErrHTTP3NoTLSConfig
	}

	udpConn, err := net.ListenPacket("udp", hs.Config.H3ListenAddr)
	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrHTTP3ServiceNetListenError, err)
	}

	go func() {
		sErr := hs.InnerServer.Serve(udpConn)
		if sErr != nil && !errors.Is(sErr, http.ErrServerClosed) {
			hs.logger.ErrorContext(ctx, "HTTP3Service serve error",
				slog.Any("error", sErr))
		}
	}()

	cleanup := func() {
		hs.logger.InfoContext(ctx, "Shutting down HTTP3Service...")

		shutCtx, cancel := context.WithTimeout(ctx, hs.Config.GracefulShutdownTimeout)
		defer cancel()

		shutErr := hs.InnerServer.Shutdown(shutCtx)
		if shutErr != nil && !errors.Is(shutErr, http.ErrServerClosed) {
			hs.logger.ErrorContext(ctx, "HTTP3Service forced to shutdown",
				slog.Any("error", shutErr))

			return
		}

		hs.logger.InfoContext(ctx, "HTTP3Service has gracefully stopped.")
	}

	return cleanup, nil
}
