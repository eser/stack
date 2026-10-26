// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package postsfx

import "errors"

// Sentinel errors for the postsfx package.
var (
	ErrNoAdaptersRegistered = errors.New("no social platform adapters registered")
	ErrAdapterNotRegistered = errors.New("adapter not registered for platform")
	ErrNilAdapter           = errors.New("adapter is nil")
	ErrScheduleNotImpl      = errors.New("schedule requires persistent scheduler")
	ErrReplyTargetRequired  = errors.New("InReplyToPost is required")
)
