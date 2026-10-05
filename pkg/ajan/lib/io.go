// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package lib

import (
	"errors"
	"fmt"
	"io"
	"math"
)

// ErrReadLimitExceeded is returned by ReadAllLimited when the reader holds
// more bytes than the limit allows.
var ErrReadLimitExceeded = errors.New("read limit exceeded")

// ReadAllLimited reads r to the end like io.ReadAll, but never holds more than
// limit bytes in memory. When r has more than limit bytes it returns an error
// wrapping ErrReadLimitExceeded instead of a silently truncated result.
//
// It reads one byte past the limit to tell "exactly limit bytes" apart from
// "more than limit bytes".
func ReadAllLimited(r io.Reader, limit int64) ([]byte, error) {
	if limit < 0 {
		return nil, fmt.Errorf("read limit %d is negative; pass zero or more bytes", limit)
	}

	// limit+1 would overflow to a negative count, which LimitReader reads as
	// "nothing left", and no reader can exceed math.MaxInt64 bytes anyway.
	if limit == math.MaxInt64 {
		return io.ReadAll(r)
	}

	data, err := io.ReadAll(io.LimitReader(r, limit+1))
	if err != nil {
		return nil, err
	}

	if int64(len(data)) > limit {
		return nil, fmt.Errorf("%w: more than %d bytes", ErrReadLimitExceeded, limit)
	}

	return data, nil
}
