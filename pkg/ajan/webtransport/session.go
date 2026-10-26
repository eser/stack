package webtransport

import (
	"context"

	"github.com/quic-go/webtransport-go"
)

// Session is a thin wrapper over *webtransport.Session that exposes only the
// surface area needed by noskillsserverfx and noskills-client callers.
// Underlying bidi stream, uni stream, and datagram APIs are forwarded directly
// to avoid reimplementing webtransport-go's internal framing.
type Session struct {
	inner *webtransport.Session
}

// OpenBidiStream opens a new bidirectional WebTransport stream. The returned
// *webtransport.Stream implements both io.Reader and io.Writer.
func (s *Session) OpenBidiStream() (*webtransport.Stream, error) {
	return s.inner.OpenStream()
}

// OpenBidiStreamSync opens a bidirectional stream, blocking until the server
// permits opening a new stream (respects server-side stream limits).
func (s *Session) OpenBidiStreamSync(ctx context.Context) (*webtransport.Stream, error) {
	return s.inner.OpenStreamSync(ctx)
}

// AcceptBidiStream waits for the remote to open a bidirectional stream.
func (s *Session) AcceptBidiStream(ctx context.Context) (*webtransport.Stream, error) {
	return s.inner.AcceptStream(ctx)
}

// OpenUniStream opens a new unidirectional (send-only) stream.
func (s *Session) OpenUniStream() (*webtransport.SendStream, error) {
	return s.inner.OpenUniStream()
}

// AcceptUniStream waits for the remote to open a unidirectional (receive-only) stream.
func (s *Session) AcceptUniStream(ctx context.Context) (*webtransport.ReceiveStream, error) {
	return s.inner.AcceptUniStream(ctx)
}

// SendDatagram sends an unreliable datagram. Datagrams are limited to ~1200 B
// (QUIC MTU) and may be dropped; use only for lossy signals (presence, typing).
func (s *Session) SendDatagram(b []byte) error {
	return s.inner.SendDatagram(b)
}

// ReceiveDatagram waits for an incoming unreliable datagram.
func (s *Session) ReceiveDatagram(ctx context.Context) ([]byte, error) {
	return s.inner.ReceiveDatagram(ctx)
}

// Context returns the session's context. Cancelled when the session closes.
func (s *Session) Context() context.Context {
	return s.inner.Context()
}

// Close closes the session with error code 0.
func (s *Session) Close() error {
	return s.inner.CloseWithError(0, "")
}

// Inner returns the underlying *webtransport.Session for callers that need
// low-level access (e.g. testing with in-memory transports).
func (s *Session) Inner() *webtransport.Session {
	return s.inner
}
