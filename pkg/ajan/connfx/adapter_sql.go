package connfx

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"sync/atomic"
	"time"
)

var (
	ErrFailedToOpenSQLConnection = errors.New("failed to open SQL connection")
	ErrFailedToPingSQL           = errors.New("failed to ping SQL database")
	ErrInvalidConfigTypeSQL      = errors.New("invalid config type for SQL connection")
	ErrUnsupportedSQLProtocol    = errors.New("unsupported SQL protocol")
	ErrFailedToCloseSQLDB        = errors.New("failed to close SQL database")
	ErrSQLConnectionNil          = errors.New("SQL connection is nil")
)

// SQLConnection represents a SQL database connection.
type SQLConnection struct {
	lastHealth time.Time
	db         *sql.DB
	protocol   string
	state      int32 // atomic field for connection state
}

// SQLConnectionFactory creates SQL connections.
type SQLConnectionFactory struct {
	protocol string
}

// NewSQLConnectionFactory creates a new SQL connection factory for a specific protocol.
func NewSQLConnectionFactory(protocol string) *SQLConnectionFactory {
	return &SQLConnectionFactory{
		protocol: protocol,
	}
}

func (f *SQLConnectionFactory) CreateConnection( //nolint:ireturn
	ctx context.Context,
	config *ConfigTarget,
) (Connection, error) {
	db, err := sql.Open(f.protocol, config.DSN) //nolint:varnamelen
	if err != nil {
		return nil, fmt.Errorf(
			"%w (protocol=%q, dsn=%q): %w",
			ErrFailedToOpenSQLConnection,
			f.protocol,
			config.DSN,
			err,
		)
	}

	// Configure connection pool settings
	if config.MaxOpenConns > 0 {
		db.SetMaxOpenConns(config.MaxOpenConns)
	}

	if config.MaxConnLifetime > 0 {
		db.SetConnMaxLifetime(config.MaxConnLifetime)
	}

	if config.MaxIdleConns > 0 {
		db.SetMaxIdleConns(config.MaxIdleConns)
	}

	if config.MaxConnIdleTime > 0 {
		db.SetConnMaxIdleTime(config.MaxConnIdleTime)
	}

	// Initial ping to verify connection
	pingErr := db.PingContext(ctx)
	if pingErr != nil {
		_ = db.Close() // Ignore close error if ping fails

		return nil, fmt.Errorf("%w: %w", ErrFailedToPingSQL, pingErr)
	}

	conn := &SQLConnection{
		protocol:   f.protocol,
		db:         db,
		state:      int32(ConnectionStateConnected),
		lastHealth: time.Time{},
	}

	// Perform initial health check to set correct state
	_ = conn.HealthCheck(ctx)

	return conn, nil
}

func (f *SQLConnectionFactory) GetProtocol() string {
	return f.protocol
}

// Connection interface implementation

func (c *SQLConnection) GetBehaviors() []ConnectionBehavior {
	return []ConnectionBehavior{ConnectionBehaviorStateful}
}

func (c *SQLConnection) GetCapabilities() []ConnectionCapability {
	return []ConnectionCapability{
		ConnectionCapabilityRelational,
		ConnectionCapabilityTransactional,
	}
}

func (c *SQLConnection) GetProtocol() string {
	return c.protocol
}

func (c *SQLConnection) GetState() ConnectionState {
	state := atomic.LoadInt32(&c.state)

	return ConnectionState(state)
}

func (c *SQLConnection) HealthCheck(ctx context.Context) *HealthStatus {
	start := time.Now()
	status := &HealthStatus{ //nolint:exhaustruct
		Timestamp: start,
	}

	// Check if database connection exists
	if c.db == nil {
		atomic.StoreInt32(&c.state, int32(ConnectionStateError))
		status.State = ConnectionStateError
		status.Error = ErrSQLConnectionNil
		status.Message = "Database connection not initialized"
		status.Latency = time.Since(start)

		return status
	}

	// Get connection stats first to determine initial state
	stats := c.db.Stats()

	// Ping the database to check liveness
	err := c.db.PingContext(ctx)
	status.Latency = time.Since(start)

	if err != nil {
		atomic.StoreInt32(&c.state, int32(ConnectionStateError))
		status.State = ConnectionStateError
		status.Error = err
		status.Message = fmt.Sprintf("Health check failed: %v", err)

		return status
	}

	// Determine state based on connection pool statistics and ping result
	c.determineConnectionState(stats, status)
	c.lastHealth = start

	return status
}

func (c *SQLConnection) Close(ctx context.Context) error {
	atomic.StoreInt32(&c.state, int32(ConnectionStateDisconnected))

	err := c.db.Close()
	if err != nil {
		return fmt.Errorf("%w: %w", ErrFailedToCloseSQLDB, err)
	}

	return nil
}

func (c *SQLConnection) GetRawConnection() any {
	return c.db
}

// Additional SQL-specific methods

// GetDB returns the underlying *sql.DB instance.
func (c *SQLConnection) GetDB() *sql.DB {
	return c.db
}

// Stats returns database connection statistics.
func (c *SQLConnection) Stats() sql.DBStats {
	return c.db.Stats()
}

func (c *SQLConnection) determineConnectionState(stats sql.DBStats, status *HealthStatus) {
	switch {
	case stats.OpenConnections == 0:
		// No connections available - disconnected
		atomic.StoreInt32(&c.state, int32(ConnectionStateDisconnected))
		status.State = ConnectionStateDisconnected
		status.Message = "No open connections available"
	case stats.OpenConnections > 0 && stats.InUse == stats.OpenConnections:
		// All connections are in use - connected but not ready for new requests
		atomic.StoreInt32(&c.state, int32(ConnectionStateLive))
		status.State = ConnectionStateLive
		status.Message = fmt.Sprintf(
			"Connected and live but at capacity (protocol=%s, open=%d, inuse=%d, idle=%d)",
			c.protocol,
			stats.OpenConnections,
			stats.InUse,
			stats.Idle,
		)
	case stats.OpenConnections > 0 && stats.Idle > 0:
		// Has idle connections available - ready to serve requests
		atomic.StoreInt32(&c.state, int32(ConnectionStateReady))
		status.State = ConnectionStateReady
		status.Message = fmt.Sprintf(
			"Connected, live and ready (protocol=%s, open=%d, inuse=%d, idle=%d)",
			c.protocol,
			stats.OpenConnections,
			stats.InUse,
			stats.Idle,
		)
	default:
		// Basic connected state - ping successful but connection state unclear
		atomic.StoreInt32(&c.state, int32(ConnectionStateConnected))
		status.State = ConnectionStateConnected
		status.Message = fmt.Sprintf("Connected (protocol=%s, open=%d, inuse=%d, idle=%d)",
			c.protocol, stats.OpenConnections, stats.InUse, stats.Idle)
	}
}
