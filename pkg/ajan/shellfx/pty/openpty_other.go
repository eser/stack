// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !windows && !wasip1 && !linux && !darwin

package pty

import (
	"errors"
	"fmt"
	"os"
	"runtime"
)

// errNoOpenPTY is returned on a Unix system this package has no
// pseudo-terminal opener for.
var errNoOpenPTY = errors.New("pty: opening a pseudo-terminal is implemented for linux and darwin only")

func openPTY(_, _ int) (*os.File, *os.File, error) {
	return nil, nil, fmt.Errorf("%w (running on %s)", errNoOpenPTY, runtime.GOOS)
}
