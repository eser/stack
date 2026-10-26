package processfx

import (
	"context"
	"fmt"
	"time"
)

// HeartbeatType indicates what kind of liveness signal.
type HeartbeatType int

const (
	// HeartbeatLiveness indicates the worker is alive (basic check).
	HeartbeatLiveness HeartbeatType = iota
	// HeartbeatProgress indicates the worker made progress (prevents live-lock detection).
	HeartbeatProgress
)

// Heartbeat represents a liveness signal from a worker.
type Heartbeat struct {
	Type      HeartbeatType
	Timestamp time.Time
	WorkerID  string
	Progress  int64 // items processed since last heartbeat
}

// HeartbeatSender allows workers to send heartbeats to their supervisor.
type HeartbeatSender interface {
	// SendHeartbeat sends a full heartbeat with all fields.
	SendHeartbeat(ctx context.Context, hb Heartbeat) error
	// Beat sends a simple liveness signal.
	Beat(ctx context.Context)
	// BeatWithProgress sends a heartbeat with progress information.
	BeatWithProgress(ctx context.Context, itemsProcessed int64)
}

// heartbeatSender implements HeartbeatSender.
type heartbeatSender struct {
	ch       chan<- Heartbeat
	workerID string
}

// NewHeartbeatSender creates a new heartbeat sender.
func NewHeartbeatSender(ch chan<- Heartbeat, workerID string) HeartbeatSender {
	return &heartbeatSender{
		ch:       ch,
		workerID: workerID,
	}
}

func (h *heartbeatSender) Beat(ctx context.Context) {
	_ = h.SendHeartbeat(ctx, Heartbeat{
		Type:      HeartbeatLiveness,
		Timestamp: time.Now(),
		WorkerID:  h.workerID,
		Progress:  0,
	})
}

func (h *heartbeatSender) BeatWithProgress(ctx context.Context, itemsProcessed int64) {
	_ = h.SendHeartbeat(ctx, Heartbeat{
		Type:      HeartbeatProgress,
		Timestamp: time.Now(),
		WorkerID:  h.workerID,
		Progress:  itemsProcessed,
	})
}

func (h *heartbeatSender) SendHeartbeat(ctx context.Context, hb Heartbeat) error {
	select {
	case h.ch <- hb:
		return nil
	case <-ctx.Done():
		return fmt.Errorf("heartbeat send canceled: %w", ctx.Err())
	default:
		// Channel full, skip (supervisor will still timeout if truly stuck).
		// This prevents blocking the worker if heartbeats aren't being consumed.
		return nil
	}
}

// NoopHeartbeatSender is a no-op implementation for backward compatibility.
type NoopHeartbeatSender struct{}

func (NoopHeartbeatSender) SendHeartbeat(_ context.Context, _ Heartbeat) error { return nil }
func (NoopHeartbeatSender) Beat(_ context.Context)                             {}
func (NoopHeartbeatSender) BeatWithProgress(_ context.Context, _ int64)        {}

// heartbeatContextKey is the key for storing HeartbeatSender in context.
type heartbeatContextKey struct{}

// ContextWithHeartbeat returns a new context with the HeartbeatSender attached.
func ContextWithHeartbeat(ctx context.Context, hb HeartbeatSender) context.Context {
	return context.WithValue(ctx, heartbeatContextKey{}, hb)
}

// HeartbeatFromContext retrieves the HeartbeatSender from context.
// Returns NoopHeartbeatSender if not found.
func HeartbeatFromContext(ctx context.Context) HeartbeatSender {
	if hb, ok := ctx.Value(heartbeatContextKey{}).(HeartbeatSender); ok {
		return hb
	}

	return NoopHeartbeatSender{}
}
