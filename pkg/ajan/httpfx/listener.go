package httpfx

import (
	"context"
	"fmt"
	"net"
	"sync/atomic"
	"syscall"
	"time"
)

// ListenerConfig holds configuration for the high-performance TCP listener.
type ListenerConfig struct {
	// KeepAlivePeriod sets the TCP keep-alive period. Zero disables keep-alive.
	KeepAlivePeriod time.Duration

	// MaxConnections limits concurrent connections. Zero means unlimited.
	MaxConnections int

	// TCPNoDelay disables Nagle's algorithm (TCP_NODELAY) for lower latency.
	TCPNoDelay bool

	// KeepAlive enables TCP keep-alive on accepted connections.
	KeepAlive bool
}

// HighPerfListener wraps a net.Listener with connection limiting and optimized socket options.
type HighPerfListener struct {
	net.Listener

	config      *ListenerConfig
	connSem     chan struct{} // Semaphore for connection limiting
	activeConns int64         // Atomic counter for active connections
}

// NewHighPerfListener creates a high-performance TCP listener with optimized socket options.
// It configures TCP_NODELAY, SO_REUSEADDR, and optionally limits concurrent connections.
//
// Listener-level socket options are applied by applySocketOptions, whose
// implementation is platform-specific (see listener_unix.go and
// listener_windows.go).
func NewHighPerfListener(
	ctx context.Context,
	addr string,
	config *ListenerConfig,
) (*HighPerfListener, error) {
	// Create listener config with socket options
	listenCfg := &net.ListenConfig{ //nolint:exhaustruct
		Control: func(_, _ string, c syscall.RawConn) error {
			return applySocketOptions(c, config)
		},
		KeepAlive: config.KeepAlivePeriod,
	}

	// Create the listener
	listener, err := listenCfg.Listen(ctx, "tcp", addr)
	if err != nil {
		return nil, fmt.Errorf("high-perf listener creation: %w", err)
	}

	hpl := &HighPerfListener{
		Listener:    listener,
		config:      config,
		connSem:     nil,
		activeConns: 0,
	}

	// Initialize connection semaphore if limiting is enabled
	if config.MaxConnections > 0 {
		hpl.connSem = make(chan struct{}, config.MaxConnections)
	}

	return hpl, nil
}

// Accept waits for and returns the next connection with optimized settings.
// If MaxConnections is set, it blocks when the limit is reached.
func (l *HighPerfListener) Accept() (net.Conn, error) {
	// Acquire semaphore slot if connection limiting is enabled
	if l.connSem != nil {
		l.connSem <- struct{}{}
	}

	conn, err := l.Listener.Accept()
	if err != nil {
		// Release semaphore on error
		if l.connSem != nil {
			<-l.connSem
		}

		return nil, fmt.Errorf("listener accept: %w", err)
	}

	// Apply TCP optimizations to the connection
	if tcpConn, ok := conn.(*net.TCPConn); ok {
		// Enable keep-alive
		if l.config.KeepAlive {
			_ = tcpConn.SetKeepAlive(true)

			if l.config.KeepAlivePeriod > 0 {
				_ = tcpConn.SetKeepAlivePeriod(l.config.KeepAlivePeriod)
			}
		}

		// TCP_NODELAY is set at listener level, but we can also set it per-connection
		if l.config.TCPNoDelay {
			_ = tcpConn.SetNoDelay(true)
		}
	}

	atomic.AddInt64(&l.activeConns, 1)

	// Wrap connection to track when it's closed
	return &trackedConn{
		Conn:     conn,
		listener: l,
		closed:   0,
	}, nil
}

// ActiveConnections returns the current number of active connections.
func (l *HighPerfListener) ActiveConnections() int64 {
	return atomic.LoadInt64(&l.activeConns)
}

// trackedConn wraps a net.Conn to track connection lifecycle.
type trackedConn struct {
	net.Conn

	listener *HighPerfListener
	closed   int32 // Atomic flag to prevent double-close
}

// Close closes the connection and releases resources.
func (c *trackedConn) Close() error {
	// Prevent double-close
	if !atomic.CompareAndSwapInt32(&c.closed, 0, 1) {
		return nil
	}

	// Decrement active connections
	atomic.AddInt64(&c.listener.activeConns, -1)

	// Release semaphore slot
	if c.listener.connSem != nil {
		<-c.listener.connSem
	}

	err := c.Conn.Close()
	if err != nil {
		return fmt.Errorf("tracked conn close: %w", err)
	}

	return nil
}
