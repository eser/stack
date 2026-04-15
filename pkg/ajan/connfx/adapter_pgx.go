package connfx

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"sync/atomic"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrFailedToOpenPgxConnection  = errors.New("failed to open pgx connection")
	ErrFailedToPingPgx            = errors.New("failed to ping pgx database")
	ErrPgxConnectionNil           = errors.New("pgx connection is nil")
	ErrFailedToClosePgxPool       = errors.New("failed to close pgx pool")
	ErrPgxPreparedStatementFailed = errors.New("failed to prepare statement")
	ErrPgxInvalidConfig           = errors.New("invalid pgx config")
)

// PgxConnection represents a PostgreSQL connection using pgx with advanced features.
type PgxConnection struct {
	lastHealth        time.Time
	pool              *pgxpool.Pool
	config            *pgxpool.Config
	protocol          string
	state             int32 // atomic field for connection state
	preparedStmtCache sync.Map
	mu                sync.RWMutex
	queryLogger       func(ctx context.Context, query string, args []any)
}

// PgxConnectionFactory creates pgx connections.
type PgxConnectionFactory struct {
	protocol string
}

// NewPgxConnectionFactory creates a new pgx connection factory.
func NewPgxConnectionFactory(protocol string) *PgxConnectionFactory {
	return &PgxConnectionFactory{
		protocol: protocol,
	}
}

func (f *PgxConnectionFactory) CreateConnection( //nolint:ireturn
	ctx context.Context,
	config *ConfigTarget,
) (Connection, error) {
	// Parse connection string into pgx config
	poolConfig, err := pgxpool.ParseConfig(config.DSN)
	if err != nil {
		return nil, fmt.Errorf(
			"%w (protocol=%q, dsn=%q): %w",
			ErrPgxInvalidConfig,
			f.protocol,
			config.DSN,
			err,
		)
	}

	// Configure advanced pool settings
	f.configurePool(poolConfig, config)

	// Configure connection behavior
	f.configureConnectionBehavior(poolConfig)

	// Create the connection pool
	pool, err := pgxpool.NewWithConfig(ctx, poolConfig)
	if err != nil {
		return nil, fmt.Errorf(
			"%w (dsn=%q): %w",
			ErrFailedToOpenPgxConnection,
			config.DSN,
			err,
		)
	}

	// Initial ping to verify connection
	pingErr := pool.Ping(ctx)
	if pingErr != nil {
		pool.Close()

		return nil, fmt.Errorf("%w: %w", ErrFailedToPingPgx, pingErr)
	}

	conn := &PgxConnection{
		pool:              pool,
		config:            poolConfig,
		protocol:          f.protocol,
		state:             int32(ConnectionStateConnected),
		lastHealth:        time.Time{},
		preparedStmtCache: sync.Map{},
		mu:                sync.RWMutex{},
		queryLogger:       nil,
	}

	// Perform initial health check to set correct state
	_ = conn.HealthCheck(ctx)

	return conn, nil
}

func (f *PgxConnectionFactory) GetProtocol() string {
	return f.protocol
}

// Connection interface implementation

func (c *PgxConnection) GetBehaviors() []ConnectionBehavior {
	return []ConnectionBehavior{ConnectionBehaviorStateful}
}

func (c *PgxConnection) GetCapabilities() []ConnectionCapability {
	return []ConnectionCapability{
		ConnectionCapabilityRelational,
		ConnectionCapabilityTransactional,
	}
}

func (c *PgxConnection) GetProtocol() string {
	return c.protocol
}

func (c *PgxConnection) GetState() ConnectionState {
	state := atomic.LoadInt32(&c.state)

	return ConnectionState(state)
}

func (c *PgxConnection) HealthCheck(ctx context.Context) *HealthStatus {
	start := time.Now()
	status := &HealthStatus{ //nolint:exhaustruct
		Timestamp: start,
	}

	// Check if pool exists
	if c.pool == nil {
		atomic.StoreInt32(&c.state, int32(ConnectionStateError))
		status.State = ConnectionStateError
		status.Error = ErrPgxConnectionNil
		status.Message = "Pool connection not initialized"
		status.Latency = time.Since(start)

		return status
	}

	// Ping the database to check liveness
	err := c.pool.Ping(ctx)
	status.Latency = time.Since(start)

	if err != nil {
		atomic.StoreInt32(&c.state, int32(ConnectionStateError))
		status.State = ConnectionStateError
		status.Error = err
		status.Message = fmt.Sprintf("Health check failed: %v", err)

		return status
	}

	// Get pool statistics
	stats := c.pool.Stat()

	// Determine state based on pool statistics
	c.determineConnectionState(stats, status)
	c.lastHealth = start

	return status
}

func (c *PgxConnection) Close(ctx context.Context) error {
	atomic.StoreInt32(&c.state, int32(ConnectionStateDisconnected))

	// Clear prepared statement cache
	c.preparedStmtCache.Range(func(key, value any) bool {
		c.preparedStmtCache.Delete(key)

		return true
	})

	// Close the pool
	c.pool.Close()

	return nil
}

func (c *PgxConnection) GetRawConnection() any {
	return c.pool
}

// Additional pgx-specific methods

// GetPool returns the underlying *pgxpool.Pool instance.
func (c *PgxConnection) GetPool() *pgxpool.Pool {
	return c.pool
}

// Stats returns detailed pool statistics.
func (c *PgxConnection) Stats() *pgxpool.Stat {
	return c.pool.Stat()
}

// AcquireConn acquires a connection from the pool for exclusive use.
func (c *PgxConnection) AcquireConn(ctx context.Context) (*pgxpool.Conn, error) {
	conn, err := c.pool.Acquire(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to acquire connection: %w", err)
	}

	return conn, nil
}

// BeginTx starts a new transaction with custom options.
func (c *PgxConnection) BeginTx(ctx context.Context, txOptions pgx.TxOptions) (pgx.Tx, error) {
	transaction, err := c.pool.BeginTx(ctx, txOptions)
	if err != nil {
		return nil, fmt.Errorf("failed to begin transaction: %w", err)
	}

	return transaction, nil
}

// BeginTxFunc executes a function within a transaction, handling commit/rollback automatically.
func (c *PgxConnection) BeginTxFunc(
	ctx context.Context,
	txOptions pgx.TxOptions,
	txFunc func(pgx.Tx) error,
) error {
	transaction, err := c.pool.BeginTx(ctx, txOptions)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}

	defer func() {
		if p := recover(); p != nil {
			_ = transaction.Rollback(ctx)

			panic(p)
		}
	}()

	txErr := txFunc(transaction)
	if txErr != nil {
		rbErr := transaction.Rollback(ctx)
		if rbErr != nil {
			return fmt.Errorf("tx failed: %w, unable to rollback: %w", txErr, rbErr)
		}

		return txErr
	}

	commitErr := transaction.Commit(ctx)
	if commitErr != nil {
		return fmt.Errorf("failed to commit transaction: %w", commitErr)
	}

	return nil
}

// Exec executes a query that doesn't return rows.
func (c *PgxConnection) Exec(
	ctx context.Context,
	sql string,
	args ...any,
) (pgconn.CommandTag, error) {
	if c.queryLogger != nil {
		c.queryLogger(ctx, sql, args)
	}

	cmd, err := c.pool.Exec(ctx, sql, args...)
	if err != nil {
		return cmd, fmt.Errorf("failed to execute query: %w", err)
	}

	return cmd, nil
}

// Query executes a query that returns rows.
func (c *PgxConnection) Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error) {
	if c.queryLogger != nil {
		c.queryLogger(ctx, sql, args)
	}

	rows, err := c.pool.Query(ctx, sql, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to execute query: %w", err)
	}

	return rows, nil
}

// QueryRow executes a query that returns at most one row.
func (c *PgxConnection) QueryRow(ctx context.Context, sql string, args ...any) pgx.Row {
	if c.queryLogger != nil {
		c.queryLogger(ctx, sql, args)
	}

	return c.pool.QueryRow(ctx, sql, args...)
}

// SendBatch sends a batch of queries to be executed.
func (c *PgxConnection) SendBatch(ctx context.Context, batch *pgx.Batch) pgx.BatchResults {
	return c.pool.SendBatch(ctx, batch)
}

// CopyFrom performs a bulk copy operation.
func (c *PgxConnection) CopyFrom(
	ctx context.Context,
	tableName pgx.Identifier,
	columnNames []string,
	rowSrc pgx.CopyFromSource,
) (int64, error) {
	rowsCopied, err := c.pool.CopyFrom(ctx, tableName, columnNames, rowSrc)
	if err != nil {
		return 0, fmt.Errorf("failed to copy from: %w", err)
	}

	return rowsCopied, nil
}

// PrepareStatement prepares a statement and caches it for reuse.
func (c *PgxConnection) PrepareStatement(ctx context.Context, name, sql string) error {
	// Check if already prepared
	if _, exists := c.preparedStmtCache.Load(name); exists {
		return nil
	}

	conn, err := c.pool.Acquire(ctx)
	if err != nil {
		return fmt.Errorf("failed to acquire connection: %w", err)
	}
	defer conn.Release()

	_, err = conn.Conn().Prepare(ctx, name, sql)
	if err != nil {
		return fmt.Errorf("%w (name=%s): %w", ErrPgxPreparedStatementFailed, name, err)
	}

	c.preparedStmtCache.Store(name, sql)

	return nil
}

// SetQueryLogger sets a function to log all queries.
func (c *PgxConnection) SetQueryLogger(logger func(ctx context.Context, query string, args []any)) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.queryLogger = logger
}

// WaitForNotification waits for a PostgreSQL notification.
func (c *PgxConnection) WaitForNotification(ctx context.Context) (*pgconn.Notification, error) {
	conn, err := c.pool.Acquire(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to acquire connection: %w", err)
	}
	defer conn.Release()

	notification, err := conn.Conn().WaitForNotification(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to wait for notification: %w", err)
	}

	return notification, nil
}

// Listen starts listening for PostgreSQL notifications on a channel.
func (c *PgxConnection) Listen(ctx context.Context, channel string) error {
	conn, err := c.pool.Acquire(ctx)
	if err != nil {
		return fmt.Errorf("failed to acquire connection: %w", err)
	}
	defer conn.Release()

	_, err = conn.Exec(ctx, "LISTEN "+pgx.Identifier{channel}.Sanitize())
	if err != nil {
		return fmt.Errorf("failed to listen on channel %s: %w", channel, err)
	}

	return nil
}

// Unlisten stops listening for PostgreSQL notifications on a channel.
func (c *PgxConnection) Unlisten(ctx context.Context, channel string) error {
	conn, err := c.pool.Acquire(ctx)
	if err != nil {
		return fmt.Errorf("failed to acquire connection: %w", err)
	}
	defer conn.Release()

	_, err = conn.Exec(ctx, "UNLISTEN "+pgx.Identifier{channel}.Sanitize())
	if err != nil {
		return fmt.Errorf("failed to unlisten on channel %s: %w", channel, err)
	}

	return nil
}

// GetConnectionMetrics returns detailed metrics about the connection pool.
func (c *PgxConnection) GetConnectionMetrics() map[string]any {
	stats := c.pool.Stat()

	return map[string]any{
		"total_connections":        stats.TotalConns(),
		"acquired_connections":     stats.AcquiredConns(),
		"idle_connections":         stats.IdleConns(),
		"constructing_connections": stats.ConstructingConns(),
		"max_connections":          stats.MaxConns(),
		"new_connections_count":    stats.NewConnsCount(),
		"acquire_count":            stats.AcquireCount(),
		"acquire_duration":         stats.AcquireDuration(),
		"empty_acquire_count":      stats.EmptyAcquireCount(),
		"canceled_acquire_count":   stats.CanceledAcquireCount(),
		"last_health_check":        c.lastHealth,
		"current_state":            c.GetState().String(),
	}
}

func (f *PgxConnectionFactory) configurePool(poolConfig *pgxpool.Config, config *ConfigTarget) {
	// Pool size configuration
	if config.MaxOpenConns > 0 {
		poolConfig.MaxConns = int32(config.MaxOpenConns)
	} else {
		poolConfig.MaxConns = 25 // pgx default is typically higher than database/sql
	}

	if config.MaxIdleConns > 0 {
		poolConfig.MinConns = int32(config.MaxIdleConns)
	} else {
		poolConfig.MinConns = 2 // Maintain minimum connections for better performance
	}

	// Connection lifetime configuration
	if config.MaxConnLifetime > 0 {
		poolConfig.MaxConnLifetime = config.MaxConnLifetime
	} else {
		poolConfig.MaxConnLifetime = time.Hour
	}

	if config.MaxConnIdleTime > 0 {
		poolConfig.MaxConnIdleTime = config.MaxConnIdleTime
	} else {
		const defaultIdleTime = 30

		poolConfig.MaxConnIdleTime = defaultIdleTime * time.Minute
	}

	// Health check period - pgx will periodically check connections
	poolConfig.HealthCheckPeriod = 1 * time.Minute
}

func (f *PgxConnectionFactory) configureConnectionBehavior(poolConfig *pgxpool.Config) {
	// Configure connection-level settings
	poolConfig.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeDescribeExec

	// Set up runtime parameters for better performance
	poolConfig.ConnConfig.RuntimeParams = map[string]string{
		"application_name": "connfx_pgx",
		"client_encoding":  "UTF8",
		"DateStyle":        "ISO, MDY",
		"IntervalStyle":    "postgres",
		"TimeZone":         "UTC",
	}
	// Tracer can be configured here if needed for observability
	// poolConfig.ConnConfig.Tracer can be set to a custom tracer implementation
}

func (c *PgxConnection) determineConnectionState(stats *pgxpool.Stat, status *HealthStatus) {
	totalConns := stats.TotalConns()
	acquiredConns := stats.AcquiredConns()
	idleConns := stats.IdleConns()
	constructingConns := stats.ConstructingConns()

	switch {
	case totalConns == 0:
		// No connections available - disconnected
		atomic.StoreInt32(&c.state, int32(ConnectionStateDisconnected))
		status.State = ConnectionStateDisconnected
		status.Message = "No connections available in pool"
	case acquiredConns == stats.MaxConns() && constructingConns == 0:
		// All connections are in use and we can't create more - at capacity
		atomic.StoreInt32(&c.state, int32(ConnectionStateLive))
		status.State = ConnectionStateLive
		status.Message = fmt.Sprintf(
			"Connected and live but at capacity (total=%d, acquired=%d, idle=%d, constructing=%d, max=%d)",
			totalConns,
			acquiredConns,
			idleConns,
			constructingConns,
			stats.MaxConns(),
		)
	case idleConns > 0 || constructingConns > 0:
		// Has idle connections or is creating new ones - ready
		atomic.StoreInt32(&c.state, int32(ConnectionStateReady))
		status.State = ConnectionStateReady
		status.Message = fmt.Sprintf(
			"Connected, live and ready (total=%d, acquired=%d, idle=%d, constructing=%d, max=%d)",
			totalConns,
			acquiredConns,
			idleConns,
			constructingConns,
			stats.MaxConns(),
		)
	default:
		// Basic connected state
		atomic.StoreInt32(&c.state, int32(ConnectionStateConnected))
		status.State = ConnectionStateConnected
		status.Message = fmt.Sprintf(
			"Connected (total=%d, acquired=%d, idle=%d, constructing=%d, max=%d)",
			totalConns,
			acquiredConns,
			idleConns,
			constructingConns,
			stats.MaxConns(),
		)
	}
}
