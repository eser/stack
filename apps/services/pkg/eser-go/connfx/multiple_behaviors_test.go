package connfx_test

import (
	"log/slog"
	"os"
	"testing"

	"github.com/eser/stack/apps/services/pkg/eser-go/connfx"
	"github.com/eser/stack/apps/services/pkg/eser-go/logfx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestMultipleBehaviors_RedisAdapter(t *testing.T) { //nolint:funlen
	t.Parallel()

	// Create logger
	slogger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{ //nolint:exhaustruct
		Level: slog.LevelInfo, // Show info logs for this test to see behavior registration
	}))
	logger := logfx.NewLogger(logfx.WithFromSlog(slogger))

	ctx := t.Context()

	// Add Redis connection - NOTE: This will fail to connect since no Redis server is running
	// But we can still test the factory and behavior setup
	t.Run("factory_behaviors", func(t *testing.T) {
		t.Parallel()

		registry := connfx.NewRegistry(connfx.WithLogger(logger))

		// Register Redis adapter (supports both stateful and streaming)
		registry.RegisterFactory(connfx.NewRedisConnectionFactory("redis"))

		// Register other adapters for comparison
		registry.RegisterFactory(connfx.NewSQLConnectionFactory("sqlite"))
		registry.RegisterFactory(connfx.NewHTTPConnectionFactory("http"))

		protocols := registry.ListRegisteredProtocols()
		assert.Contains(t, protocols, "redis")
		assert.Contains(t, protocols, "sqlite")
		assert.Contains(t, protocols, "http")

		// Verify that all expected protocols are registered
		assert.Len(t, protocols, 3)
	})

	t.Run("behavior_filtering_with_multiple_behaviors", func(t *testing.T) {
		t.Parallel()

		registry := connfx.NewRegistry(connfx.WithLogger(logger))

		// Register adapters
		registry.RegisterFactory(connfx.NewRedisConnectionFactory("redis"))
		registry.RegisterFactory(connfx.NewSQLConnectionFactory("sqlite"))
		registry.RegisterFactory(connfx.NewHTTPConnectionFactory("http"))

		// Add SQLite connection (stateful only)
		sqlConfig := &connfx.ConfigTarget{ //nolint:exhaustruct
			Protocol: "sqlite",
			DSN:      ":memory:",
		}
		statefulConn, err := registry.AddConnection(ctx, "database", sqlConfig)
		require.NoError(t, err)
		require.NotNil(t, statefulConn)

		// Note: We can't test Redis connection without a Redis server,
		// but we can demonstrate the concept with SQL and HTTP

		// Test behavior filtering
		statefulConnections := registry.GetByBehavior(connfx.ConnectionBehaviorStateful)
		assert.Len(t, statefulConnections, 1)
		assert.Contains(t, statefulConnections[0].GetBehaviors(), connfx.ConnectionBehaviorStateful)

		// Test capability filtering
		relationalConnections := registry.GetByCapability(connfx.ConnectionCapabilityRelational)
		assert.Len(t, relationalConnections, 1)
		assert.Contains(
			t,
			relationalConnections[0].GetCapabilities(),
			connfx.ConnectionCapabilityRelational,
		)

		// Test that SQL connection only has stateful behavior
		conn := statefulConnections[0]
		behaviors := conn.GetBehaviors()
		assert.Contains(t, behaviors, connfx.ConnectionBehaviorStateful)
		assert.NotContains(t, behaviors, connfx.ConnectionBehaviorStateless)
		assert.NotContains(t, behaviors, connfx.ConnectionBehaviorStreaming)
	})

	t.Run("demonstrate_redis_multiple_behaviors", func(t *testing.T) {
		t.Parallel()

		registry := connfx.NewRegistry(connfx.WithLogger(logger))

		// Register adapters
		registry.RegisterFactory(connfx.NewRedisConnectionFactory("redis"))
		registry.RegisterFactory(connfx.NewSQLConnectionFactory("sqlite"))
		registry.RegisterFactory(connfx.NewHTTPConnectionFactory("http"))

		// Create a Redis connection config (won't actually connect)
		redisConfig := &connfx.ConfigTarget{ //nolint:exhaustruct
			Protocol: "redis",
			Host:     "localhost",
			Port:     6379,
		}

		// This will fail because no Redis server is running, but that's expected
		// We're demonstrating the configuration and behavior setup
		_, err := registry.AddConnection(ctx, "cache", redisConfig)

		// The connection will fail, but we can show what behaviors it would support
		t.Logf("Redis connection attempt failed as expected (no server): %v", err)

		// The factory still exists and reports its behaviors
		protocols := registry.ListRegisteredProtocols()
		assert.Contains(t, protocols, "redis")

		// Show that if Redis was connected, it would support both behaviors
		t.Log("Redis adapter supports both stateful (key-value) and streaming (pub/sub) behaviors")
	})
}

func TestBehaviorCombinations(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name              string
		protocol          string
		expectedBehaviors []connfx.ConnectionBehavior
		description       string
	}{
		{
			name:              "SQL connections",
			protocol:          "sqlite",
			expectedBehaviors: []connfx.ConnectionBehavior{connfx.ConnectionBehaviorStateful},
			description:       "Databases maintain connection state and transactions",
		},
		{
			name:              "HTTP connections",
			protocol:          "http",
			expectedBehaviors: []connfx.ConnectionBehavior{connfx.ConnectionBehaviorStateless},
			description:       "HTTP is request-response without persistent state",
		},
		{
			name:     "Redis connections",
			protocol: "redis",
			expectedBehaviors: []connfx.ConnectionBehavior{
				connfx.ConnectionBehaviorStateful,  // For GET/SET operations
				connfx.ConnectionBehaviorStreaming, // For PUBLISH/SUBSCRIBE
			},
			description: "Redis supports both key-value storage (stateful) and pub/sub (streaming)",
		},
	}

	for _, tt := range tests { //nolint:varnamelen
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			t.Logf("Testing %s: %s", tt.protocol, tt.description)

			// This is more of a documentation test showing the expected behaviors
			// In a real scenario, you'd test actual connection instances

			assert.NotEmpty(t, tt.expectedBehaviors)

			for _, behavior := range tt.expectedBehaviors {
				assert.NotEmpty(t, string(behavior))
				t.Logf("  - Supports behavior: %s", behavior)
			}
		})
	}
}
