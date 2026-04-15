package workerfx

import (
	"context"
	"errors"
	"time"
)

// Sentinel errors.
var ErrWorkerSkipped = errors.New("worker skipped execution")

// Worker defines the interface for background workers.
type Worker interface {
	// Name returns a unique identifier for the worker.
	Name() string

	// Interval returns how often the worker should execute.
	// If zero, the worker runs continuously without delay between executions.
	Interval() time.Duration

	// Execute performs the worker's task.
	// Returns an error if the execution fails.
	Execute(ctx context.Context) error
}

// WorkerConfig holds common worker configuration.
type WorkerConfig struct {
	Enabled  bool          `conf:"enabled"  default:"true"`
	Interval time.Duration `conf:"interval" default:"15m"`
}

// WorkerStatus tracks worker execution state.
type WorkerStatus struct {
	Name         string
	StateKey     string
	Interval     time.Duration
	LastRun      time.Time
	LastDuration time.Duration
	LastError    error
	SuccessCount int64
	SkipCount    int64
	ErrorCount   int64
	IsRunning    bool
}
