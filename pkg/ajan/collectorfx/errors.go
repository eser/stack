// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package collectorfx

import "errors"

// Sentinel errors for the collectorfx package.
var (
	ErrInvalidIgnorePattern = errors.New("invalid ignore file pattern")

	// ErrUnreadableWalkRoot means the base directory of a walk does not exist
	// or cannot be read. Unreadable entries below it are skipped instead.
	ErrUnreadableWalkRoot = errors.New("walk root cannot be read")
)
