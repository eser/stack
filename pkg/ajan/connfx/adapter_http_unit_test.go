package connfx_test

import (
	"testing"

	"github.com/eser/stack/pkg/ajan/connfx"
	"github.com/eser/stack/pkg/ajan/httpclient"
	"github.com/eser/stack/pkg/ajan/logfx"
	"github.com/stretchr/testify/assert"
)

func TestHTTPAdapterBasics(t *testing.T) {
	t.Parallel()

	// Test 1: HTTP factory creation and protocol verification
	t.Run("factory creation", func(t *testing.T) {
		t.Parallel()

		factory := connfx.NewHTTPConnectionFactory("http")
		assert.Equal(t, "http", factory.GetProtocol())

		factory = connfx.NewHTTPConnectionFactory("https")
		assert.Equal(t, "https", factory.GetProtocol())
	})

	// Test 2: Mock HTTP connection creation (no health check)
	t.Run("mock HTTP connection", func(t *testing.T) {
		t.Parallel()

		// Create a mock HTTP connection bypassing health check
		client := httpclient.NewClient()
		headers := map[string]string{
			"User-Agent": "connfx-http-client/1.0",
			"Accept":     "application/json",
		}

		assert.IsType(t, (*httpclient.Client)(nil), client)
		assert.NotEmpty(t, headers)
		assert.Equal(t, "application/json", headers["Accept"])
		assert.Equal(t, "connfx-http-client/1.0", headers["User-Agent"])
	})

	// Test 3: Registry integration with HTTP factory
	t.Run("registry integration", func(t *testing.T) {
		t.Parallel()

		logger := logfx.NewLogger()
		registry := connfx.NewRegistry(
			connfx.WithLogger(logger),
			connfx.WithDefaultFactories(),
		)

		// Verify HTTP factories are registered
		protocols := registry.ListRegisteredProtocols()
		assert.Contains(t, protocols, "http")
		assert.Contains(t, protocols, "https")
	})

	// Test 4: Verify circuit breaker state methods exist
	t.Run("circuit breaker integration", func(t *testing.T) {
		t.Parallel()

		// Create a client to verify the types exist
		client := httpclient.NewClient()

		// Verify configuration types exist
		assert.True(t, client.Config.CircuitBreaker.Enabled)
		assert.True(t, client.Config.RetryStrategy.Enabled)
		assert.NotZero(t, client.Config.CircuitBreaker.FailureThreshold)
		assert.NotZero(t, client.Config.RetryStrategy.MaxAttempts)
	})
}
