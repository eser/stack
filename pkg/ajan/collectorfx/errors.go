// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package collectorfx

import "errors"

// Sentinel errors for the collectorfx package.
var (
	ErrInvalidIgnorePattern = errors.New("invalid ignore file pattern")
)
