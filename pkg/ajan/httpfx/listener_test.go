// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package httpfx_test

import (
	"io"
	"net"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/httpfx"
	"github.com/eser/stack/pkg/ajan/logfx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// dialTCP opens a client connection to addr that sends nothing and stays
// open until the test ends.
func dialTCP(t *testing.T, addr string) {
	t.Helper()

	var dialer net.Dialer

	conn, err := dialer.DialContext(t.Context(), "tcp", addr)
	require.NoError(t, err, "dial %s", addr)
	t.Cleanup(func() {
		_ = conn.Close() // the test is over; a close error changes nothing
	})
}

// With every connection slot taken, Accept waits for a slot rather than on
// the socket, and Close still ends it.
func TestHighPerfListener_CloseEndsAcceptAtTheLimit(t *testing.T) {
	t.Parallel()

	listener, err := httpfx.NewHighPerfListener(t.Context(), "127.0.0.1:0", &httpfx.ListenerConfig{
		MaxConnections: 1,
	})
	require.NoError(t, err)

	dialTCP(t, listener.Addr().String())

	first, err := listener.Accept()
	require.NoError(t, err)
	t.Cleanup(func() {
		_ = first.Close() // the test is over; a close error changes nothing
	})

	accepted := make(chan error, 1)

	go func() {
		conn, acceptErr := listener.Accept()
		if conn != nil {
			_ = conn.Close() // not expected; the assertion below reports it
		}

		accepted <- acceptErr
	}()

	require.NoError(t, listener.Close())

	select {
	case acceptErr := <-accepted:
		require.ErrorIs(t, acceptErr, net.ErrClosed)
	case <-time.After(5 * time.Second):
		t.Fatal("Accept was still waiting for a connection slot 5s after Close")
	}
}

// An address the server cannot listen on comes back from Start as its error.
// A plain listener would fail the same way, so Start does not log a fallback
// on the way, and the caller reports the failure once.
func TestHTTPService_StartListenFailure(t *testing.T) {
	t.Parallel()

	occupied, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	t.Cleanup(func() {
		_ = occupied.Close() // the test is over; a close error changes nothing
	})

	tests := []struct {
		name string
		addr string
	}{
		{name: "port in use", addr: occupied.Addr().String()},
		{name: "port out of range", addr: "127.0.0.1:70000"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			var logs lockedBuffer

			logger := logfx.NewLogger(
				logfx.WithWriter(&logs),
				logfx.WithConfig(&logfx.Config{Level: "DEBUG"}), //nolint:exhaustruct
			)
			config := &httpfx.Config{Addr: tt.addr} //nolint:exhaustruct
			service := httpfx.NewHTTPService(config, httpfx.NewRouter(logger), logger)

			cleanup, startErr := service.Start(t.Context())

			require.ErrorIs(t, startErr, httpfx.ErrHTTPServiceNetListenError)
			assert.Contains(t, startErr.Error(), tt.addr)
			assert.Nil(t, cleanup)
			assert.NotContains(t, logs.String(), "falling back", "no fallback for an address that cannot be listened on")
		})
	}
}

// A connection that never sends a request holds the only slot past the
// shutdown timeout. The cleanup from Start still returns, because closing the
// listener ends the Accept waiting for that slot and so the serve goroutine.
func TestHTTPService_CleanupWithEverySlotTaken(t *testing.T) {
	t.Parallel()

	// Find a free port first, so the test knows the address to dial.
	probe, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)

	addr := probe.Addr().String()
	require.NoError(t, probe.Close())

	config := &httpfx.Config{ //nolint:exhaustruct
		Addr:                    addr,
		ReadHeaderTimeout:       time.Minute,
		MaxConnections:          1,
		GracefulShutdownTimeout: 200 * time.Millisecond,
	}

	logger := logfx.NewLogger(logfx.WithWriter(io.Discard))
	service := httpfx.NewHTTPService(config, httpfx.NewRouter(logger), logger)

	cleanup, err := service.Start(t.Context())
	require.NoError(t, err)

	dialTCP(t, addr)

	require.Eventually(t, func() bool {
		return service.ActiveConnections() == 1
	}, 5*time.Second, 10*time.Millisecond, "the server accepts the idle connection")

	done := make(chan struct{})

	go func() {
		defer close(done)

		cleanup()
	}()

	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("cleanup did not return 5s after the shutdown timeout")
	}

	assert.Equal(t, int64(1), service.TotalConnections())
}
