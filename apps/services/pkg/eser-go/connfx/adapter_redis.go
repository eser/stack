package connfx

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"maps"
	"net/url"
	"reflect"
	"strconv"
	"sync"
	"sync/atomic"
	"time"

	"github.com/redis/go-redis/v9"
)

// Constants for Redis connection configuration.
// C10K optimized: larger pool sizes for high-throughput scenarios.
const (
	// Default Redis connection retry configuration.
	defaultMaxRetries      = 3
	defaultMinRetryBackoff = 8 * time.Millisecond   // 8ms
	defaultMaxRetryBackoff = 512 * time.Millisecond // 512ms

	// C10K optimized pool settings (was: 10, 1, 5, 30min, 4s).
	defaultPoolSize        = 500             // Supports high concurrent connections
	defaultMinIdleConns    = 100             // Keep warm connections ready
	defaultMaxIdleConns    = 200             // Reduce connection churn
	defaultConnMaxIdleTime = 5 * time.Minute // Faster cleanup of stale connections
	defaultPoolTimeout     = 1 * time.Second // Fail fast on pool exhaustion
	defaultRedisPort       = 6379

	ReadMessagesCount = 1000
)

var (
	ErrRedisClientNotInitialized   = errors.New("redis client not initialized")
	ErrFailedToCloseRedisClient    = errors.New("failed to close Redis client")
	ErrRedisOperation              = errors.New("redis operation failed")
	ErrRedisConnectionFailed       = errors.New("failed to connect to Redis")
	ErrRedisUnexpectedPingResponse = errors.New("unexpected ping response")
	ErrRedisPoolTimeouts           = errors.New("redis connection pool has timeouts")
	ErrFailedToCreateRedisClient   = errors.New("failed to create Redis client")
	ErrCorruptedJSONData           = errors.New("corrupted JSON data")
	ErrExpectedPointerToSlice      = errors.New("expected pointer to a slice")
)

// QueueMessage represents a message from the queue.
type QueueMessage struct {
	MessageID     string
	ReceiptHandle string
	Body          []byte
}

// RedisConfig holds Redis-specific configuration options.
type RedisConfig struct {
	Address               string
	Password              string
	DB                    int
	PoolSize              int
	MinIdleConns          int
	MaxIdleConns          int
	ConnMaxIdleTime       time.Duration
	PoolTimeout           time.Duration
	MaxRetries            int
	MinRetryBackoff       time.Duration
	MaxRetryBackoff       time.Duration
	TLSEnabled            bool
	TLSInsecureSkipVerify bool
}

// RedisAdapter implements Redis operations and wraps the Redis client.
type RedisAdapter struct {
	client         *redis.Client
	config         *RedisConfig
	scriptCache    map[string]*redis.Script // Cache for Lua scripts (EVALSHA optimization)
	scriptCacheMux sync.RWMutex             // Protects scriptCache for concurrent access
}

// RedisConnection implements the connfx.Connection interface.
type RedisConnection struct {
	adapter       *RedisAdapter
	protocol      string
	state         int32 // atomic field for connection state
	isInitialized bool
}

// NewRedisConnection creates a new Redis connection with enhanced configuration.
func NewRedisConnection(protocol string, config *RedisConfig) *RedisConnection {
	adapter := &RedisAdapter{
		client:         nil, // Will be initialized when needed
		config:         config,
		scriptCache:    make(map[string]*redis.Script),
		scriptCacheMux: sync.RWMutex{},
	}

	conn := &RedisConnection{
		adapter:       adapter,
		protocol:      protocol,
		state:         int32(ConnectionStateNotInitialized),
		isInitialized: false,
	}

	return conn
}

// Connection interface implementation.
func (rc *RedisConnection) GetBehaviors() []ConnectionBehavior {
	return []ConnectionBehavior{
		ConnectionBehaviorStateful,
		ConnectionBehaviorStreaming,
	}
}

func (rc *RedisConnection) GetCapabilities() []ConnectionCapability {
	return []ConnectionCapability{
		ConnectionCapabilityKeyValue,
		ConnectionCapabilityCache,
		ConnectionCapabilityQueue,
	}
}

func (rc *RedisConnection) GetProtocol() string {
	return rc.protocol
}

func (rc *RedisConnection) GetState() ConnectionState {
	return ConnectionState(atomic.LoadInt32(&rc.state))
}

func (rc *RedisConnection) HealthCheck(ctx context.Context) *HealthStatus {
	start := time.Now()

	status := &HealthStatus{
		Timestamp: start,
		State:     rc.GetState(),
		Error:     nil,
		Message:   "",
		Latency:   0,
	}

	// Ensure client is initialized
	clientErr := rc.ensureClient()
	if clientErr != nil {
		atomic.StoreInt32(&rc.state, int32(ConnectionStateError))
		status.State = ConnectionStateError
		status.Error = clientErr
		status.Message = fmt.Sprintf("Failed to initialize Redis client: %v", clientErr)
		status.Latency = time.Since(start)

		return status
	}

	// Perform ping to check liveness
	pong, err := rc.adapter.client.Ping(ctx).Result()
	status.Latency = time.Since(start)

	if err != nil {
		atomic.StoreInt32(&rc.state, int32(ConnectionStateError))
		status.State = ConnectionStateError
		status.Error = err
		status.Message = fmt.Sprintf("Redis ping failed: %v", err)

		return status
	}

	if pong != "PONG" {
		atomic.StoreInt32(&rc.state, int32(ConnectionStateError))
		status.State = ConnectionStateError
		status.Error = ErrRedisUnexpectedPingResponse
		status.Message = "Unexpected ping response: " + pong

		return status
	}

	// Check connection pool statistics for health assessment
	return rc.assessPoolHealth(ctx, status, start)
}

func (rc *RedisConnection) Close(ctx context.Context) error {
	atomic.StoreInt32(&rc.state, int32(ConnectionStateDisconnected))
	rc.isInitialized = false

	if rc.adapter.client != nil {
		err := rc.adapter.client.Close()
		if err != nil {
			return fmt.Errorf("%w: %w", ErrFailedToCloseRedisClient, err)
		}

		rc.adapter.client = nil
	}

	return nil
}

func (rc *RedisConnection) GetRawConnection() any {
	return rc.adapter.client
}

// GetStats returns detailed connection and pool statistics.
func (rc *RedisConnection) GetStats() map[string]any {
	if rc.adapter.client == nil {
		return map[string]any{
			"status": "disconnected",
			"state":  rc.GetState().String(),
		}
	}

	stats := rc.adapter.client.PoolStats()

	return map[string]any{
		"status":      "connected",
		"state":       rc.GetState().String(),
		"hits":        stats.Hits,
		"misses":      stats.Misses,
		"timeouts":    stats.Timeouts,
		"total_conns": stats.TotalConns,
		"idle_conns":  stats.IdleConns,
		"stale_conns": stats.StaleConns,
		"config": map[string]any{
			"address":            rc.adapter.config.Address,
			"db":                 rc.adapter.config.DB,
			"pool_size":          rc.adapter.config.PoolSize,
			"min_idle_conns":     rc.adapter.config.MinIdleConns,
			"max_idle_conns":     rc.adapter.config.MaxIdleConns,
			"conn_max_idle_time": rc.adapter.config.ConnMaxIdleTime.String(),
			"pool_timeout":       rc.adapter.config.PoolTimeout.String(),
			"tls_enabled":        rc.adapter.config.TLSEnabled,
		},
	}
}

// GetClient returns the underlying Redis client for advanced operations.
func (rc *RedisConnection) GetClient() *redis.Client {
	return rc.adapter.client
}

// GetAdapter returns the underlying Redis adapter for accessing Redis-specific methods.
func (rc *RedisConnection) GetAdapter() *RedisAdapter {
	return rc.adapter
}

// ensureClient initializes the Redis client if not already done.
func (rc *RedisConnection) ensureClient() error {
	if rc.adapter.client != nil {
		return nil
	}

	options := &redis.Options{ //nolint:exhaustruct
		Addr:     rc.adapter.config.Address,
		Password: rc.adapter.config.Password,
		DB:       rc.adapter.config.DB,

		// Connection pool configuration
		PoolSize:        rc.adapter.config.PoolSize,
		MinIdleConns:    rc.adapter.config.MinIdleConns,
		MaxIdleConns:    rc.adapter.config.MaxIdleConns,
		ConnMaxIdleTime: rc.adapter.config.ConnMaxIdleTime,
		PoolTimeout:     rc.adapter.config.PoolTimeout,

		// Retry configuration
		MaxRetries:      rc.adapter.config.MaxRetries,
		MinRetryBackoff: rc.adapter.config.MinRetryBackoff,
		MaxRetryBackoff: rc.adapter.config.MaxRetryBackoff,
	}

	// Configure TLS if enabled
	if rc.adapter.config.TLSEnabled {
		// Use TLSInsecureSkipVerify from config (controlled via configuration)
		options.TLSConfig = &tls.Config{ //nolint:exhaustruct
			InsecureSkipVerify: rc.adapter.config.TLSInsecureSkipVerify, //nolint:gosec
		}
	}

	client := redis.NewClient(options)
	if client == nil {
		return ErrFailedToCreateRedisClient
	}

	rc.adapter.client = client

	return nil
}

// assessPoolHealth analyzes pool statistics to determine connection readiness.
func (rc *RedisConnection) assessPoolHealth(
	ctx context.Context,
	status *HealthStatus,
	start time.Time,
) *HealthStatus {
	stats := rc.adapter.client.PoolStats()

	// Try a simple operation to verify readiness
	testKey := "__connfx_health_check__"
	_, existsErr := rc.adapter.client.Exists(ctx, testKey).Result()

	status.Latency = time.Since(start)

	// Check for pool timeouts which indicate connection pressure
	if stats.Timeouts > 0 {
		// Connection is live but experiencing timeouts - not ready
		atomic.StoreInt32(&rc.state, int32(ConnectionStateLive))
		status.State = ConnectionStateLive
		status.Error = ErrRedisPoolTimeouts
		status.Message = fmt.Sprintf(
			"Redis connection pool has timeouts (timeouts=%d, total=%d, idle=%d)",
			stats.Timeouts,
			stats.TotalConns,
			stats.IdleConns,
		)

		return status
	}

	if existsErr != nil {
		// Can ping but cannot perform operations - live but not ready
		atomic.StoreInt32(&rc.state, int32(ConnectionStateLive))
		status.State = ConnectionStateLive
		status.Message = "Redis connection is live but not ready for operations"
		status.Error = existsErr

		return status
	}

	// Check if pool has available connections
	poolSizeUint32 := uint32(rc.adapter.config.PoolSize)
	if stats.IdleConns == 0 && stats.TotalConns >= poolSizeUint32 {
		// Pool is at capacity with no idle connections - live but not ready
		atomic.StoreInt32(&rc.state, int32(ConnectionStateLive))
		status.State = ConnectionStateLive
		status.Message = fmt.Sprintf(
			"Redis connection pool at capacity (total=%d, idle=%d, max=%d)",
			stats.TotalConns,
			stats.IdleConns,
			rc.adapter.config.PoolSize,
		)

		return status
	}

	// Connection is ready
	atomic.StoreInt32(&rc.state, int32(ConnectionStateReady))
	status.State = ConnectionStateReady
	status.Message = fmt.Sprintf(
		"Redis connection is live and ready (total=%d, idle=%d, hits=%d, misses=%d)",
		stats.TotalConns,
		stats.IdleConns,
		stats.Hits,
		stats.Misses,
	)
	rc.isInitialized = true

	return status
}

// StoreRepository interface implementation.

// Scan iterates through the key space using cursor-based pagination.
// Returns the next cursor and the keys found in this iteration.
// When cursor is 0, it starts from the beginning. When returned cursor is 0, iteration is complete.
func (ra *RedisAdapter) Scan(
	ctx context.Context,
	cursor uint64,
	pattern string,
	count int64,
) ([]string, uint64, error) {
	if ra.client == nil {
		return nil, 0, fmt.Errorf("%w (pattern=%q)", ErrRedisClientNotInitialized, pattern)
	}

	var keys []string

	var newCursor uint64

	var err error

	var searchPattern string
	if pattern != "" {
		searchPattern = pattern
	} else {
		searchPattern = "*"
	}

	result := ra.client.Scan(ctx, cursor, searchPattern, count)

	keys, newCursor, err = result.Result()
	if err != nil {
		return nil, 0, fmt.Errorf(
			"%w (operation=scan, pattern=%q): %w",
			ErrRedisOperation,
			pattern,
			err,
		)
	}

	return keys, newCursor, nil
}

func (ra *RedisAdapter) Get(ctx context.Context, key string) ([]byte, error) {
	if ra.client == nil {
		return nil, fmt.Errorf("%w (key=%q)", ErrRedisClientNotInitialized, key)
	}

	value, err := ra.client.Get(ctx, key).Result()
	if err != nil {
		if errors.Is(err, redis.Nil) {
			return nil, nil // Key doesn't exist, return nil without error
		}

		return nil, fmt.Errorf("%w (operation=get, key=%q): %w", ErrRedisOperation, key, err)
	}

	return []byte(value), nil
}

func (ra *RedisAdapter) Set(ctx context.Context, key string, value []byte) error {
	if ra.client == nil {
		return fmt.Errorf("%w (key=%q)", ErrRedisClientNotInitialized, key)
	}

	err := ra.client.Set(ctx, key, string(value), 0).Err() // 0 means no expiration
	if err != nil {
		return fmt.Errorf("%w (operation=set, key=%q): %w", ErrRedisOperation, key, err)
	}

	return nil
}

func (ra *RedisAdapter) Remove(ctx context.Context, keys ...string) error {
	if ra.client == nil {
		return fmt.Errorf("%w (keys=%q)", ErrRedisClientNotInitialized, keys)
	}

	err := ra.client.Del(ctx, keys...).Err()
	if err != nil {
		return fmt.Errorf("%w (operation=remove, keys=%q): %w", ErrRedisOperation, keys, err)
	}

	return nil
}

func (ra *RedisAdapter) Update(ctx context.Context, key string, value []byte) error {
	// For Redis, update is the same as set
	return ra.Set(ctx, key, value)
}

func (ra *RedisAdapter) Exists(ctx context.Context, key string) (bool, error) {
	if ra.client == nil {
		return false, fmt.Errorf("%w (key=%q)", ErrRedisClientNotInitialized, key)
	}

	count, err := ra.client.Exists(ctx, key).Result()
	if err != nil {
		return false, fmt.Errorf("%w (operation=exists, key=%q): %w", ErrRedisOperation, key, err)
	}

	return count > 0, nil
}

// CacheRepository interface implementation.
func (ra *RedisAdapter) SetWithExpiration(
	ctx context.Context,
	key string,
	value []byte,
	expiration time.Duration,
) error {
	if ra.client == nil {
		return fmt.Errorf("%w (key=%q)", ErrRedisClientNotInitialized, key)
	}

	err := ra.client.Set(ctx, key, string(value), expiration).Err()
	if err != nil {
		return fmt.Errorf(
			"%w (operation=set_with_expiration, key=%q): %w",
			ErrRedisOperation,
			key,
			err,
		)
	}

	return nil
}

func (ra *RedisAdapter) GetTTL(ctx context.Context, key string) (time.Duration, error) {
	if ra.client == nil {
		return 0, fmt.Errorf("%w (key=%q)", ErrRedisClientNotInitialized, key)
	}

	ttl, err := ra.client.TTL(ctx, key).Result()
	if err != nil {
		return 0, fmt.Errorf("%w (operation=get_ttl, key=%q): %w", ErrRedisOperation, key, err)
	}

	return ttl, nil
}

func (ra *RedisAdapter) Expire(ctx context.Context, key string, expiration time.Duration) error {
	if ra.client == nil {
		return fmt.Errorf("%w (key=%q)", ErrRedisClientNotInitialized, key)
	}

	err := ra.client.Expire(ctx, key, expiration).Err()
	if err != nil {
		return fmt.Errorf("%w (operation=expire, key=%q): %w", ErrRedisOperation, key, err)
	}

	return nil
}

func (ra *RedisAdapter) FlushAll(ctx context.Context) error {
	if ra.client == nil {
		return fmt.Errorf("%w (operation=flush_all)", ErrRedisClientNotInitialized)
	}

	err := ra.client.FlushAll(ctx).Err()
	if err != nil {
		return fmt.Errorf("%w (operation=flush_all): %w", ErrRedisOperation, err)
	}

	return nil
}

// Extended Repository interface methods for compatibility with the repository package.

// EnsureTableExists is a no-op for Redis since Redis hashes are created on first use.
func (ra *RedisAdapter) EnsureTableExists(
	ctx context.Context,
	tableName string,
	primaryKeyAttributeName string,
) error {
	// For Redis, tables (hashes) are created on first use, so this is a no-op
	// We just log the action for debugging purposes
	_ = ctx
	_ = tableName
	_ = primaryKeyAttributeName

	return nil
}

// CreateQueueIfNotExists creates a queue (stream) if it doesn't exist and returns its URI.
func (ra *RedisAdapter) CreateQueueIfNotExists(
	ctx context.Context,
	queueName string,
	consumerGroup string,
	attributes map[string]string,
) (*string, error) {
	if ra.client == nil {
		return nil, fmt.Errorf("%w (queue=%q)", ErrRedisClientNotInitialized, queueName)
	}

	// For Redis Streams, declare the queue/stream
	streamName, err := ra.QueueDeclare(ctx, queueName)
	if err != nil {
		return nil, fmt.Errorf("failed to declare queue: %w", err)
	}

	// Create consumer group if specified
	if consumerGroup != "" {
		// Consumer group might already exist, which is fine
		// Redis returns an error if the group already exists, but we can ignore it
		_ = ra.CreateConsumerGroup(ctx, streamName, consumerGroup, "0")
	}

	return &streamName, nil
}

// Close closes the Redis adapter (no-op since connection closing is handled by RedisConnection).
func (ra *RedisAdapter) Close(ctx context.Context) error {
	// The Redis client closing is handled by the RedisConnection.Close() method
	// This is just for interface compatibility
	_ = ctx

	return nil
}

// Client returns the underlying Redis client for advanced operations like pipelining.
func (ra *RedisAdapter) Client() *redis.Client {
	return ra.client
}

// QueueRepository interface implementation.
func (ra *RedisAdapter) QueueDeclare(ctx context.Context, name string) (string, error) {
	if ra.client == nil {
		return "", fmt.Errorf("%w (queue=%q)", ErrRedisClientNotInitialized, name)
	}

	// For Redis Streams, we don't need to explicitly create the stream
	// It will be created when the first message is added
	// We just return the stream name
	return name, nil
}

func (ra *RedisAdapter) QueueDeclareWithConfig(
	ctx context.Context,
	name string,
	config QueueConfig,
) (string, error) {
	if ra.client == nil {
		return "", fmt.Errorf("%w (queue=%q)", ErrRedisClientNotInitialized, name)
	}

	// For Redis Streams, we can optionally trim the stream if MaxLength is specified
	if config.MaxLength > 0 {
		err := ra.client.XTrimMaxLen(ctx, name, config.MaxLength).Err()
		if err != nil && !errors.Is(err, redis.Nil) {
			return "", fmt.Errorf("%w (operation=trim, queue=%q): %w", ErrRedisOperation, name, err)
		}
	}

	return name, nil
}

func (ra *RedisAdapter) Publish(ctx context.Context, queueName string, body []byte) error {
	return ra.PublishWithHeaders(ctx, queueName, body, nil)
}

func (ra *RedisAdapter) PublishWithHeaders(
	ctx context.Context,
	queueName string,
	body []byte,
	headers map[string]any,
) error {
	if ra.client == nil {
		return fmt.Errorf("%w (queue=%q)", ErrRedisClientNotInitialized, queueName)
	}

	values := map[string]any{
		"data": string(body),
	}

	// Add headers to the stream entry
	if headers != nil {
		maps.Copy(values, headers)
	}

	args := &redis.XAddArgs{ //nolint:exhaustruct
		Stream: queueName,
		Values: values,
	}

	_, err := ra.client.XAdd(ctx, args).Result()
	if err != nil {
		return fmt.Errorf("%w (operation=publish, queue=%q): %w", ErrRedisOperation, queueName, err)
	}

	return nil
}

func (ra *RedisAdapter) Consume(
	ctx context.Context,
	queueName string,
	config ConsumerConfig,
) (<-chan Message, <-chan error) {
	messages := make(chan Message)
	errors := make(chan error)

	go func() {
		defer close(messages)
		defer close(errors)

		ra.consumeLoop(ctx, queueName, "", "", config, messages, errors)
	}()

	return messages, errors
}

func (ra *RedisAdapter) ConsumeWithGroup(
	ctx context.Context,
	queueName string,
	consumerGroup string,
	consumerName string,
	config ConsumerConfig,
) (<-chan Message, <-chan error) {
	messages := make(chan Message)
	errors := make(chan error)

	go func() {
		defer close(messages)
		defer close(errors)

		ra.consumeLoop(ctx, queueName, consumerGroup, consumerName, config, messages, errors)
	}()

	return messages, errors
}

// ClaimPendingMessages claims pending messages from a consumer group.
func (ra *RedisAdapter) ClaimPendingMessages(
	ctx context.Context,
	queueName string,
	consumerGroup string,
	consumerName string,
	minIdleTime time.Duration,
	count int,
) ([]Message, error) {
	if ra.client == nil {
		return nil, fmt.Errorf("%w (queue=%q)", ErrRedisClientNotInitialized, queueName)
	}

	// Get pending messages
	pendingMsgs, err := ra.fetchPendingMessages(ctx, queueName, consumerGroup, count)
	if err != nil {
		return nil, err
	}

	if len(pendingMsgs) == 0 {
		return []Message{}, nil
	}

	// Claim idle messages
	return ra.claimMessages(ctx, queueName, consumerGroup, consumerName, minIdleTime, pendingMsgs)
}

// StreamRepository interface implementation.
func (ra *RedisAdapter) CreateConsumerGroup(
	ctx context.Context,
	streamName, consumerGroup, startID string,
) error {
	if ra.client == nil {
		return fmt.Errorf("%w (stream=%q)", ErrRedisClientNotInitialized, streamName)
	}

	err := ra.client.XGroupCreateMkStream(ctx, streamName, consumerGroup, startID).Err()
	if err != nil && !errors.Is(err, redis.Nil) &&
		err.Error() != "BUSYGROUP Consumer Group name already exists" {
		return fmt.Errorf(
			"%w (operation=create_group, stream=%q, group=%q): %w",
			ErrRedisOperation,
			streamName,
			consumerGroup,
			err,
		)
	}

	return nil
}

func (ra *RedisAdapter) StreamInfo(ctx context.Context, streamName string) (StreamInfo, error) {
	if ra.client == nil {
		return StreamInfo{}, fmt.Errorf("%w (stream=%q)", ErrRedisClientNotInitialized, streamName)
	}

	info, err := ra.client.XInfoStream(ctx, streamName).Result()
	if err != nil {
		return StreamInfo{}, fmt.Errorf(
			"%w (operation=stream_info, stream=%q): %w",
			ErrRedisOperation,
			streamName,
			err,
		)
	}

	streamInfo := StreamInfo{
		Length:          info.Length,
		RadixTreeKeys:   info.RadixTreeKeys,
		RadixTreeNodes:  info.RadixTreeNodes,
		Groups:          info.Groups,
		LastGeneratedID: info.LastGeneratedID,
		MaxDeletedID:    info.MaxDeletedEntryID,
		EntriesAdded:    info.EntriesAdded,
		RecordedFirstID: info.RecordedFirstEntryID,
		FirstEntry:      nil,
		LastEntry:       nil,
		Metadata:        make(map[string]string),
	}

	// Handle FirstEntry and LastEntry properly - they might be nil or have different structure
	if len(info.FirstEntry.Values) > 0 {
		streamInfo.FirstEntry = &StreamEntry{
			ID:     info.FirstEntry.ID,
			Fields: convertValues(info.FirstEntry.Values),
		}
	}

	if len(info.LastEntry.Values) > 0 {
		streamInfo.LastEntry = &StreamEntry{
			ID:     info.LastEntry.ID,
			Fields: convertValues(info.LastEntry.Values),
		}
	}

	return streamInfo, nil
}

func (ra *RedisAdapter) ConsumerGroupInfo(
	ctx context.Context,
	streamName string,
) ([]ConsumerGroupInfo, error) {
	if ra.client == nil {
		return nil, fmt.Errorf("%w (stream=%q)", ErrRedisClientNotInitialized, streamName)
	}

	groups, err := ra.client.XInfoGroups(ctx, streamName).Result()
	if err != nil {
		return nil, fmt.Errorf(
			"%w (operation=group_info, stream=%q): %w",
			ErrRedisOperation,
			streamName,
			err,
		)
	}

	groupInfos := make([]ConsumerGroupInfo, len(groups))
	for i, group := range groups {
		groupInfos[i] = ConsumerGroupInfo{
			Name:            group.Name,
			Consumers:       group.Consumers,
			Pending:         group.Pending,
			LastDeliveredID: group.LastDeliveredID,
			EntriesRead:     group.EntriesRead,
			Lag:             group.Lag,
		}
	}

	return groupInfos, nil
}

func (ra *RedisAdapter) TrimStream(ctx context.Context, streamName string, maxLen int64) error {
	if ra.client == nil {
		return fmt.Errorf("%w (stream=%q)", ErrRedisClientNotInitialized, streamName)
	}

	err := ra.client.XTrimMaxLen(ctx, streamName, maxLen).Err()
	if err != nil {
		return fmt.Errorf(
			"%w (operation=trim, stream=%q, maxLen=%d): %w",
			ErrRedisOperation,
			streamName,
			maxLen,
			err,
		)
	}

	return nil
}

func (ra *RedisAdapter) AckMessage(
	ctx context.Context,
	queueName, consumerGroup, receiptHandle string,
) error {
	if ra.client == nil {
		return fmt.Errorf("%w (queue=%q)", ErrRedisClientNotInitialized, queueName)
	}

	_, err := ra.client.XAck(ctx, queueName, consumerGroup, receiptHandle).Result()
	if err != nil && !errors.Is(err, redis.Nil) {
		return fmt.Errorf(
			"%w (operation=ack, queue=%q, group=%q, handle=%q): %w",
			ErrRedisOperation,
			queueName,
			consumerGroup,
			receiptHandle,
			err,
		)
	}

	return nil
}

func (ra *RedisAdapter) DeleteMessage(
	ctx context.Context,
	queueURI string,
	consumerGroup string,
	consumerName string,
	receiptHandle string,
) error {
	if ra.client == nil {
		return fmt.Errorf("%w (queue=%q)", ErrRedisClientNotInitialized, queueURI)
	}

	// For Redis Streams, "deleting" a message means acknowledging it
	_, err := ra.client.XAck(ctx, queueURI, consumerGroup, receiptHandle).Result()
	if err != nil && !errors.Is(err, redis.Nil) {
		return fmt.Errorf(
			"%w (operation=xack, queue=%q, group=%q, handle=%q): %w",
			ErrRedisOperation,
			queueURI,
			consumerGroup,
			receiptHandle,
			err,
		)
	}

	return nil
}

// Helper methods for Redis Streams consumption.
//
//nolint:funcorder // Helper methods grouped together for readability
func (ra *RedisAdapter) consumeLoop(
	ctx context.Context,
	queueName string,
	consumerGroup string,
	consumerName string,
	config ConsumerConfig,
	messages chan<- Message,
	errors chan<- error,
) {
	for {
		select {
		case <-ctx.Done():
			return
		default:
			err := ra.processStreamMessages(
				ctx,
				queueName,
				consumerGroup,
				consumerName,
				config,
				messages,
				errors,
			)
			if err != nil {
				select {
				case errors <- err:
				case <-ctx.Done():
					return
				}
			}
		}
	}
}

// processStreamMessages handles reading messages from Redis streams with reduced complexity.
//
//nolint:funcorder // Helper methods grouped together for readability
func (ra *RedisAdapter) processStreamMessages(
	ctx context.Context,
	queueName string,
	consumerGroup string,
	consumerName string,
	config ConsumerConfig,
	messages chan<- Message,
	_ chan<- error,
) error {
	if ra.client == nil {
		return fmt.Errorf("%w (queue=%q)", ErrRedisClientNotInitialized, queueName)
	}

	// Read messages from stream
	streams, err := ra.readFromStream(ctx, queueName, consumerGroup, consumerName, config)
	if err != nil {
		return err
	}

	// Process received messages
	ra.deliverMessages(ctx, streams, consumerGroup, queueName, messages)

	return nil
}

// readFromStream reads messages from Redis stream.
//
//nolint:funcorder // Helper methods grouped together for readability
func (ra *RedisAdapter) readFromStream(
	ctx context.Context,
	queueName string,
	consumerGroup string,
	consumerName string,
	config ConsumerConfig,
) ([]redis.XStream, error) {
	var streams []redis.XStream

	var err error

	if consumerGroup != "" && consumerName != "" {
		streams, err = ra.readFromConsumerGroup(ctx, queueName, consumerGroup, consumerName, config)
	} else {
		streams, err = ra.readDirectly(ctx, queueName, config)
	}

	if err != nil {
		if errors.Is(err, redis.Nil) || errors.Is(err, context.Canceled) ||
			errors.Is(err, context.DeadlineExceeded) {
			// Timeout or context cancellation - not an error
			return nil, nil
		}

		return nil, fmt.Errorf(
			"%w (operation=read, queue=%q, group=%q): %w",
			ErrRedisOperation,
			queueName,
			consumerGroup,
			err,
		)
	}

	return streams, nil
}

// readFromConsumerGroup reads messages as part of a consumer group.
//
//nolint:funcorder // Helper methods grouped together for readability
func (ra *RedisAdapter) readFromConsumerGroup(
	ctx context.Context,
	queueName string,
	consumerGroup string,
	consumerName string,
	config ConsumerConfig,
) ([]redis.XStream, error) {
	args := &redis.XReadGroupArgs{ //nolint:exhaustruct
		Group:    consumerGroup,
		Consumer: consumerName,
		Streams:  []string{queueName, ">"},
		Count:    getOrDefault(int64(config.PrefetchCount), DefaultPrefetchCount),
		Block:    config.BlockTimeout,
	}

	streams, err := ra.client.XReadGroup(ctx, args).Result()
	if err != nil {
		return nil, fmt.Errorf("%w (operation=read_group): %w", ErrRedisOperation, err)
	}

	return streams, nil
}

// readDirectly reads messages directly from stream.
//
//nolint:funcorder // Helper methods grouped together for readability
func (ra *RedisAdapter) readDirectly(
	ctx context.Context,
	queueName string,
	config ConsumerConfig,
) ([]redis.XStream, error) {
	args := &redis.XReadArgs{ //nolint:exhaustruct
		Streams: []string{queueName, "$"},
		Count:   getOrDefault(int64(config.PrefetchCount), DefaultPrefetchCount),
		Block:   config.BlockTimeout,
	}

	streams, err := ra.client.XRead(ctx, args).Result()
	if err != nil {
		return nil, fmt.Errorf("%w (operation=read_direct): %w", ErrRedisOperation, err)
	}

	return streams, nil
}

// deliverMessages sends messages to the output channel.
//
//nolint:funcorder // Helper methods grouped together for readability
func (ra *RedisAdapter) deliverMessages(
	ctx context.Context,
	streams []redis.XStream,
	consumerGroup string,
	queueName string,
	messages chan<- Message,
) {
	for _, stream := range streams {
		for _, msg := range stream.Messages {
			message := ra.createMessageFromStreamEntry(ctx, msg, consumerGroup, queueName)

			select {
			case messages <- message:
			case <-ctx.Done():
				return
			}
		}
	}
}

//nolint:funcorder // Helper methods grouped together for readability
func (ra *RedisAdapter) createMessageFromStreamEntry(
	ctx context.Context,
	entry redis.XMessage,
	consumerGroup string,
	streamName string,
) Message {
	// Extract the main body from the "data" field
	var body []byte
	if data, ok := entry.Values["data"].(string); ok {
		body = []byte(data)
	}

	// Convert headers (exclude the "data" field)
	headers := make(map[string]any)

	for k, v := range entry.Values {
		if k != "data" {
			headers[k] = v
		}
	}

	msg := Message{ //nolint:exhaustruct
		Body:          body,
		Headers:       headers,
		ReceiptHandle: entry.ID,
		MessageID:     entry.ID,
		ConsumerGroup: consumerGroup,
		StreamName:    streamName,
		Timestamp:     time.Now(), // Redis doesn't provide message timestamp in streams
	}

	// Set acknowledgment functions with context
	if consumerGroup != "" {
		msg.SetAckFunc(func() error {
			return ra.AckMessage(ctx, streamName, consumerGroup, entry.ID)
		})
		msg.SetNackFunc(func(requeue bool) error {
			// For Redis Streams, nack with requeue means not acknowledging the message
			// The message will remain in the pending list and can be claimed later
			if !requeue {
				// If not requeuing, we acknowledge the message
				return ra.AckMessage(ctx, streamName, consumerGroup, entry.ID)
			}

			return nil // Do nothing for nack with requeue
		})
	} else {
		// For direct stream consumption, there's no acknowledgment mechanism
		msg.SetAckFunc(func() error { return nil })
		msg.SetNackFunc(func(requeue bool) error { return nil })
	}

	return msg
}

// Helper function to convert Redis values to string map.
func convertValues(values map[string]any) map[string]string {
	result := make(map[string]string)

	for k, v := range values {
		if str, ok := v.(string); ok {
			result[k] = str
		} else {
			result[k] = fmt.Sprintf("%v", v)
		}
	}

	return result
}

// fetchPendingMessages retrieves pending messages from Redis.
//
//nolint:funcorder // Helper methods grouped together for readability
func (ra *RedisAdapter) fetchPendingMessages(
	ctx context.Context,
	queueName string,
	consumerGroup string,
	count int,
) ([]redis.XPendingExt, error) {
	pendingArgs := &redis.XPendingExtArgs{ //nolint:exhaustruct
		Stream: queueName,
		Group:  consumerGroup,
		Start:  "-",
		End:    "+",
		Count:  int64(count),
	}

	pendingMsgs, err := ra.client.XPendingExt(ctx, pendingArgs).Result()
	if err != nil && !errors.Is(err, redis.Nil) {
		return nil, fmt.Errorf(
			"%w (operation=pending, queue=%q, group=%q): %w",
			ErrRedisOperation,
			queueName,
			consumerGroup,
			err,
		)
	}

	return pendingMsgs, nil
}

// claimMessages filters and claims messages that are idle.
//
//nolint:funcorder // Helper methods grouped together for readability
func (ra *RedisAdapter) claimMessages(
	ctx context.Context,
	queueName string,
	consumerGroup string,
	consumerName string,
	minIdleTime time.Duration,
	pendingMsgs []redis.XPendingExt,
) ([]Message, error) {
	// Filter messages that are idle for longer than minIdleTime
	var messageIDs []string

	for _, p := range pendingMsgs {
		if p.Idle > minIdleTime {
			messageIDs = append(messageIDs, p.ID)
		}
	}

	if len(messageIDs) == 0 {
		return []Message{}, nil
	}

	// Claim the messages
	claimArgs := &redis.XClaimArgs{
		Stream:   queueName,
		Group:    consumerGroup,
		Consumer: consumerName,
		MinIdle:  minIdleTime,
		Messages: messageIDs,
	}

	claimedMsgs, err := ra.client.XClaim(ctx, claimArgs).Result()
	if err != nil && !errors.Is(err, redis.Nil) {
		return nil, fmt.Errorf(
			"%w (operation=claim, queue=%q, group=%q): %w",
			ErrRedisOperation,
			queueName,
			consumerGroup,
			err,
		)
	}

	messages := make([]Message, len(claimedMsgs))
	for i, msg := range claimedMsgs {
		messages[i] = ra.createMessageFromStreamEntry(ctx, msg, consumerGroup, queueName)
	}

	return messages, nil
}

// RedisConnectionFactory creates Redis connections with enhanced configuration.
type RedisConnectionFactory struct {
	protocol string
}

// NewRedisConnectionFactory creates a new Redis connection factory for a specific protocol.
func NewRedisConnectionFactory(protocol string) *RedisConnectionFactory {
	return &RedisConnectionFactory{
		protocol: protocol,
	}
}

func (f *RedisConnectionFactory) CreateConnection( //nolint:ireturn
	ctx context.Context,
	config *ConfigTarget,
) (Connection, error) {
	redisConfig := f.BuildRedisConfig(config)

	// Create the connection
	conn := NewRedisConnection(f.protocol, redisConfig)

	// Perform initial connection and health check
	err := conn.ensureClient()
	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrFailedToCreateRedisClient, err)
	}

	// Test the connection
	status := conn.HealthCheck(ctx)
	if status.State == ConnectionStateError {
		return nil, fmt.Errorf("%w: %w", ErrRedisConnectionFailed, status.Error)
	}

	return conn, nil
}

func (f *RedisConnectionFactory) GetProtocol() string {
	return f.protocol
}

func (f *RedisConnectionFactory) BuildRedisConfig(config *ConfigTarget) *RedisConfig {
	redisConfig := &RedisConfig{
		Address:               "localhost:6379",
		Password:              "",
		DB:                    0,
		PoolSize:              defaultPoolSize,
		MinIdleConns:          defaultMinIdleConns,
		MaxIdleConns:          defaultMaxIdleConns,
		ConnMaxIdleTime:       defaultConnMaxIdleTime,
		PoolTimeout:           defaultPoolTimeout,
		MaxRetries:            defaultMaxRetries,
		MinRetryBackoff:       defaultMinRetryBackoff,
		MaxRetryBackoff:       defaultMaxRetryBackoff,
		TLSEnabled:            false,
		TLSInsecureSkipVerify: false,
	}

	// Configure address from DSN or individual settings
	f.configureAddress(redisConfig, config)

	// Extract Redis-specific configuration from properties
	f.configureFromProperties(redisConfig, config)

	// Apply TLS settings from config
	f.configureTLS(redisConfig, config)

	return redisConfig
}

func (f *RedisConnectionFactory) configureAddress(redisConfig *RedisConfig, config *ConfigTarget) {
	if config.DSN != "" {
		// Parse Redis DSN/URL format
		err := f.parseRedisDSN(redisConfig, config.DSN)
		if err != nil {
			// Fallback to treating DSN as plain address
			redisConfig.Address = config.DSN
		}
	} else {
		// Build address from host and port
		redisConfig.Address = fmt.Sprintf("%s:%d",
			getOrDefault(config.Host, "localhost"),
			getOrDefault(config.Port, defaultRedisPort))
	}
}

// parseRedisDSN parses Redis connection strings in various formats:
// - redis://localhost:6379
// - redis://user:password@localhost:6379/0
// - rediss://localhost:6379 (TLS)
// - localhost:6379 (plain host:port).
func (f *RedisConnectionFactory) parseRedisDSN(redisConfig *RedisConfig, dsn string) error {
	// Try parsing as URL first
	parsedURL, err := url.Parse(dsn)
	if err == nil && parsedURL.Scheme != "" {
		return f.parseRedisURL(redisConfig, parsedURL)
	}

	// If not a URL, treat as plain host:port
	redisConfig.Address = dsn

	return nil
}

// parseRedisURL parses a Redis URL and configures the Redis config.
func (f *RedisConnectionFactory) parseRedisURL(redisConfig *RedisConfig, parsedURL *url.URL) error {
	// Set address (host:port)
	host := parsedURL.Hostname()
	port := parsedURL.Port()

	if host == "" {
		host = "localhost"
	}

	if port == "" {
		port = strconv.Itoa(defaultRedisPort)
	}

	redisConfig.Address = fmt.Sprintf("%s:%s", host, port)

	// Configure TLS based on scheme
	if parsedURL.Scheme == "rediss" {
		redisConfig.TLSEnabled = true
	}

	// Extract password if present
	if parsedURL.User != nil {
		if password, passwordSet := parsedURL.User.Password(); passwordSet {
			redisConfig.Password = password
		}
	}

	// Extract database number from path
	if parsedURL.Path != "" && parsedURL.Path != "/" {
		// Remove leading slash and parse as integer
		dbPath := parsedURL.Path[1:]

		db, atoiErr := strconv.Atoi(dbPath)
		if atoiErr == nil {
			redisConfig.DB = db
		}
	}

	return nil
}

func (f *RedisConnectionFactory) configureFromProperties(
	redisConfig *RedisConfig,
	config *ConfigTarget,
) {
	if config.Properties == nil {
		return
	}

	f.configureBasicProperties(redisConfig, config.Properties)
	f.configurePoolProperties(redisConfig, config.Properties)
	f.configureTLSProperties(redisConfig, config.Properties)
}

func (f *RedisConnectionFactory) configureBasicProperties(
	redisConfig *RedisConfig,
	properties map[string]any,
) {
	if password, ok := properties["password"].(string); ok {
		redisConfig.Password = password
	}

	if db, ok := properties["db"].(int); ok {
		redisConfig.DB = db
	}

	if maxRetries, ok := properties["max_retries"].(int); ok {
		redisConfig.MaxRetries = maxRetries
	}
}

func (f *RedisConnectionFactory) configurePoolProperties(
	redisConfig *RedisConfig,
	properties map[string]any,
) {
	if poolSize, ok := properties["pool_size"].(int); ok {
		redisConfig.PoolSize = poolSize
	}

	if minIdleConns, ok := properties["min_idle_conns"].(int); ok {
		redisConfig.MinIdleConns = minIdleConns
	}

	if maxIdleConns, ok := properties["max_idle_conns"].(int); ok {
		redisConfig.MaxIdleConns = maxIdleConns
	}

	if connMaxIdleTime, ok := properties["conn_max_idle_time"].(time.Duration); ok {
		redisConfig.ConnMaxIdleTime = connMaxIdleTime
	}

	if poolTimeout, ok := properties["pool_timeout"].(time.Duration); ok {
		redisConfig.PoolTimeout = poolTimeout
	}
}

func (f *RedisConnectionFactory) configureTLSProperties(
	redisConfig *RedisConfig,
	properties map[string]any,
) {
	if tlsEnabled, ok := properties["tls_enabled"].(bool); ok {
		redisConfig.TLSEnabled = tlsEnabled
	}

	if tlsInsecure, ok := properties["tls_insecure_skip_verify"].(bool); ok {
		redisConfig.TLSInsecureSkipVerify = tlsInsecure
	}
}

func (f *RedisConnectionFactory) configureTLS(redisConfig *RedisConfig, config *ConfigTarget) {
	if config.TLS {
		redisConfig.TLSEnabled = true
	}

	if config.TLSSkipVerify {
		redisConfig.TLSInsecureSkipVerify = true
	}
}

// Helper function to get value or default.
func getOrDefault[T comparable](value, defaultValue T) T { //nolint:ireturn
	var zero T
	if value == zero {
		return defaultValue
	}

	return value
}

// Eval executes a Lua script on Redis server using EVALSHA for performance.
// Scripts are cached and executed via EVALSHA (40-byte hash) instead of sending
// the full script text on every call. If the script is not cached on Redis,
// go-redis automatically falls back to EVAL and caches it.
func (ra *RedisAdapter) Eval(
	ctx context.Context,
	script string,
	keys []string,
	args ...any,
) (any, error) {
	if ra.client == nil {
		return nil, fmt.Errorf("%w (script eval)", ErrRedisClientNotInitialized)
	}

	// Get cached script with read lock
	ra.scriptCacheMux.RLock()
	cachedScript, exists := ra.scriptCache[script]
	ra.scriptCacheMux.RUnlock()

	// If not cached, create and store with write lock
	if !exists {
		ra.scriptCacheMux.Lock()
		// Double-check after acquiring write lock (another goroutine may have added it)
		cachedScript, exists = ra.scriptCache[script]
		if !exists {
			cachedScript = redis.NewScript(script)
			ra.scriptCache[script] = cachedScript
		}

		ra.scriptCacheMux.Unlock()
	}

	// Run uses EVALSHA first, falls back to EVAL if script not cached on Redis server
	result, err := cachedScript.Run(ctx, ra.client, keys, args...).Result()
	if err != nil {
		return nil, fmt.Errorf("%w (operation=evalsha): %w", ErrRedisOperation, err)
	}

	return result, nil
}

// ListItems lists items from a hash table and populates the provided slice.
// For Redis, this uses KEYS to get all items with the table prefix and populates the slice.
func (ra *RedisAdapter) ListItems( //nolint:cyclop
	ctx context.Context,
	tableName string,
	items any,
) error {
	if ra.client == nil {
		return fmt.Errorf("%w (table=%q)", ErrRedisClientNotInitialized, tableName)
	}

	// Use reflection to work with the slice
	sliceValue := reflect.ValueOf(items)
	if sliceValue.Kind() != reflect.Ptr || sliceValue.Elem().Kind() != reflect.Slice {
		return fmt.Errorf("%w (items=%v): %w", ErrRedisOperation, items, ErrExpectedPointerToSlice)
	}

	sliceElem := sliceValue.Elem()
	sliceType := sliceElem.Type()
	elemType := sliceType.Elem()

	// Get all keys with the table prefix
	keys, err := ra.client.Keys(ctx, tableName+":*").Result()
	if err != nil {
		return fmt.Errorf("%w (operation=keys, table=%q): %w", ErrRedisOperation, tableName, err)
	}

	// If no keys found, return empty slice
	if len(keys) == 0 {
		return nil
	}

	// Get all values for the keys
	values, err := ra.client.MGet(ctx, keys...).Result()
	if err != nil {
		return fmt.Errorf("%w (operation=mget, table=%q): %w", ErrRedisOperation, tableName, err)
	}

	// Create new slice to hold results
	newSlice := reflect.MakeSlice(sliceType, 0, len(values))

	// Unmarshal each value into the appropriate type
	for _, value := range values {
		if value == nil {
			continue // Skip nil values
		}

		// Create new instance of the element type
		newElem := reflect.New(elemType).Interface()

		// Unmarshal JSON into the new element
		if strValue, ok := value.(string); ok {
			err := json.Unmarshal([]byte(strValue), newElem)
			if err != nil {
				return fmt.Errorf("failed to unmarshal JSON for table %q: %w", tableName, err)
			}

			// Append to slice
			newSlice = reflect.Append(newSlice, reflect.ValueOf(newElem).Elem())
		}
	}

	// Set the result back to the original slice
	sliceElem.Set(newSlice)

	return nil
}

// GetItem retrieves a specific item from a hash table by key and populates the provided struct.
func (ra *RedisAdapter) GetItem(
	ctx context.Context,
	tableName string,
	pkName string,
	key string,
	item any,
) (bool, error) {
	if ra.client == nil {
		return false, fmt.Errorf("%w (table=%q)", ErrRedisClientNotInitialized, tableName)
	}

	// Construct the Redis key
	redisKey := fmt.Sprintf("%s:%s", tableName, key)

	// Get the JSON value from Redis
	jsonValue, err := ra.client.Get(ctx, redisKey).Result()
	if err != nil {
		if errors.Is(err, redis.Nil) {
			return false, nil // Item not found
		}

		return false, fmt.Errorf(
			"%w (operation=get, key=%q): %w",
			ErrRedisOperation,
			redisKey,
			err,
		)
	}

	// Unmarshal JSON into the provided item
	unmarshalErr := json.Unmarshal([]byte(jsonValue), item)
	if unmarshalErr != nil {
		return false, fmt.Errorf(
			"%w: (key=%q, value=%q): %w",
			ErrCorruptedJSONData,
			redisKey,
			jsonValue,
			unmarshalErr,
		)
	}

	_ = pkName // pkName is not used in Redis key-value storage

	return true, nil
}

// UpsertItem inserts or updates an item in Redis.
func (ra *RedisAdapter) UpsertItem(
	ctx context.Context,
	tableName string,
	pkName string,
	key string,
	item any,
) error {
	if ra.client == nil {
		return fmt.Errorf("%w (table=%q)", ErrRedisClientNotInitialized, tableName)
	}

	// Construct the Redis key
	redisKey := fmt.Sprintf("%s:%s", tableName, key)

	// Marshal the item to JSON
	jsonValue, err := json.Marshal(item)
	if err != nil {
		return fmt.Errorf(
			"%w: (key=%q, item=%v): %w",
			ErrCorruptedJSONData,
			redisKey,
			item,
			err,
		)
	}

	// Store the JSON value in Redis
	err = ra.client.Set(ctx, redisKey, string(jsonValue), 0).Err()
	if err != nil {
		return fmt.Errorf("%w (operation=set, key=%q): %w", ErrRedisOperation, redisKey, err)
	}

	_ = pkName // pkName is not used in Redis key-value storage

	return nil
}

// Additional Redis-specific methods that the repository uses.

// DeleteItem deletes an item from Redis.
func (ra *RedisAdapter) DeleteItem(
	ctx context.Context,
	tableName string,
	pkName string,
	key string,
) error {
	if ra.client == nil {
		return fmt.Errorf("%w (table=%q)", ErrRedisClientNotInitialized, tableName)
	}

	// Construct the Redis key
	redisKey := fmt.Sprintf("%s:%s", tableName, key)

	err := ra.client.Del(ctx, redisKey).Err()
	if err != nil {
		return fmt.Errorf("%w (operation=del, key=%q): %w", ErrRedisOperation, redisKey, err)
	}

	_ = pkName

	return nil
}

// SAdd adds members to a Redis set.
func (ra *RedisAdapter) SAdd(ctx context.Context, key string, members ...any) error {
	if ra.client == nil {
		return fmt.Errorf("%w (key=%q)", ErrRedisClientNotInitialized, key)
	}

	err := ra.client.SAdd(ctx, key, members...).Err()
	if err != nil {
		return fmt.Errorf("%w (operation=sadd, key=%q): %w", ErrRedisOperation, key, err)
	}

	return nil
}

// SMembers returns all members of a Redis set.
func (ra *RedisAdapter) SMembers(ctx context.Context, key string) ([]string, error) {
	if ra.client == nil {
		return nil, fmt.Errorf("%w (key=%q)", ErrRedisClientNotInitialized, key)
	}

	members, err := ra.client.SMembers(ctx, key).Result()
	if err != nil {
		return nil, fmt.Errorf("%w (operation=smembers, key=%q): %w", ErrRedisOperation, key, err)
	}

	return members, nil
}

// HGet gets a field value from a Redis hash.
func (ra *RedisAdapter) HGet(ctx context.Context, key string, field string) (string, error) {
	if ra.client == nil {
		return "", fmt.Errorf("%w (key=%q)", ErrRedisClientNotInitialized, key)
	}

	value, err := ra.client.HGet(ctx, key, field).Result()
	if err != nil {
		if errors.Is(err, redis.Nil) {
			return "", nil // Field doesn't exist
		}

		return "", fmt.Errorf(
			"%w (operation=hget, key=%q, field=%q): %w",
			ErrRedisOperation,
			key,
			field,
			err,
		)
	}

	return value, nil
}

// HSet sets a field value in a Redis hash.
func (ra *RedisAdapter) HSet(ctx context.Context, key string, field string, value string) error {
	if ra.client == nil {
		return fmt.Errorf("%w (key=%q)", ErrRedisClientNotInitialized, key)
	}

	err := ra.client.HSet(ctx, key, field, value).Err()
	if err != nil {
		return fmt.Errorf(
			"%w (operation=hset, key=%q, field=%q): %w",
			ErrRedisOperation,
			key,
			field,
			err,
		)
	}

	return nil
}

// HIncrBy increments a field in a Redis hash by the given value.
func (ra *RedisAdapter) HIncrBy(
	ctx context.Context,
	key string,
	field string,
	incr int64,
) (int64, error) {
	if ra.client == nil {
		return 0, fmt.Errorf("%w (key=%q)", ErrRedisClientNotInitialized, key)
	}

	newValue, err := ra.client.HIncrBy(ctx, key, field, incr).Result()
	if err != nil {
		return 0, fmt.Errorf(
			"%w (operation=hincrby, key=%q, field=%q): %w",
			ErrRedisOperation,
			key,
			field,
			err,
		)
	}

	return newValue, nil
}

// HDel deletes fields from a Redis hash.
func (ra *RedisAdapter) HDel(ctx context.Context, key string, fields ...string) error {
	if ra.client == nil {
		return fmt.Errorf("%w (key=%q)", ErrRedisClientNotInitialized, key)
	}

	err := ra.client.HDel(ctx, key, fields...).Err()
	if err != nil {
		return fmt.Errorf("%w (operation=hdel, key=%q): %w", ErrRedisOperation, key, err)
	}

	return nil
}

// SendMessage sends a message to a queue (Redis Stream).
func (ra *RedisAdapter) SendMessage(
	ctx context.Context,
	queueName string,
	messageBody []byte,
) (string, error) {
	err := ra.Publish(ctx, queueName, messageBody)
	if err != nil {
		return "", err
	}

	// Return a dummy message ID for now - in a real implementation this would be the stream entry ID
	return "msg_" + queueName, nil
}

// ReceiveMessages receives messages from a queue (Redis Stream).
func (ra *RedisAdapter) ReceiveMessages(
	ctx context.Context,
	queueURI string,
	consumerGroup string,
	consumerName string,
) ([]QueueMessage, error) {
	if ra.client == nil {
		return nil, fmt.Errorf("%w (queue=%q)", ErrRedisClientNotInitialized, queueURI)
	}

	// Use XReadGroup to read messages from the stream with consumer group
	args := &redis.XReadGroupArgs{ //nolint:exhaustruct
		Group:    consumerGroup,
		Consumer: consumerName,
		Streams:  []string{queueURI, ">"},
		Count:    ReadMessagesCount, // Read up to ReadMessagesCount messages at a time
		Block:    1 * time.Second,   // Block for 1 second waiting for messages
	}

	streams, err := ra.client.XReadGroup(ctx, args).Result()
	if err != nil {
		if errors.Is(err, redis.Nil) {
			// No messages available - return empty slice
			return []QueueMessage{}, nil
		}

		return nil, fmt.Errorf(
			"%w (operation=xreadgroup, queue=%q): %w",
			ErrRedisOperation,
			queueURI,
			err,
		)
	}

	var messages []QueueMessage

	for _, stream := range streams {
		for _, msg := range stream.Messages {
			// Extract the main body from the "data" field
			var body []byte
			if data, ok := msg.Values["data"].(string); ok {
				body = []byte(data)
			}

			queueMessage := QueueMessage{
				MessageID:     msg.ID,
				ReceiptHandle: msg.ID, // Use the stream message ID as receipt handle
				Body:          body,
			}

			messages = append(messages, queueMessage)
		}
	}

	return messages, nil
}

// GetQueueLength returns the length of a Redis Stream queue using XLEN.
func (ra *RedisAdapter) GetQueueLength(ctx context.Context, queueURI string) (int64, error) {
	if ra.client == nil {
		return 0, fmt.Errorf("%w (queue=%q)", ErrRedisClientNotInitialized, queueURI)
	}

	length, err := ra.client.XLen(ctx, queueURI).Result()
	if err != nil {
		return 0, fmt.Errorf("%w (operation=xlen, queue=%q): %w", ErrRedisOperation, queueURI, err)
	}

	return length, nil
}

// MemoryPurge runs Redis MEMORY PURGE command to optimize memory usage.
func (ra *RedisAdapter) MemoryPurge(ctx context.Context) error {
	if ra.client == nil {
		return fmt.Errorf("%w", ErrRedisClientNotInitialized)
	}

	// Execute MEMORY PURGE command using Do
	err := ra.client.Do(ctx, "MEMORY", "PURGE").Err()
	if err != nil {
		return fmt.Errorf("%w (operation=memory_purge): %w", ErrRedisOperation, err)
	}

	return nil
}
