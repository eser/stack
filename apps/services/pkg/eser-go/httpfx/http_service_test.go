package httpfx_test

import (
	"crypto/tls"
	"fmt"
	"net"
	"net/http"
	"testing"
	"time"

	"github.com/eser/stack/apps/services/pkg/eser-go/httpfx"
	"github.com/eser/stack/apps/services/pkg/eser-go/lib"
	"github.com/eser/stack/apps/services/pkg/eser-go/logfx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewHTTPService(t *testing.T) { //nolint:funlen
	t.Parallel()

	tests := []struct {
		name        string
		config      *httpfx.Config
		expectTLS   bool
		expectError bool
		selfSigned  bool
		certAndKey  bool
	}{
		{ //nolint:exhaustruct
			name: "basic_config",
			config: &httpfx.Config{ //nolint:exhaustruct
				Addr:              ":8080",
				ReadHeaderTimeout: time.Second * 10,
				ReadTimeout:       time.Second * 30,
				WriteTimeout:      time.Second * 30,
				IdleTimeout:       time.Second * 120,
				SelfSigned:        false,
			},
			expectTLS:   false,
			expectError: false,
		},
		{ //nolint:exhaustruct
			name: "self_signed_tls",
			config: &httpfx.Config{ //nolint:exhaustruct
				Addr:              ":8443",
				ReadHeaderTimeout: time.Second * 10,
				ReadTimeout:       time.Second * 30,
				WriteTimeout:      time.Second * 30,
				IdleTimeout:       time.Second * 120,
				SelfSigned:        true,
			},
			expectTLS:   true,
			expectError: false,
			selfSigned:  true,
		},
	}

	for _, tt := range tests { //nolint:varnamelen
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			logger := logfx.NewLogger()
			router := httpfx.NewRouter("/")

			service := httpfx.NewHTTPService(tt.config, router, logger)
			require.NotNil(t, service)

			err := service.SetupTLS(t.Context())
			require.NoError(t, err)

			assert.NotNil(t, service.Server())
			assert.Equal(t, tt.config.Addr, service.Server().Addr)
			assert.Equal(t, tt.config.ReadHeaderTimeout, service.Server().ReadHeaderTimeout)
			assert.Equal(t, tt.config.ReadTimeout, service.Server().ReadTimeout)
			assert.Equal(t, tt.config.WriteTimeout, service.Server().WriteTimeout)
			assert.Equal(t, tt.config.IdleTimeout, service.Server().IdleTimeout)

			if tt.expectTLS {
				assert.NotNil(t, service.Server().TLSConfig)
				assert.GreaterOrEqual(
					t,
					service.Server().TLSConfig.MinVersion,
					uint16(tls.VersionTLS12),
				)
			} else {
				assert.Nil(t, service.Server().TLSConfig)
			}
		})
	}
}

func TestHTTPService_Start(t *testing.T) { //nolint:funlen
	t.Parallel()

	logger := logfx.NewLogger()
	router := httpfx.NewRouter("/")

	// Create a listener first to get a random available port
	listener, err := net.Listen("tcp", ":0") //nolint:gosec
	require.NoError(t, err)

	port := listener.Addr().(*net.TCPAddr).Port //nolint:forcetypeassert
	listener.Close()                            //nolint:errcheck,gosec

	config := &httpfx.Config{ //nolint:exhaustruct
		Addr:                    fmt.Sprintf(":%d", port),
		ReadHeaderTimeout:       time.Second * 10,
		ReadTimeout:             time.Second * 30,
		WriteTimeout:            time.Second * 30,
		IdleTimeout:             time.Second * 120,
		SelfSigned:              false,
		GracefulShutdownTimeout: time.Second * 5,
	}

	service := httpfx.NewHTTPService(config, router, logger)
	require.NotNil(t, service)

	ctx := t.Context()
	cleanup, err := service.Start(ctx)
	require.NoError(t, err)
	require.NotNil(t, cleanup)

	defer cleanup()

	// Give the server a moment to start
	lib.SleepContext(t.Context(), 100*time.Millisecond)

	// Test server is running
	client := &http.Client{ //nolint:exhaustruct
		Timeout: time.Second * 5,
	}

	// Add a test endpoint
	router.GetMux().HandleFunc("/test", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	// Make a test request
	ctx = t.Context()
	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodGet,
		fmt.Sprintf("http://localhost:%d/test", port),
		nil,
	)
	require.NoError(t, err)
	resp, err := client.Do(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	resp.Body.Close() //nolint:errcheck,gosec

	// Test cleanup
	cleanup()

	// Give the server a moment to stop
	lib.SleepContext(t.Context(), 100*time.Millisecond)

	// Verify server has stopped
	req2, err := http.NewRequestWithContext(
		ctx,
		http.MethodGet,
		fmt.Sprintf("http://localhost:%d/test", port),
		nil,
	)
	require.NoError(t, err)
	resp2, err := client.Do(req2)
	require.Error(t, err)

	if resp2 != nil {
		resp2.Body.Close() //nolint:errcheck,gosec
	}
}
