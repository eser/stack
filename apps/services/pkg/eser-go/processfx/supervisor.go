package processfx

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/eser/stack/apps/services/pkg/eser-go/logfx"
)

// heartbeatChannelBuffer is the buffer size for the heartbeat channel.
// Buffered to prevent blocking the worker when heartbeats are sent.
const heartbeatChannelBuffer = 10

// SupervisorMetrics defines the interface for recording supervisor metrics.
type SupervisorMetrics interface {
	RecordWorkerHeartbeat(workerName string)
	RecordWorkerRestart(workerName string)
	RecordWorkerStuck(workerName string)
	RecordWorkerFailed(workerName string)
}

// NoopSupervisorMetrics is a no-op implementation of SupervisorMetrics.
type NoopSupervisorMetrics struct{}

func (NoopSupervisorMetrics) RecordWorkerHeartbeat(_ string) {}
func (NoopSupervisorMetrics) RecordWorkerRestart(_ string)   {}
func (NoopSupervisorMetrics) RecordWorkerStuck(_ string)     {}
func (NoopSupervisorMetrics) RecordWorkerFailed(_ string)    {}

// WorkerFunc is the function signature for supervised workers.
// The worker receives a context and heartbeat sender, and should return
// when the context is cancelled or an unrecoverable error occurs.
type WorkerFunc func(ctx context.Context, hb HeartbeatSender) error

// Supervisor monitors and restarts unhealthy workers based on heartbeat signals.
type Supervisor struct {
	config     SupervisedWorkerConfig
	heartbeats chan Heartbeat
	status     WorkerStatus
	statusMux  sync.RWMutex
	logger     *logfx.Logger
	metrics    SupervisorMetrics

	// Worker factory for restart.
	workerFn WorkerFunc
	cancelFn context.CancelFunc
}

// NewSupervisor creates a new worker supervisor.
func NewSupervisor(
	config SupervisedWorkerConfig,
	logger *logfx.Logger,
	metrics SupervisorMetrics,
) *Supervisor {
	if metrics == nil {
		metrics = NoopSupervisorMetrics{}
	}

	return &Supervisor{
		config:     config,
		heartbeats: make(chan Heartbeat, heartbeatChannelBuffer),
		status: WorkerStatus{ //nolint:exhaustruct
			Name:  config.Name,
			State: WorkerStateIdle,
		},
		statusMux: sync.RWMutex{},
		logger:    logger,
		metrics:   metrics,
		workerFn:  nil,
		cancelFn:  nil,
	}
}

// Run starts the supervisor loop. It will start the worker and monitor
// for heartbeats. If no heartbeat is received within the timeout, the
// worker is considered stuck and will be restarted.
//
// Run blocks until the context is cancelled or the worker exceeds max restarts.
func (s *Supervisor) Run(ctx context.Context, workerFn WorkerFunc) error { //nolint:cyclop,funlen
	err := s.config.Validate()
	if err != nil {
		return fmt.Errorf("invalid supervisor config: %w", err)
	}

	s.workerFn = workerFn

	// Initialize status.
	s.statusMux.Lock()
	s.status.StartedAt = time.Now()
	s.statusMux.Unlock()

	// Start worker initially.
	s.startWorker(ctx)

	backoff := s.config.BackoffInitial

	for {
		select {
		case <-ctx.Done():
			s.stopWorker()

			return fmt.Errorf("supervisor context canceled: %w", ctx.Err())

		case hb := <-s.heartbeats:
			// Worker is alive.
			s.statusMux.Lock()
			s.status.LastHeartbeat = hb.Timestamp
			s.status.ItemsProcessed += hb.Progress
			s.status.State = WorkerStateRunning
			s.status.RestartCount = 0         // Reset on healthy heartbeat
			backoff = s.config.BackoffInitial // Reset backoff
			s.statusMux.Unlock()

			s.metrics.RecordWorkerHeartbeat(s.config.Name)

		case <-time.After(s.config.HeartbeatTimeout):
			// No heartbeat received - worker might be stuck!
			s.statusMux.Lock()
			s.status.State = WorkerStateStuck
			s.status.RestartCount++
			s.status.TotalRestarts++
			restartCount := s.status.RestartCount
			s.statusMux.Unlock()

			s.metrics.RecordWorkerStuck(s.config.Name)

			if s.logger != nil {
				s.logger.WarnContext(ctx, "Worker stuck, no heartbeat received",
					"worker", s.config.Name,
					"timeout", s.config.HeartbeatTimeout,
					"restart_count", restartCount,
					"max_restarts", s.config.MaxRestarts,
				)
			}

			if restartCount > s.config.MaxRestarts {
				s.statusMux.Lock()
				s.status.State = WorkerStateFailed
				s.statusMux.Unlock()

				s.metrics.RecordWorkerFailed(s.config.Name)

				if s.logger != nil {
					s.logger.ErrorContext(ctx, "Worker exceeded max restarts, giving up",
						"worker", s.config.Name,
						"max_restarts", s.config.MaxRestarts,
						"total_restarts", s.status.TotalRestarts,
					)
				}

				return ErrMaxRestartsExceeded
			}

			// Restart with backoff.
			if s.logger != nil {
				s.logger.InfoContext(ctx, "Restarting worker",
					"worker", s.config.Name,
					"backoff", backoff,
					"restart_count", restartCount,
				)
			}

			s.statusMux.Lock()
			s.status.State = WorkerStateRestarting
			s.status.LastRestartAt = time.Now()
			s.statusMux.Unlock()

			s.stopWorker()

			// Wait for backoff duration.
			select {
			case <-ctx.Done():
				return fmt.Errorf("supervisor backoff canceled: %w", ctx.Err())
			case <-time.After(backoff):
			}

			s.startWorker(ctx)
			s.metrics.RecordWorkerRestart(s.config.Name)

			// Exponential backoff.
			backoff = min(
				time.Duration(float64(backoff)*s.config.BackoffMultiplier),
				s.config.BackoffMax,
			)
		}
	}
}

// startWorker starts the worker in a new goroutine with its own cancellable context.
func (s *Supervisor) startWorker(ctx context.Context) {
	workerCtx, cancel := context.WithCancel(ctx)
	s.cancelFn = cancel

	sender := NewHeartbeatSender(s.heartbeats, s.config.Name)

	// Inject heartbeat sender into context for workers to access.
	workerCtx = ContextWithHeartbeat(workerCtx, sender)

	go func() {
		defer func() {
			if recovered := recover(); recovered != nil {
				s.statusMux.Lock()
				s.status.LastError = fmt.Errorf("%w: %v", ErrWorkerPanicked, recovered)
				s.statusMux.Unlock()

				if s.logger != nil {
					s.logger.ErrorContext(ctx, "Worker panicked",
						"worker", s.config.Name,
						"panic", recovered,
					)
				}
			}
		}()

		err := s.workerFn(workerCtx, sender)
		if err != nil && !errors.Is(err, context.Canceled) {
			s.statusMux.Lock()
			s.status.LastError = err
			s.statusMux.Unlock()

			if s.logger != nil {
				s.logger.ErrorContext(ctx, "Worker exited with error",
					"worker", s.config.Name,
					"error", err,
				)
			}
		}
	}()
}

// stopWorker cancels the worker's context, signaling it to stop.
func (s *Supervisor) stopWorker() {
	if s.cancelFn != nil {
		s.cancelFn()
		s.cancelFn = nil
	}
}

// Status returns the current worker status.
// This is safe to call concurrently.
func (s *Supervisor) Status() WorkerStatus {
	s.statusMux.RLock()
	defer s.statusMux.RUnlock()

	// Return a copy to prevent races.
	return WorkerStatus{
		Name:           s.status.Name,
		State:          s.status.State,
		LastHeartbeat:  s.status.LastHeartbeat,
		RestartCount:   s.status.RestartCount,
		TotalRestarts:  s.status.TotalRestarts,
		LastError:      s.status.LastError,
		ItemsProcessed: s.status.ItemsProcessed,
		StartedAt:      s.status.StartedAt,
		LastRestartAt:  s.status.LastRestartAt,
	}
}

// Name returns the worker name.
func (s *Supervisor) Name() string {
	return s.config.Name
}

// IsHealthy returns true if the worker is in a healthy state.
func (s *Supervisor) IsHealthy() bool {
	s.statusMux.RLock()
	defer s.statusMux.RUnlock()

	return s.status.State.IsHealthy()
}
