package connfx

import (
	"context"
	"time"
)

// Default values for consumer configuration.
const (
	// C10K optimized: higher prefetch for better throughput.
	DefaultPrefetchCount = 100
	DefaultMaxRetries    = 3
	DefaultBlockTimeout  = 5 * time.Second
)

type ConnectionCapability string

const (
	// ConnectionCapabilityKeyValue represents key-value storage behavior.
	ConnectionCapabilityKeyValue ConnectionCapability = "key-value"

	// ConnectionCapabilityDocument represents document storage behavior.
	ConnectionCapabilityDocument ConnectionCapability = "document"

	// ConnectionCapabilityRelational represents relational database behavior.
	ConnectionCapabilityRelational ConnectionCapability = "relational"

	// ConnectionCapabilityTransactional represents transactional behavior.
	ConnectionCapabilityTransactional ConnectionCapability = "transactional"

	// ConnectionCapabilityCache represents caching behavior with expiration support.
	ConnectionCapabilityCache ConnectionCapability = "cache"

	// ConnectionCapabilityQueue represents message queue behavior.
	ConnectionCapabilityQueue ConnectionCapability = "queue"
)

// Repository defines the port for data access operations.
// This interface will be implemented by adapters in connfx for different storage technologies.
//
//nolint:interfacebloat // This is a core repository interface that needs these methods for hexagonal architecture
type Repository interface {
	// Get retrieves a value by key
	Get(ctx context.Context, key string) ([]byte, error)

	// Set stores a value with the given key
	Set(ctx context.Context, key string, value []byte) error

	// Remove deletes a value by key
	Remove(ctx context.Context, keys ...string) error

	// Update updates an existing value by key
	Update(ctx context.Context, key string, value []byte) error

	// Exists checks if a key exists
	Exists(ctx context.Context, key string) (bool, error)

	// FlushAll flushes all keys from all databases
	FlushAll(ctx context.Context) error

	// EnsureTableExists ensures that a table/collection exists with the given name and primary key
	EnsureTableExists(ctx context.Context, tableName string, primaryKeyAttributeName string) error

	// Close closes the repository and releases resources
	Close(ctx context.Context) error

	// Eval executes a Lua script (Redis-specific operation)
	Eval(ctx context.Context, script string, keys []string, args ...any) (any, error)

	// ListItems lists items from a table/collection and populates the provided slice
	ListItems(ctx context.Context, tableName string, items any) error

	// GetItem retrieves a specific item from a table/collection by key and populates the provided struct
	// Returns true if found, false if not found
	GetItem(
		ctx context.Context,
		tableName string,
		pkName string,
		key string,
		item any,
	) (bool, error)

	// UpsertItem inserts or updates an item in a table/collection
	UpsertItem(ctx context.Context, tableName string, pkName string, key string, item any) error
}

// CacheRepository extends Repository with cache-specific operations.
type CacheRepository interface {
	Repository

	// SetWithExpiration stores a value with the given key and expiration time
	SetWithExpiration(ctx context.Context, key string, value []byte, expiration time.Duration) error

	// GetTTL returns the time-to-live for a key
	GetTTL(ctx context.Context, key string) (time.Duration, error)

	// Expire sets an expiration time for an existing key
	Expire(ctx context.Context, key string, expiration time.Duration) error
}

// TransactionalRepository extends Repository with transaction support.
type TransactionalRepository interface {
	Repository

	// BeginTransaction starts a new transaction
	BeginTransaction(ctx context.Context) (TransactionContext, error)
}

// TransactionContext represents a transaction context for data operations.
type TransactionContext interface {
	// Commit commits the transaction
	Commit() error

	// Rollback rolls back the transaction
	Rollback() error

	// GetRepository returns a repository bound to this transaction
	GetRepository() Repository
}

// QueryRepository defines the port for query operations (for SQL-like storages).
type QueryRepository interface {
	// Query executes a query and returns raw results
	Query(ctx context.Context, query string, args ...any) (QueryResult, error)

	// Execute runs a command (INSERT, UPDATE, DELETE)
	Execute(ctx context.Context, command string, args ...any) (ExecuteResult, error)
}

// QueryResult represents query results.
type QueryResult interface {
	// Next advances to the next row
	Next() bool

	// Scan scans the current row into destinations
	Scan(dest ...any) error

	// Close closes the result set
	Close() error
}

// ExecuteResult represents execution results.
type ExecuteResult interface {
	// RowsAffected returns the number of rows affected
	RowsAffected() (int64, error)

	// LastInsertId returns the last insert ID (if applicable)
	LastInsertId() (int64, error)
}

// QueueRepository defines the port for message queue operations.
type QueueRepository interface {
	// QueueDeclare declares a queue and returns its name
	QueueDeclare(ctx context.Context, name string) (string, error)

	// QueueDeclareWithConfig declares a queue with specific configuration
	QueueDeclareWithConfig(ctx context.Context, name string, config QueueConfig) (string, error)

	// CreateQueueIfNotExists creates a queue if it doesn't exist and returns its URI
	CreateQueueIfNotExists(
		ctx context.Context,
		queueName string,
		consumerGroup string,
		attributes map[string]string,
	) (*string, error)

	// Publish sends a message to a queue
	Publish(ctx context.Context, queueName string, body []byte) error

	// PublishWithHeaders sends a message with custom headers
	PublishWithHeaders(
		ctx context.Context,
		queueName string,
		body []byte,
		headers map[string]any,
	) error

	// Consume starts consuming messages from a queue
	Consume(
		ctx context.Context,
		queueName string,
		config ConsumerConfig,
	) (<-chan Message, <-chan error)

	// ConsumeWithGroup starts consuming messages as part of a consumer group
	ConsumeWithGroup(
		ctx context.Context,
		queueName string,
		consumerGroup string,
		consumerName string,
		config ConsumerConfig,
	) (<-chan Message, <-chan error)

	// ClaimPendingMessages claims pending messages from a consumer group
	ClaimPendingMessages(
		ctx context.Context,
		queueName string,
		consumerGroup string,
		consumerName string,
		minIdleTime time.Duration,
		count int,
	) ([]Message, error)

	// AckMessage acknowledges a specific message by receipt handle
	AckMessage(ctx context.Context, queueName, consumerGroup, receiptHandle string) error

	// DeleteMessage removes a message from the queue (for non-streaming queues)
	DeleteMessage(ctx context.Context, queueName, receiptHandle string) error
}

// QueueStreamRepository defines operations for stream-based message systems (Redis Streams, Kafka, etc.)
type QueueStreamRepository interface {
	QueueRepository

	// CreateConsumerGroup creates a consumer group for a stream
	CreateConsumerGroup(ctx context.Context, streamName, consumerGroup, startID string) error

	// StreamInfo returns information about a stream
	StreamInfo(ctx context.Context, streamName string) (StreamInfo, error)

	// ConsumerGroupInfo returns information about consumer groups
	ConsumerGroupInfo(ctx context.Context, streamName string) ([]ConsumerGroupInfo, error)

	// TrimStream trims a stream to a maximum length
	TrimStream(ctx context.Context, streamName string, maxLen int64) error
}

// QueueConfig holds configuration for queue declaration.
type QueueConfig struct {
	// Args contains additional queue-specific arguments
	Args map[string]any
	// MaxLength sets maximum number of messages in queue (0 = unlimited)
	MaxLength int64
	// MessageTTL sets default TTL for messages
	MessageTTL time.Duration
	// Durable indicates if the queue should survive server restarts
	Durable bool
	// AutoDelete indicates if the queue should be deleted when no longer in use
	AutoDelete bool
	// Exclusive indicates if the queue is exclusive to one connection
	Exclusive bool
}

// ConsumerConfig holds configuration for message consumption.
type ConsumerConfig struct {
	// Args additional arguments for queue declaration
	Args map[string]any
	// AutoAck when true, the server will automatically acknowledge messages
	AutoAck bool
	// Exclusive when true, only this consumer can access the queue
	Exclusive bool
	// NoLocal when true, the server will not send messages to the connection that published them
	NoLocal bool
	// NoWait when true, the server will not respond to the declare
	NoWait bool
	// PrefetchCount sets how many messages to prefetch
	PrefetchCount int
	// BlockTimeout sets how long to wait for messages
	BlockTimeout time.Duration
	// MaxRetries sets maximum number of retries for failed messages
	MaxRetries int
	// RetryDelay sets delay between retries
	RetryDelay time.Duration
}

// StreamInfo provides information about a stream.
type StreamInfo struct {
	FirstEntry      *StreamEntry      `json:"first_entry,omitempty"`
	LastEntry       *StreamEntry      `json:"last_entry,omitempty"`
	Metadata        map[string]string `json:"metadata,omitempty"`
	LastGeneratedID string            `json:"last_generated_id"`
	MaxDeletedID    string            `json:"max_deleted_id"`
	RecordedFirstID string            `json:"recorded_first_id"`
	Length          int64             `json:"length"`
	RadixTreeKeys   int64             `json:"radix_tree_keys"`
	RadixTreeNodes  int64             `json:"radix_tree_nodes"`
	Groups          int64             `json:"groups"`
	EntriesAdded    int64             `json:"entries_added"`
}

// StreamEntry represents a single stream entry.
type StreamEntry struct {
	Fields map[string]string `json:"fields"`
	ID     string            `json:"id"`
}

// ConsumerGroupInfo provides information about a consumer group.
type ConsumerGroupInfo struct {
	Name            string `json:"name"`
	LastDeliveredID string `json:"last_delivered_id"`
	Consumers       int64  `json:"consumers"`
	Pending         int64  `json:"pending"`
	EntriesRead     int64  `json:"entries_read"`
	Lag             int64  `json:"lag"`
}

// Message represents a consumed message with its metadata and acknowledgment functions.
type Message struct {
	// Timestamp when the message was created
	Timestamp time.Time
	// Headers contains message headers
	Headers map[string]any
	// ack acknowledges the message
	ack func() error
	// nack negatively acknowledges the message
	nack func(requeue bool) error
	// ReceiptHandle is a unique identifier for the message (for acknowledgment)
	ReceiptHandle string
	// MessageID is the message identifier
	MessageID string
	// ConsumerGroup indicates which consumer group this message belongs to (if applicable)
	ConsumerGroup string
	// StreamName indicates which stream this message came from (for stream-based systems)
	StreamName string
	// Body contains the message payload
	Body []byte
	// DeliveryCount indicates how many times this message has been delivered
	DeliveryCount int
}

// Ack acknowledges the message.
func (m *Message) Ack() error {
	return m.ack()
}

// Nack negatively acknowledges the message.
func (m *Message) Nack(requeue bool) error {
	return m.nack(requeue)
}

// SetAckFunc sets the acknowledgment function.
func (m *Message) SetAckFunc(ackFunc func() error) {
	m.ack = ackFunc
}

// SetNackFunc sets the negative acknowledgment function.
func (m *Message) SetNackFunc(nackFunc func(requeue bool) error) {
	m.nack = nackFunc
}

// DefaultConsumerConfig returns a default configuration for consuming messages.
func DefaultConsumerConfig() ConsumerConfig {
	return ConsumerConfig{
		Args:          make(map[string]any),
		AutoAck:       false,
		Exclusive:     false,
		NoLocal:       false,
		NoWait:        false,
		PrefetchCount: DefaultPrefetchCount,
		BlockTimeout:  DefaultBlockTimeout,
		MaxRetries:    DefaultMaxRetries,
		RetryDelay:    1 * time.Second,
	}
}

// DefaultQueueConfig returns a default configuration for queue declaration.
func DefaultQueueConfig() QueueConfig {
	return QueueConfig{
		Durable:    false,
		AutoDelete: false,
		Exclusive:  false,
		Args:       make(map[string]any),
		MaxLength:  0, // Unlimited
		MessageTTL: 0, // No TTL
	}
}
