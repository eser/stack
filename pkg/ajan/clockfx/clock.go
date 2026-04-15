package clockfx

import "time"

// Clock is an interface for getting the current time.
// This abstraction allows for deterministic testing by injecting a test clock.
type Clock interface {
	Now() time.Time
}

// RealClock implements Clock using the system time.
type RealClock struct{}

// Now returns the current system time.
func (RealClock) Now() time.Time {
	return time.Now()
}

// NewRealClock creates a new RealClock instance.
func NewRealClock() Clock {
	return RealClock{}
}
