// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package parsingfx

import "errors"

var (
	// ErrInvalidPattern is returned when a TokenDefinition has a pattern that
	// cannot be compiled as a regular expression.
	ErrInvalidPattern = errors.New("invalid token pattern")

	// ErrUnexpectedInput is returned when Tokenize encounters input that does
	// not match any of the provided token definitions.
	ErrUnexpectedInput = errors.New("unexpected input: no token definition matched")
)
