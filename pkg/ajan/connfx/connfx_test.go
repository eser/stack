package connfx_test

import (
	"database/sql"
	"log/slog"
	"net/http"
	"os"
	"testing"

	"github.com/eser/stack/pkg/ajan/connfx"
	"github.com/eser/stack/pkg/ajan/logfx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	_ "modernc.org/sqlite" // Import SQLite driver
)

// Mock logger for testing.
func newMockLogger() *logfx.Logger {
	slogger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{ //nolint:exhaustruct
		Level: slog.LevelError, // Only show errors in tests
	}))

	return logfx.NewLogger(logfx.WithFromSlog(slogger))
}

func TestRegistry_SQLiteConnection(t *testing.T) {
	t.Parallel()

	logger := newMockLogger()
	registry := connfx.NewRegistry(connfx.WithLogger(logger))

	// Register SQLite adapter
	registry.RegisterFactory(connfx.NewSQLConnectionFactory("sqlite"))

	ctx := t.Context()

	// Test SQLite connection (no external dependencies)
	config := &connfx.ConfigTarget{ //nolint:exhaustruct
		Protocol: "sqlite",
		DSN:      ":memory:",
	}

	conn, err := registry.AddConnection(ctx, "test", config)
	require.NoError(t, err)
	require.NotNil(t, conn)

	// Test connection properties
	assert.Contains(t, conn.GetBehaviors(), connfx.ConnectionBehaviorStateful)
	assert.Contains(t, conn.GetCapabilities(), connfx.ConnectionCapabilityRelational)
	assert.Equal(t, "sqlite", conn.GetProtocol())
	assert.Equal(t, connfx.ConnectionStateReady, conn.GetState())

	// Test health check
	status := conn.HealthCheck(ctx)
	assert.Equal(t, connfx.ConnectionStateReady, status.State)
	assert.NotZero(t, status.Timestamp)

	// Test type-safe connection extraction (should be *sql.DB)
	db, err := connfx.GetTypedConnection[*sql.DB](registry, "test")
	require.NoError(t, err)
	assert.NotNil(t, db)

	// Verify it's actually a working *sql.DB
	err = db.PingContext(ctx)
	require.NoError(t, err)

	// Close connection
	err = conn.Close(ctx)
	require.NoError(t, err)
}

func TestRegistry_GetDefaultConnection(t *testing.T) {
	t.Parallel()

	logger := newMockLogger()
	registry := connfx.NewRegistry(connfx.WithLogger(logger))

	// Register SQLite adapter
	registry.RegisterFactory(connfx.NewSQLConnectionFactory("sqlite"))

	ctx := t.Context()

	// Add default connection
	config := &connfx.ConfigTarget{ //nolint:exhaustruct
		Protocol: "sqlite",
		DSN:      ":memory:",
	}

	conn, err := registry.AddConnection(ctx, connfx.DefaultConnection, config)
	require.NoError(t, err)
	require.NotNil(t, conn)

	// Test GetDefault method
	defaultConn := registry.GetDefault()
	require.NotNil(t, defaultConn)

	// Test that the default connection is the one we added
	assert.Equal(t, conn, defaultConn)
}

func TestRegistry_LoadFromConfig(t *testing.T) {
	t.Parallel()

	logger := newMockLogger()
	registry := connfx.NewRegistry(connfx.WithLogger(logger))

	// Register SQLite adapter
	registry.RegisterFactory(connfx.NewSQLConnectionFactory("sqlite"))

	ctx := t.Context()

	config := &connfx.Config{
		Targets: map[string]connfx.ConfigTarget{
			connfx.DefaultConnection: { //nolint:exhaustruct
				Protocol: "sqlite",
				DSN:      ":memory:",
			},
		},
	}

	err := registry.LoadFromConfig(ctx, config)
	require.NoError(t, err)

	// Verify connection was loaded
	connections := registry.ListConnections()
	assert.Contains(t, connections, connfx.DefaultConnection)

	// Get the connection
	conn := registry.GetNamed(connfx.DefaultConnection)
	assert.NotNil(t, conn)
}

func TestRegistry_HealthCheck(t *testing.T) {
	t.Parallel()

	logger := newMockLogger()
	registry := connfx.NewRegistry(connfx.WithLogger(logger))

	// Register SQLite adapter
	registry.RegisterFactory(connfx.NewSQLConnectionFactory("sqlite"))

	ctx := t.Context()

	// Add connection
	config := &connfx.ConfigTarget{ //nolint:exhaustruct
		Protocol: "sqlite",
		DSN:      ":memory:",
	}

	conn, err := registry.AddConnection(ctx, "sql_test", config)
	require.NoError(t, err)
	require.NotNil(t, conn)

	// Test health check for all connections
	statuses := registry.HealthCheck(ctx)
	assert.Len(t, statuses, 1)
	assert.Contains(t, statuses, "sql_test")
	assert.Equal(t, connfx.ConnectionStateReady, statuses["sql_test"].State)

	// Test health check solely for the connection we added
	status := conn.HealthCheck(ctx)
	assert.Equal(t, connfx.ConnectionStateReady, status.State)

	// Test health check for non-existent connection
	conn = registry.GetNamed("nonexistent")
	assert.Nil(t, conn)
}

func TestRegistry_RemoveConnection(t *testing.T) {
	t.Parallel()

	logger := newMockLogger()
	registry := connfx.NewRegistry(connfx.WithLogger(logger))

	// Register SQLite adapter
	registry.RegisterFactory(connfx.NewSQLConnectionFactory("sqlite"))

	ctx := t.Context()

	// Add connection
	config := &connfx.ConfigTarget{ //nolint:exhaustruct
		Protocol: "sqlite",
		DSN:      ":memory:",
	}

	_, err := registry.AddConnection(ctx, "test", config)
	require.NoError(t, err)

	// Verify connection exists
	connections := registry.ListConnections()
	assert.Contains(t, connections, "test")

	// Remove connection
	err = registry.RemoveConnection(ctx, "test")
	require.NoError(t, err)

	// Verify connection is removed
	connections = registry.ListConnections()
	assert.NotContains(t, connections, "test")

	// Try to get removed connection
	connRemoved := registry.GetNamed("test")
	assert.Nil(t, connRemoved)
}

func TestRegistry_Close(t *testing.T) {
	t.Parallel()

	logger := newMockLogger()
	registry := connfx.NewRegistry(connfx.WithLogger(logger))

	// Register SQLite adapter
	registry.RegisterFactory(connfx.NewSQLConnectionFactory("sqlite"))

	ctx := t.Context()

	// Add connection
	config := &connfx.ConfigTarget{ //nolint:exhaustruct
		Protocol: "sqlite",
		DSN:      ":memory:",
	}

	_, err := registry.AddConnection(ctx, "test", config)
	require.NoError(t, err)

	// Close all connections
	err = registry.Close(ctx)
	require.NoError(t, err)

	// Verify all connections are removed
	connections := registry.ListConnections()
	assert.Empty(t, connections)
}

func TestConnectionStates(t *testing.T) {
	t.Parallel()

	// Test that connection states are properly defined
	states := []connfx.ConnectionState{
		connfx.ConnectionStateNotInitialized,
		connfx.ConnectionStateConnected,
		connfx.ConnectionStateLive,
		connfx.ConnectionStateReady,
		connfx.ConnectionStateDisconnected,
		connfx.ConnectionStateError,
		connfx.ConnectionStateReconnecting,
	}

	for _, state := range states {
		assert.NotEmpty(t, state.String())
	}
}

func TestConnectionBehaviors(t *testing.T) {
	t.Parallel()

	// Test that connection behaviors are properly defined
	behaviors := []connfx.ConnectionBehavior{
		connfx.ConnectionBehaviorStateful,
		connfx.ConnectionBehaviorStateless,
		connfx.ConnectionBehaviorStreaming,
	}

	for _, behavior := range behaviors {
		assert.NotEmpty(t, string(behavior))
	}
}

func TestRegistry_BehaviorFiltering(t *testing.T) {
	t.Parallel()

	logger := newMockLogger()
	registry := connfx.NewRegistry(connfx.WithLogger(logger))

	// Register adapters
	registry.RegisterFactory(connfx.NewSQLConnectionFactory("sqlite"))
	registry.RegisterFactory(connfx.NewHTTPConnectionFactory("http"))

	ctx := t.Context()

	// Add a stateful connection (SQLite)
	sqlConfig := &connfx.ConfigTarget{ //nolint:exhaustruct
		Protocol: "sqlite",
		DSN:      ":memory:",
	}
	_, err := registry.AddConnection(ctx, "db", sqlConfig)
	require.NoError(t, err)

	// Test behavior filtering
	statefulConnections := registry.GetByBehavior(connfx.ConnectionBehaviorStateful)
	assert.Len(t, statefulConnections, 1)

	statelessConnections := registry.GetByBehavior(connfx.ConnectionBehaviorStateless)
	assert.Empty(t, statelessConnections) // No HTTP connection added

	// Test protocol filtering
	sqliteConnections := registry.GetByProtocol("sqlite")
	assert.Len(t, sqliteConnections, 1)
}

func TestRegistry_AdapterRegistration(t *testing.T) {
	t.Parallel()

	logger := newMockLogger()
	registry := connfx.NewRegistry(connfx.WithLogger(logger))

	// Test registering adapters
	registry.RegisterFactory(connfx.NewSQLConnectionFactory("sqlite"))
	registry.RegisterFactory(connfx.NewHTTPConnectionFactory("http"))

	// Test listing protocols
	protocols := registry.ListRegisteredProtocols()
	assert.Contains(t, protocols, "sqlite")
	assert.Contains(t, protocols, "http")
}

func TestGetTypedConnection(t *testing.T) {
	t.Parallel()

	logger := newMockLogger()
	registry := connfx.NewRegistry(connfx.WithLogger(logger))

	// Register SQLite adapter
	registry.RegisterFactory(connfx.NewSQLConnectionFactory("sqlite"))

	ctx := t.Context()

	// Add SQLite connection
	config := &connfx.ConfigTarget{ //nolint:exhaustruct
		Protocol: "sqlite",
		DSN:      ":memory:",
	}

	conn, err := registry.AddConnection(ctx, "db", config)
	require.NoError(t, err)
	require.NotNil(t, conn)

	// Test successful type extraction
	db, err := connfx.GetTypedConnection[*sql.DB](registry, "db")
	require.NoError(t, err)
	assert.NotNil(t, db)

	// Verify it's actually a working *sql.DB
	err = db.PingContext(ctx)
	require.NoError(t, err)

	// Test failed type extraction (wrong type)
	_, err = connfx.GetTypedConnection[*http.Client](registry, "db")
	require.Error(t, err)
	require.ErrorIs(t, err, connfx.ErrInvalidType)

	// Test with nil registry
	_, err = connfx.GetTypedConnection[*sql.DB](nil, "db")
	require.Error(t, err)
	require.ErrorIs(t, err, connfx.ErrRegistryIsNil)

	// Test with empty connection name
	_, err = connfx.GetTypedConnection[*sql.DB](registry, "")
	require.Error(t, err)
	assert.ErrorIs(t, err, connfx.ErrConnectionNotFound)
}

func TestRegistry_ErrorHandling(t *testing.T) {
	t.Parallel()

	logger := newMockLogger()
	registry := connfx.NewRegistry(connfx.WithLogger(logger))

	ctx := t.Context()

	// Test getting non-existent connection
	conn := registry.GetNamed("nonexistent")
	assert.Nil(t, conn)

	// Test adding connection without registered factory
	config := &connfx.ConfigTarget{ //nolint:exhaustruct
		Protocol: "unsupported",
		DSN:      "test.db",
	}

	_, err := registry.AddConnection(ctx, "test", config)
	require.Error(t, err)
	require.ErrorIs(t, err, connfx.ErrUnsupportedProtocol)

	// Test removing non-existent connection
	err = registry.RemoveConnection(ctx, "nonexistent")
	require.Error(t, err)
	require.ErrorIs(t, err, connfx.ErrConnectionNotFound)
}
