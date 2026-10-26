package workerfx

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/eser/stack/pkg/ajan/logfx"
)

// isSkipError checks if an error is a worker skip signal.
func isSkipError(err error) bool {
	return errors.Is(err, ErrWorkerSkipped)
}

// Sentinel errors.
var (
	ErrWorkerPanicked = errors.New("worker panicked during execution")
)

// Runner manages the execution loop for a worker.
type Runner struct {
	worker    Worker
	logger    *logfx.Logger
	status    WorkerStatus
	mu        sync.RWMutex
	triggerCh chan struct{}
}

// NewRunner creates a new worker runner.
func NewRunner(worker Worker, logger *logfx.Logger) *Runner {
	return &Runner{ //nolint:exhaustruct
		worker: worker,
		logger: logger,
		status: WorkerStatus{ //nolint:exhaustruct
			Name:     worker.Name(),
			Interval: worker.Interval(),
		},
		triggerCh: make(chan struct{}, 1),
	}
}

// SetStateKey sets the runtime state key prefix for this worker.
func (r *Runner) SetStateKey(key string) {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.status.StateKey = key
}

// TriggerNow signals the worker to execute immediately on its next tick.
func (r *Runner) TriggerNow() {
	select {
	case r.triggerCh <- struct{}{}:
	default:
		// Already triggered, skip
	}
}

// Run starts the worker execution loop.
// Blocks until context is canceled.
func (r *Runner) Run(ctx context.Context) error {
	r.logger.InfoContext(ctx, "Starting worker",
		slog.String("worker", r.worker.Name()),
		slog.Duration("interval", r.worker.Interval()))

	// Run immediately on start
	r.executeWorker(ctx)

	// If interval is 0, run continuously without delay
	if r.worker.Interval() == 0 {
		for {
			select {
			case <-ctx.Done():
				r.logger.InfoContext(ctx, "Worker stopped",
					slog.String("worker", r.worker.Name()))

				return nil
			case <-r.triggerCh:
				r.executeWorker(ctx)
			default:
				r.executeWorker(ctx)
			}
		}
	}

	// Run with interval
	ticker := time.NewTicker(r.worker.Interval())
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			r.logger.InfoContext(ctx, "Worker stopped",
				slog.String("worker", r.worker.Name()))

			return nil
		case <-r.triggerCh:
			r.executeWorker(ctx)
		case <-ticker.C:
			r.executeWorker(ctx)
		}
	}
}

// Status returns the current worker status.
func (r *Runner) Status() WorkerStatus {
	r.mu.RLock()
	defer r.mu.RUnlock()

	return r.status
}

// executeWorker runs a single worker cycle with panic recovery.
func (r *Runner) executeWorker(ctx context.Context) { //nolint:funlen
	r.mu.Lock()
	r.status.IsRunning = true
	r.mu.Unlock()

	start := time.Now()

	defer func() {
		duration := time.Since(start)

		r.mu.Lock()
		r.status.IsRunning = false
		r.status.LastRun = start
		r.status.LastDuration = duration
		r.mu.Unlock()

		if rec := recover(); rec != nil {
			err := fmt.Errorf("%w: %v", ErrWorkerPanicked, rec)

			r.mu.Lock()
			r.status.LastError = err
			r.status.ErrorCount++
			r.mu.Unlock()

			r.logger.ErrorContext(ctx, "Worker panicked",
				slog.String("worker", r.worker.Name()),
				slog.Duration("duration", duration),
				slog.Any("panic", rec))
		}
	}()

	err := r.worker.Execute(ctx)
	duration := time.Since(start)

	r.mu.Lock()

	switch {
	case isSkipError(err):
		r.status.SkipCount++
		r.status.LastError = nil
	case err != nil:
		r.status.LastError = err
		r.status.ErrorCount++
	default:
		r.status.LastError = nil
		r.status.SuccessCount++
	}

	r.mu.Unlock()

	switch {
	case isSkipError(err):
		r.logger.DebugContext(ctx, "Worker execution skipped",
			slog.String("worker", r.worker.Name()),
			slog.Duration("duration", duration))
	case err != nil:
		r.logger.ErrorContext(ctx, "Worker execution failed",
			slog.String("worker", r.worker.Name()),
			slog.Duration("duration", duration),
			slog.Any("error", err))
	default:
		r.logger.DebugContext(ctx, "Worker execution completed",
			slog.String("worker", r.worker.Name()),
			slog.Duration("duration", duration))
	}
}
