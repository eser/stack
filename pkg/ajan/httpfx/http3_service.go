package httpfx

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"slices"
	"time"

	"github.com/eser/stack/pkg/ajan/lib/netlib"
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
	inner  *webtransport.Server
	origin *webTransportOriginCheck
}

// Upgrade upgrades an HTTP/3 CONNECT request to a WebTransport session.
// Must be called from a RouteRaw handler; returns an error if the client did
// not send a valid WebTransport CONNECT request. The error wraps
// ErrWebTransportOriginNotAllowed when the request's Origin is neither the
// server's own nor listed in Config.H3AllowedOrigins, so the handler can
// answer 403.
func (u *WebTransportUpgrader) Upgrade(w http.ResponseWriter, r *http.Request) (*webtransport.Session, error) {
	if !u.origin.allows(r) {
		return nil, fmt.Errorf("WebTransport upgrade: %w (origin=%q)",
			ErrWebTransportOriginNotAllowed, r.Header.Get("Origin"))
	}

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

	// configErr is the Config error NewHTTP3Service found; Start returns it
	// before it opens the socket.
	configErr error
}

func NewHTTP3Service(
	config *Config,
	router *Router,
	logger *logfx.Logger,
) *HTTP3Service {
	applyConfigPolicies(config)

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

	// An invalid allowlist is reported by Start. Until then, and for the
	// service's whole life if Start is never called, the check falls back to
	// same-origin, which never widens what a page may open.
	originCheck, configErr := newWebTransportOriginCheck(config.H3AllowedOrigins)
	if configErr != nil {
		originCheck = &webTransportOriginCheck{allowed: map[string]struct{}{}}
	}

	// webtransport-go treats a nil CheckOrigin as same-origin only, which
	// would refuse the origins H3AllowedOrigins lists.
	wtServer := &webtransport.Server{ //nolint:exhaustruct
		H3:          h3Server,
		CheckOrigin: originCheck.allows,
	}

	return &HTTP3Service{
		InnerServer:   h3Server,
		InnerRouter:   router,
		InnerUpgrader: &WebTransportUpgrader{inner: wtServer, origin: originCheck},
		Config:        config,
		logger:        logger,
		configErr:     configErr,
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
			cert, err := netlib.GenerateSelfSignedCert()
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
// cleanup function that closes it. The listener is a QUIC UDP PacketConn
// rather than a TCP socket.
func (hs *HTTP3Service) Start(ctx context.Context) (func(), error) {
	hs.logger.InfoContext(ctx, "HTTP3Service is starting...",
		slog.String("addr", hs.Config.H3ListenAddr),
		slog.Uint64("max_streams", hs.Config.H3MaxStreams),
	)

	if hs.configErr != nil {
		return nil, hs.configErr
	}

	if hs.InnerServer.TLSConfig == nil {
		return nil, ErrHTTP3NoTLSConfig
	}

	// QUIC needs an ALPN protocol, and the webtransport.Server below uses this
	// config as is, unlike http3.Server.Serve, which added "h3" itself.
	if !slices.Contains(hs.InnerServer.TLSConfig.NextProtos, http3.NextProtoH3) {
		tlsConfig := hs.InnerServer.TLSConfig.Clone()
		tlsConfig.NextProtos = append(tlsConfig.NextProtos, http3.NextProtoH3)
		hs.InnerServer.TLSConfig = tlsConfig
	}

	udpConn, err := net.ListenPacket("udp", hs.Config.H3ListenAddr)
	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrHTTP3ServiceNetListenError, err)
	}

	// The webtransport.Server serves the socket, not the http3.Server. It
	// turns on the QUIC datagrams and partial-delivery stream resets that
	// WebTransport clients require, registers each connection so Upgrade can
	// find it, and hands every other stream to the http3.Server. Served by the
	// http3.Server alone, webtransport-go clients refused the connection and
	// Upgrade found no session manager for it.
	wtServer := hs.InnerUpgrader.inner

	go func() {
		sErr := wtServer.Serve(udpConn)
		if sErr != nil && !isHTTP3ServerClosed(sErr) {
			hs.logger.ErrorContext(ctx, "HTTP3Service serve error",
				slog.Any("error", sErr))
		}
	}()

	cleanup := func() {
		hs.logger.InfoContext(ctx, "Shutting down HTTP3Service...")

		// webtransport-go has no graceful shutdown for the connections it
		// serves: Close sends CONNECTION_CLOSE to every peer, then waits for
		// their handlers to return. The wait is bounded by the shutdown
		// timeout so a handler that ignores its closed connection cannot hold
		// the process open.
		closed := make(chan error, 1)

		go func() {
			closed <- wtServer.Close()
		}()

		timer := time.NewTimer(hs.Config.GracefulShutdownTimeout)
		defer timer.Stop()

		select {
		case closeErr := <-closed:
			// Close leaves the socket it was given open.
			_ = udpConn.Close() // nothing reads it any more; the error says nothing new

			if closeErr != nil && !isHTTP3ServerClosed(closeErr) {
				hs.logger.ErrorContext(ctx, "HTTP3Service close error",
					slog.Any("error", closeErr))

				return
			}

			hs.logger.InfoContext(ctx, "HTTP3Service has stopped.")
		case <-timer.C:
			// Close sends CONNECTION_CLOSE to every peer before it waits for
			// the handlers, so the socket has nothing left to carry; close it
			// instead of leaking it with the handlers that are still running.
			_ = udpConn.Close() // the handlers' own errors are what matter here

			hs.logger.ErrorContext(ctx, "HTTP3Service handlers did not return within the shutdown timeout",
				slog.Duration("shutdown_timeout", hs.Config.GracefulShutdownTimeout))
		}
	}

	return cleanup, nil
}

// isHTTP3ServerClosed reports whether err only says the server was closed on
// purpose: webtransport-go's Serve ends with its own context's cancellation,
// quic-go's listener with ErrServerClosed.
func isHTTP3ServerClosed(err error) bool {
	return errors.Is(err, http.ErrServerClosed) ||
		errors.Is(err, quic.ErrServerClosed) ||
		errors.Is(err, context.Canceled)
}
