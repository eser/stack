package connfx

import (
	"context"
	"errors"
	"fmt"
	"time"
)

// Sentinel errors for GetTypedConnection function.
var (
	ErrRegistryIsNil      = errors.New("registry is nil")
	ErrRawConnectionIsNil = errors.New("raw connection is nil")
	ErrInvalidType        = errors.New("invalid type")
)

// ConnectionBehavior represents the behavioral type of connection.
type ConnectionBehavior string

const (
	// ConnectionBehaviorStateful represents persistent connections that maintain state
	// Examples: database connections, persistent TCP connections, connection pools.
	ConnectionBehaviorStateful ConnectionBehavior = "stateful"

	// ConnectionBehaviorStateless represents connections that don't maintain state
	// Examples: HTTP clients, REST APIs, stateless services.
	ConnectionBehaviorStateless ConnectionBehavior = "stateless"

	// ConnectionBehaviorStreaming represents streaming/real-time connections
	// Examples: message queues, event streams, websockets, gRPC streams.
	ConnectionBehaviorStreaming ConnectionBehavior = "streaming"
)

// ConnectionState represents the current state of a connection.
//
//go:generate go tool stringer -type ConnectionState -trimprefix ConnectionState
type ConnectionState int32

const (
	ConnectionStateNotInitialized ConnectionState = 0
	ConnectionStateConnected      ConnectionState = 1
	ConnectionStateLive           ConnectionState = 2
	ConnectionStateReady          ConnectionState = 3
	ConnectionStateDisconnected   ConnectionState = 4
	ConnectionStateError          ConnectionState = 5
	ConnectionStateReconnecting   ConnectionState = 6
)

// HealthStatus represents the health check result.
type HealthStatus struct {
	Timestamp time.Time       `json:"timestamp"`
	Error     error           `json:"error,omitempty"`
	Message   string          `json:"message,omitempty"`
	Latency   time.Duration   `json:"latency,omitempty"`
	State     ConnectionState `json:"state"`
}

// Connection represents a generic connection interface.
type Connection interface {
	// GetBehaviors returns the connection behaviors this connection supports
	GetBehaviors() []ConnectionBehavior

	// GetCapabilities returns the connection capabilities this connection supports
	GetCapabilities() []ConnectionCapability

	// GetProtocol returns the protocol/technology used (e.g., "postgres", "redis", "http")
	GetProtocol() string

	// GetState returns the current connection state
	GetState() ConnectionState

	// HealthCheck performs a health check and returns the status
	HealthCheck(ctx context.Context) *HealthStatus

	// Close closes the connection
	Close(ctx context.Context) error

	// GetRawConnection returns the underlying connection object
	GetRawConnection() any
}

// ConnectionFactory creates connections from configuration.
type ConnectionFactory interface {
	// CreateConnection creates a new connection from configuration
	CreateConnection(ctx context.Context, config *ConfigTarget) (Connection, error)

	// GetProtocol returns the protocol this factory supports (e.g., "postgres", "redis")
	GetProtocol() string
}

// GetTypedConnection extracts a typed connection from a Connection interface.
// This provides type-safe access to the underlying connection without manual type assertions.
//
// Example usage:
//
//	db, err := connfx.GetTypedConnection[*sql.DB](registry, "database")
//	if err != nil { return err }
//
//	// Now db is *sql.DB and can be used safely
//	rows, err := db.Query("SELECT * FROM users")
func GetTypedConnection[T any](registry *Registry, name string) (T, error) { //nolint:ireturn
	var zero T

	if registry == nil {
		return zero, ErrRegistryIsNil
	}

	conn := registry.GetNamed(name)
	if conn == nil {
		return zero, ErrConnectionNotFound
	}

	raw := conn.GetRawConnection()
	if raw == nil {
		return zero, fmt.Errorf(
			"%w (protocol=%q)",
			ErrRawConnectionIsNil,
			conn.GetProtocol(),
		)
	}

	typed, ok := raw.(T)
	if !ok {
		return zero, fmt.Errorf("%w (protocol=%q, expected=%T, got=%T)",
			ErrInvalidType, conn.GetProtocol(), zero, raw)
	}

	return typed, nil
}
