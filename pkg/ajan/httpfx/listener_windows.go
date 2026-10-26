//go:build windows

package httpfx

import "syscall"

// applySocketOptions is a no-op on Windows.
//
// SO_REUSEADDR is intentionally NOT set: on Windows it has different — and
// unsafe — semantics, allowing another process to bind to and hijack an
// already-bound port, so the Go runtime deliberately avoids it (it relies on
// SO_EXCLUSIVEADDRUSE instead). TCP_NODELAY is applied per-connection in
// Accept() via (*net.TCPConn).SetNoDelay, which is cross-platform, so no
// listener-level socket tuning is required here.
func applySocketOptions(_ syscall.RawConn, _ *ListenerConfig) error {
	return nil
}
