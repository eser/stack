// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsserverfx_test

import (
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/logfx"
	"github.com/eser/stack/pkg/ajan/noskillsserverfx"
	"github.com/eser/stack/pkg/ajan/webtransport"
	wt "github.com/quic-go/webtransport-go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestServer_Attach_WebTransport dials /attach over real HTTP/3 and
// WebTransport through the daemon's middleware chain. The project does not
// exist, so an attach the chain lets through upgrades and is then closed by
// handleAttach with code 1; a rejected attach never upgrades.
func TestServer_Attach_WebTransport(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	t.Parallel()

	addr := freeUDPPort(t)

	config := &noskillsserverfx.ServerConfig{
		H3Addr:                  addr,
		DataDir:                 t.TempDir(),
		SelfSigned:              true,
		GracefulShutdownTimeout: 2 * time.Second,
	}

	srv := noskillsserverfx.New(config, logfx.NewLogger(logfx.WithWriter(io.Discard)))

	const pin = "424242"

	require.NoError(t, srv.AuthManager().SetupPIN(pin))

	token, err := srv.AuthManager().Login("127.0.0.1", pin)
	require.NoError(t, err)

	cleanup, err := srv.Start(t.Context())
	require.NoError(t, err, "server start")
	t.Cleanup(cleanup)

	client, err := webtransport.NewClient(
		webtransport.WithCertHashes([][]byte{srv.Cert().FingerprintBytes}),
		webtransport.WithDialTimeout(5*time.Second),
	)
	require.NoError(t, err)
	t.Cleanup(func() {
		_ = client.Close() // always nil
	})

	_, port, err := net.SplitHostPort(addr)
	require.NoError(t, err)

	attachURL := fmt.Sprintf("https://127.0.0.1:%s/attach/no-such-project/s1", port)

	tests := []struct {
		name         string
		url          string
		bearer       string
		wantUpgraded bool
	}{
		{
			name:         "bearer token",
			url:          attachURL,
			bearer:       token.Value,
			wantUpgraded: true,
		},
		{
			name:         "query token",
			url:          attachURL + "?token=" + token.Value,
			wantUpgraded: true,
		},
		{
			name:         "no token",
			url:          attachURL,
			wantUpgraded: false,
		},
		{
			name:         "wrong token",
			url:          attachURL,
			bearer:       "not-a-token",
			wantUpgraded: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			headers := http.Header{}
			if tt.bearer != "" {
				headers.Set("Authorization", "Bearer "+tt.bearer)
			}

			sess, connectErr := client.ConnectWithHeaders(t.Context(), tt.url, headers)

			if !tt.wantUpgraded {
				require.Error(t, connectErr)
				assert.Contains(t, connectErr.Error(), "received status 401")

				return
			}

			require.NoError(t, connectErr, "the middleware chain lets the attach through")
			t.Cleanup(func() {
				_ = sess.Close() // the server has closed it already
			})

			// handleAttach ran past the upgrade: it looked the session up and
			// closed it because the project does not exist.
			_, acceptErr := sess.AcceptBidiStream(t.Context())

			sessionErr, ok := errors.AsType[*wt.SessionError](acceptErr)
			require.True(t, ok, "AcceptBidiStream() = %v, want a *webtransport.SessionError", acceptErr)
			assert.True(t, sessionErr.Remote)
			assert.Equal(t, wt.SessionErrorCode(1), sessionErr.ErrorCode)
		})
	}
}
