package connfx

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"maps"
	"slices"
	"strings"
	"sync"
)

var (
	ErrConnectionNotFound       = errors.New("connection not found")
	ErrConnectionAlreadyExists  = errors.New("connection already exists")
	ErrFailedToCreateConnection = errors.New("failed to create connection")
	ErrUnsupportedProtocol      = errors.New("unsupported protocol")
	ErrFailedToCloseConnections = errors.New("failed to close connections")
	ErrFailedToAddConnection    = errors.New("failed to add connection")
	ErrConnectionNotSupported   = errors.New("connection does not support required operations")
	ErrInterfaceNotImplemented  = errors.New("connection does not implement required interface")
)

const DefaultConnection = "default"

// Registry manages all connections in the system.
type Registry struct {
	connections map[string]Connection
	factories   map[string]ConnectionFactory // protocol -> factory
	logger      Logger
	mu          sync.RWMutex
}

// NewRegistry creates a new connection registry.
func NewRegistry(options ...NewRegistryOption) *Registry {
	registry := &Registry{
		connections: make(map[string]Connection),
		factories:   make(map[string]ConnectionFactory),
		logger:      slog.Default(),
		mu:          sync.RWMutex{},
	}

	for _, option := range options {
		option(registry)
	}

	return registry
}

// RegisterFactory registers a connection factory for a specific protocol.
func (registry *Registry) RegisterFactory(factory ConnectionFactory) {
	registry.mu.Lock()
	defer registry.mu.Unlock()

	protocol := factory.GetProtocol()

	registry.factories[protocol] = factory
}

// GetDefault returns the default connection.
func (registry *Registry) GetDefault() Connection { //nolint:ireturn
	registry.mu.RLock()
	defer registry.mu.RUnlock()

	return registry.connections[DefaultConnection]
}

// GetNamed returns a named connection.
func (registry *Registry) GetNamed(name string) Connection { //nolint:ireturn
	registry.mu.RLock()
	defer registry.mu.RUnlock()

	return registry.connections[name]
}

// GetByBehavior returns all connections of a specific behavior.
func (registry *Registry) GetByBehavior(behavior ConnectionBehavior) []Connection {
	registry.mu.RLock()
	defer registry.mu.RUnlock()

	var connections []Connection
	for _, conn := range registry.connections {
		// Check if the connection supports the requested behavior
		if slices.Contains(conn.GetBehaviors(), behavior) {
			connections = append(connections, conn)
		}
	}

	return connections
}

// GetByCapability returns all connections of a specific capability.
func (registry *Registry) GetByCapability(capability ConnectionCapability) []Connection {
	registry.mu.RLock()
	defer registry.mu.RUnlock()

	var connections []Connection
	for _, conn := range registry.connections {
		if slices.Contains(conn.GetCapabilities(), capability) {
			connections = append(connections, conn)
		}
	}

	return connections
}

// GetByProtocol returns all connections of a specific protocol.
func (registry *Registry) GetByProtocol(protocol string) []Connection {
	registry.mu.RLock()
	defer registry.mu.RUnlock()

	var connections []Connection
	for _, conn := range registry.connections {
		if conn.GetProtocol() == protocol {
			connections = append(connections, conn)
		}
	}

	return connections
}

// ListConnections returns all connection names.
func (registry *Registry) ListConnections() []string {
	registry.mu.RLock()
	defer registry.mu.RUnlock()

	names := make([]string, 0, len(registry.connections))
	for name := range registry.connections {
		names = append(names, name)
	}

	return names
}

// ListRegisteredProtocols returns all registered protocols.
func (registry *Registry) ListRegisteredProtocols() []string {
	registry.mu.RLock()
	defer registry.mu.RUnlock()

	protocols := make([]string, 0, len(registry.factories))
	for protocol := range registry.factories {
		protocols = append(protocols, protocol)
	}

	return protocols
}

// AddConnection adds a new connection to the registry.
func (registry *Registry) AddConnection( //nolint:ireturn
	ctx context.Context,
	name string,
	config *ConfigTarget,
) (Connection, error) {
	registry.mu.Lock()
	defer registry.mu.Unlock()

	// Check if connection already exists
	if _, exists := registry.connections[name]; exists {
		return nil, fmt.Errorf("%w (name=%q)", ErrConnectionAlreadyExists, name)
	}

	// Get factory for this protocol
	factory, exists := registry.factories[config.Protocol]
	if !exists {
		return nil, fmt.Errorf("%w (protocol=%q)", ErrUnsupportedProtocol, config.Protocol)
	}

	registry.logger.DebugContext(
		ctx,
		"creating connection",
		slog.String("name", name),
		slog.String("protocol", config.Protocol),
	)

	// Create the connection
	conn, err := factory.CreateConnection(ctx, config)
	if err != nil {
		registry.logger.ErrorContext(
			ctx,
			"failed to create connection",
			slog.String("error", err.Error()),
			slog.String("name", name),
			slog.String("protocol", config.Protocol),
		)

		return nil, fmt.Errorf("%w (name=%q): %w", ErrFailedToCreateConnection, name, err)
	}

	registry.connections[name] = conn

	registry.logger.DebugContext(
		ctx,
		"successfully added connection",
		slog.String("name", name),
		slog.String("protocol", config.Protocol),
	)

	return conn, nil
}

// RemoveConnection removes a connection from the registry.
func (registry *Registry) RemoveConnection(ctx context.Context, name string) error {
	registry.mu.Lock()
	defer registry.mu.Unlock()

	conn, exists := registry.connections[name]
	if !exists {
		return fmt.Errorf("%w (name=%q)", ErrConnectionNotFound, name)
	}

	// Close the connection
	err := conn.Close(ctx)
	if err != nil {
		registry.logger.WarnContext(
			ctx,
			"error closing connection",
			slog.String("error", err.Error()),
			slog.String("name", name),
		)
	}

	delete(registry.connections, name)

	registry.logger.DebugContext(
		ctx,
		"removed connection",
		slog.String("name", name),
	)

	return nil
}

func (registry *Registry) LoadFromConfig(ctx context.Context, config *Config) error {
	for name, target := range config.Targets {
		_, addErr := registry.AddConnection(ctx, name, &target)
		if addErr != nil {
			return fmt.Errorf("%w (name=%q): %w", ErrFailedToAddConnection, name, addErr)
		}
	}

	return nil
}

// HealthCheck performs health checks on all connections.
func (registry *Registry) HealthCheck(ctx context.Context) map[string]*HealthStatus {
	registry.mu.RLock()

	connections := make(map[string]Connection, len(registry.connections))
	maps.Copy(connections, registry.connections)
	registry.mu.RUnlock()

	results := make(map[string]*HealthStatus)

	// Use a channel to collect results
	type healthResult struct {
		status *HealthStatus
		name   string
	}

	resultChan := make(chan healthResult, len(connections))

	// Perform health checks concurrently
	for name, conn := range connections {
		go func(name string, conn Connection) {
			status := conn.HealthCheck(ctx)
			resultChan <- healthResult{name: name, status: status}
		}(name, conn)
	}

	// Collect results
	for range len(connections) {
		result := <-resultChan
		results[result.name] = result.status
	}

	return results
}

// Close closes all connections in the registry.
func (registry *Registry) Close(ctx context.Context) error {
	registry.mu.Lock()
	defer registry.mu.Unlock()

	var errors []error

	for name, conn := range registry.connections {
		err := conn.Close(ctx)
		if err != nil {
			errors = append(
				errors,
				fmt.Errorf("%w (name=%q): %w", ErrFailedToCloseConnection, name, err),
			)
		}
	}

	// Clear the connections map
	registry.connections = make(map[string]Connection)

	if len(errors) > 0 {
		errStrs := make([]string, len(errors))
		for i, err := range errors {
			errStrs[i] = err.Error()
		}

		// Combine all errors into one
		errMsg := strings.Join(errStrs, "; ")

		return fmt.Errorf("%w: %s", ErrFailedToCloseConnections, errMsg)
	}

	return nil
}

// GetRepository returns a Repository from a connection if it supports it.
func (registry *Registry) GetRepository(name string) (Repository, error) { //nolint:ireturn
	registry.mu.RLock()
	defer registry.mu.RUnlock()

	conn := registry.connections[name]
	if conn == nil {
		return nil, fmt.Errorf("%w (name=%q)", ErrConnectionNotFound, name)
	}

	// Check if the connection supports key-value behavior
	capabilities := conn.GetCapabilities()
	if !slices.Contains(capabilities, ConnectionCapabilityKeyValue) &&
		!slices.Contains(capabilities, ConnectionCapabilityDocument) &&
		!slices.Contains(capabilities, ConnectionCapabilityRelational) {
		return nil, fmt.Errorf("%w (name=%q, operation=%q)",
			ErrConnectionNotSupported, name, "data repository operations")
	}

	// Try to get the repository from the raw connection
	repo, ok := conn.GetRawConnection().(Repository)
	if !ok {
		return nil, fmt.Errorf("%w (name=%q, interface=%q)",
			ErrInterfaceNotImplemented, name, "Repository")
	}

	return repo, nil
}
