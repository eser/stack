package types

import "errors"

var (
	ErrFailedToParseFloat  = errors.New("failed to parse float")
	ErrMetricIntOutOfRange = errors.New("metric int out of range")
)
