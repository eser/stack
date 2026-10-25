// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package muxfx

import "time"

// Clock is the time source the server paces screen messages with. Tests pass
// a fake one that steps time without sleeping.
type Clock interface {
	Now() time.Time
	// AfterFunc calls f once, on a goroutine of its choosing, after d. The
	// returned function cancels the call and reports whether it did so
	// before f ran.
	AfterFunc(d time.Duration, f func()) (stop func() bool)
}

// systemClock is the [Clock] of the time package.
type systemClock struct{}

func (systemClock) Now() time.Time {
	return time.Now()
}

func (systemClock) AfterFunc(d time.Duration, f func()) func() bool {
	return time.AfterFunc(d, f).Stop
}
