package processfx

import (
	"errors"
	"time"
)

// Default supervision configuration values.
const (
	defaultHeartbeatTimeoutSeconds = 30
	defaultMaxRestarts             = 5
	defaultBackoffMaxSeconds       = 60
	defaultBackoffMultiplier       = 2.0
)

// Sentinel validation errors.
var (
	ErrWorkerNameRequired       = errors.New("worker name is required")
	ErrHeartbeatTimeoutPositive = errors.New("heartbeat timeout must be positive")
	ErrMaxRestartsNonNegative   = errors.New("max restarts cannot be negative")
	ErrBackoffInitialPositive   = errors.New("backoff initial must be positive")
	ErrBackoffMaxTooSmall       = errors.New("backoff max must be >= backoff initial")
	ErrBackoffMultiplierTooLow  = errors.New("backoff multiplier must be >= 1.0")
)

// Supervision errors.
var (
	ErrMaxRestartsExceeded = errors.New("worker exceeded maximum restart attempts")
	ErrWorkerPanicked      = errors.New("worker panicked during execution")
)

// SupervisedWorkerConfig configures supervision behavior for a worker.
type SupervisedWorkerConfig struct {
	// Name identifies the worker for logging and metrics.
	Name string

	// HeartbeatTimeout is how long to wait before considering a worker stuck.
	// If no heartbeat is received within this duration, the worker is restarted.
	HeartbeatTimeout time.Duration

	// MaxRestarts is the maximum number of consecutive restart attempts.
	// After this many restarts without a successful heartbeat, the supervisor gives up.
	MaxRestarts int

	// BackoffInitial is the initial delay between restart attempts.
	BackoffInitial time.Duration

	// BackoffMax is the maximum delay between restart attempts.
	BackoffMax time.Duration

	// BackoffMultiplier controls exponential backoff growth.
	BackoffMultiplier float64
}

// DefaultSupervisedConfig returns sensible defaults for worker supervision.
func DefaultSupervisedConfig(name string) SupervisedWorkerConfig {
	return SupervisedWorkerConfig{
		Name:              name,
		HeartbeatTimeout:  defaultHeartbeatTimeoutSeconds * time.Second,
		MaxRestarts:       defaultMaxRestarts,
		BackoffInitial:    1 * time.Second,
		BackoffMax:        defaultBackoffMaxSeconds * time.Second,
		BackoffMultiplier: defaultBackoffMultiplier,
	}
}

// Validate checks the configuration for errors.
func (c SupervisedWorkerConfig) Validate() error {
	if c.Name == "" {
		return ErrWorkerNameRequired
	}

	if c.HeartbeatTimeout <= 0 {
		return ErrHeartbeatTimeoutPositive
	}

	if c.MaxRestarts < 0 {
		return ErrMaxRestartsNonNegative
	}

	if c.BackoffInitial <= 0 {
		return ErrBackoffInitialPositive
	}

	if c.BackoffMax < c.BackoffInitial {
		return ErrBackoffMaxTooSmall
	}

	if c.BackoffMultiplier < 1.0 {
		return ErrBackoffMultiplierTooLow
	}

	return nil
}

// WorkerState represents the current state of a supervised worker.
type WorkerState int

const (
	// WorkerStateIdle indicates the worker has not started yet.
	WorkerStateIdle WorkerState = iota
	// WorkerStateRunning indicates the worker is running normally.
	WorkerStateRunning
	// WorkerStateStuck indicates no heartbeat was received within timeout.
	WorkerStateStuck
	// WorkerStateRestarting indicates the worker is being restarted.
	WorkerStateRestarting
	// WorkerStateFailed indicates the worker exceeded max restarts and stopped.
	WorkerStateFailed
)

// String returns a human-readable state name.
func (s WorkerState) String() string {
	switch s {
	case WorkerStateIdle:
		return "idle"
	case WorkerStateRunning:
		return "running"
	case WorkerStateStuck:
		return "stuck"
	case WorkerStateRestarting:
		return "restarting"
	case WorkerStateFailed:
		return "failed"
	default:
		return "unknown"
	}
}

// IsHealthy returns true if the worker is in a healthy state.
func (s WorkerState) IsHealthy() bool {
	return s == WorkerStateIdle || s == WorkerStateRunning
}

// WorkerStatus provides observable state for a supervised worker.
type WorkerStatus struct {
	// Name identifies the worker.
	Name string

	// State is the current worker state.
	State WorkerState

	// LastHeartbeat is when the last heartbeat was received.
	LastHeartbeat time.Time

	// RestartCount is the number of consecutive restarts without healthy heartbeat.
	RestartCount int

	// TotalRestarts is the total number of restarts since process start.
	TotalRestarts int

	// LastError is the most recent error from the worker.
	LastError error

	// ItemsProcessed is the total items processed (from progress heartbeats).
	ItemsProcessed int64

	// StartedAt is when the worker was first started.
	StartedAt time.Time

	// LastRestartAt is when the worker was last restarted.
	LastRestartAt time.Time
}

// Uptime returns how long the worker has been running.
func (s WorkerStatus) Uptime() time.Duration {
	if s.StartedAt.IsZero() {
		return 0
	}

	return time.Since(s.StartedAt)
}

// TimeSinceLastHeartbeat returns duration since last heartbeat.
func (s WorkerStatus) TimeSinceLastHeartbeat() time.Duration {
	if s.LastHeartbeat.IsZero() {
		return 0
	}

	return time.Since(s.LastHeartbeat)
}
