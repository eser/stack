package httpclient

import (
	"sync"
	"sync/atomic"
	"time"
)

//go:generate go tool stringer -type CircuitState -trimprefix CircuitState
type CircuitState int32

const (
	StateClosed CircuitState = iota
	StateHalfOpen
	StateOpen
)

type CircuitBreaker struct {
	Config *CircuitBreakerConfig

	// Atomic fields for lock-free fast path reads
	state           atomic.Int32 // CircuitState
	lastFailureNano atomic.Int64 // Unix nanoseconds

	// Protected by mutex for state transitions
	failureCount         uint
	halfOpenSuccessCount uint
	mu                   sync.Mutex
}

func NewCircuitBreaker(config *CircuitBreakerConfig) *CircuitBreaker {
	cb := &CircuitBreaker{ //nolint:exhaustruct
		Config: config,
	}
	cb.state.Store(int32(StateClosed))

	return cb
}

func (cb *CircuitBreaker) IsAllowed() bool {
	state := CircuitState(cb.state.Load())

	// Fast path: Closed or HalfOpen - no lock needed
	if state == StateClosed || state == StateHalfOpen {
		return true
	}

	// StateOpen: check if reset timeout has passed (lock-free read)
	// Use nanosecond comparison to avoid time.Time allocation
	lastFailureNano := cb.lastFailureNano.Load()
	nowNano := time.Now().UnixNano()
	resetTimeoutNano := cb.Config.ResetTimeout.Nanoseconds()

	if (nowNano - lastFailureNano) <= resetTimeoutNano {
		return false
	}

	// Timeout passed - try to transition to HalfOpen
	cb.mu.Lock()
	defer cb.mu.Unlock()

	// Re-check state under lock (another goroutine may have transitioned)
	state = CircuitState(cb.state.Load())
	if state != StateOpen {
		// Already transitioned by another goroutine
		return state != StateOpen
	}

	// Re-check timeout under lock (reuse nowNano from above would be stale, get fresh)
	lastFailureNano = cb.lastFailureNano.Load()
	if (time.Now().UnixNano() - lastFailureNano) > resetTimeoutNano {
		cb.state.Store(int32(StateHalfOpen))
		cb.halfOpenSuccessCount = 0

		return true
	}

	return false
}

func (cb *CircuitBreaker) OnSuccess() {
	state := CircuitState(cb.state.Load())

	// Fast path: if closed, nothing to do
	if state == StateClosed {
		return
	}

	cb.mu.Lock()
	defer cb.mu.Unlock()

	// Re-check state under lock
	state = CircuitState(cb.state.Load())

	switch state {
	case StateHalfOpen:
		cb.halfOpenSuccessCount++
		if cb.halfOpenSuccessCount >= cb.Config.HalfOpenSuccessNeeded {
			cb.state.Store(int32(StateClosed))
			cb.failureCount = 0
		}
	case StateClosed:
		cb.failureCount = 0
	case StateOpen:
		// Success in Open state should not happen (IsAllowed returns false),
		// but if it does, do nothing and let the timeout handle the transition.
	}
}

func (cb *CircuitBreaker) OnFailure() {
	cb.mu.Lock()
	defer cb.mu.Unlock()

	cb.failureCount++
	cb.lastFailureNano.Store(time.Now().UnixNano())

	state := CircuitState(cb.state.Load())
	if state == StateHalfOpen ||
		(state == StateClosed && cb.failureCount >= cb.Config.FailureThreshold) {
		cb.state.Store(int32(StateOpen))
	}
}

func (cb *CircuitBreaker) State() CircuitState {
	return CircuitState(cb.state.Load())
}
