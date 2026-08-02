//go:build !windows

package httpfx

import (
	"fmt"
	"syscall"

	"golang.org/x/sys/unix"
)

// applySocketOptions sets listener-level socket options on the raw file
// descriptor: SO_REUSEADDR (for faster restarts) and, when enabled,
// TCP_NODELAY (to disable Nagle's algorithm). This is the Unix implementation;
// Windows uses a no-op variant (see listener_windows.go).
func applySocketOptions(c syscall.RawConn, config *ListenerConfig) error {
	var sockErr error

	controlErr := c.Control(func(fileDescriptor uintptr) {
		// Enable SO_REUSEADDR for faster restarts
		sockErr = unix.SetsockoptInt(
			int(fileDescriptor),
			unix.SOL_SOCKET,
			unix.SO_REUSEADDR,
			1,
		)
		if sockErr != nil {
			return
		}

		// Enable TCP_NODELAY for lower latency (disable Nagle's algorithm)
		if config.TCPNoDelay {
			sockErr = unix.SetsockoptInt(
				int(fileDescriptor),
				unix.IPPROTO_TCP,
				unix.TCP_NODELAY,
				1,
			)
			if sockErr != nil {
				return
			}
		}

		// SO_REUSEPORT allows multiple listeners on same port (load balancing)
		// Note: Only enable if you're running multiple server instances
		// sockErr = unix.SetsockoptInt(int(fd), unix.SOL_SOCKET, unix.SO_REUSEPORT, 1)
	})
	if controlErr != nil {
		return fmt.Errorf("listener socket control: %w", controlErr)
	}

	if sockErr != nil {
		return fmt.Errorf("listener setsockopt: %w", sockErr)
	}

	return nil
}
